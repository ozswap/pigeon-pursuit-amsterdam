import { Router } from 'express';
import { randomBytes } from 'crypto';
import { signSession, authMiddleware } from '../middleware/jwt.js';
import { sanitizeUsername, validateScore } from '../middleware/validation.js';
import { pool } from '../db/pool.js';

const router = Router();

router.post('/session', (_req, res) => {
  const sessionHash = randomBytes(16).toString('hex');
  const token = signSession(sessionHash);
  res.json({ token, session_hash: sessionHash });
});

router.post('/scores', authMiddleware, async (req, res) => {
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

  try {
    await pool.query(
      `INSERT INTO global_leaderboard (username, score, pastries, level_reached)
       VALUES ($1, $2, $3, $4)`,
      [cleanName, score, pastries_saved, level_reached]
    );

    const rankResult = await pool.query(
      `SELECT COUNT(*) + 1 AS rank FROM global_leaderboard WHERE score > $1`,
      [score]
    );

    res.status(201).json({ rank: parseInt(rankResult.rows[0].rank, 10) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/scores/top', async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '10'), 10) || 10, 100);
  const timeframe = String(req.query.timeframe ?? 'all');

  let timeFilter = '';
  if (timeframe === 'weekly') {
    timeFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
  } else if (timeframe === 'monthly') {
    timeFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
  }

  try {
    const result = await pool.query(
      `SELECT username, score, pastries, level_reached, created_at
       FROM global_leaderboard
       WHERE TRUE ${timeFilter}
       ORDER BY score DESC, created_at ASC
       LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/telemetry', async (req, res) => {
  const { event, payload } = req.body;
  if (!event || typeof event !== 'string') {
    res.status(400).json({ error: 'Invalid event' });
    return;
  }
  try {
    await pool.query(
      'INSERT INTO telemetry_events (event_name, payload) VALUES ($1, $2)',
      [event, payload ?? {}]
    );
    res.status(204).end();
  } catch {
    res.status(204).end();
  }
});

export default router;
