import { Router } from 'express';
import { randomBytes } from 'crypto';
import { signSession, authMiddleware } from '../middleware/jwt.js';
import { sanitizeUsername, validateScore } from '../middleware/validation.js';
import { addLeaderboardEntry, getTopScores } from '../leaderboardStore.js';

const router = Router();

router.post('/session', (_req, res) => {
  const sessionHash = randomBytes(16).toString('hex');
  const token = signSession(sessionHash);
  res.json({ token, session_hash: sessionHash });
});

router.post('/scores', authMiddleware, (req, res) => {
  const { username, score, pastries_saved, level_reached, session_hash } = req.body;
  const session = req.session!;

  if (session_hash !== session.sessionHash) {
    res.status(403).json({ error: 'Session mismatch' });
    return;
  }

  const cleanName = sanitizeUsername(username ?? '');
  if (!cleanName) {
    res.status(400).json({ error: 'Invalid username' });
    return;
  }

  const validationError = validateScore(score, session.startedAt, pastries_saved, level_reached);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const rank = addLeaderboardEntry(cleanName, score, pastries_saved, level_reached);
  res.status(201).json({ rank });
});

router.get('/scores/top', (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '10'), 10) || 10, 100);
  const timeframe = String(req.query.timeframe ?? 'all');
  res.json(getTopScores(limit, timeframe));
});

router.post('/telemetry', (req, res) => {
  const { event, payload } = req.body;
  if (!event || typeof event !== 'string') {
    res.status(400).json({ error: 'Invalid event' });
    return;
  }
  console.log('[telemetry]', event, payload ?? {});
  res.status(204).end();
});

export default router;
