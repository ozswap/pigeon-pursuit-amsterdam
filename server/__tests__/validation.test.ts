import { sanitizeUsername, validateScore } from '../src/middleware/validation.js';
import { signSession, verifySession } from '../src/middleware/jwt.js';

process.env.API_KEY_SECRET = 'test-secret';

describe('sanitizeUsername', () => {
  it('accepts valid usernames', () => {
    expect(sanitizeUsername('RetroRider99')).toBe('RetroRider99');
  });

  it('rejects short names', () => {
    expect(sanitizeUsername('a')).toBeNull();
  });

  it('truncates to 16 chars', () => {
    expect(sanitizeUsername('VeryLongUsernameHere123')).toBe('VeryLongUsername');
  });
});

describe('validateScore', () => {
  it('rejects implausible score rate', () => {
    const startedAt = Date.now() - 10_000;
    expect(validateScore(10000, startedAt, 5, 3)).toBe('Score rejected: implausible rate');
  });

  it('accepts reasonable scores', () => {
    const startedAt = Date.now() - 120_000;
    expect(validateScore(5000, startedAt, 5, 2)).toBeNull();
  });
});

describe('JWT session', () => {
  it('signs and verifies session', () => {
    const token = signSession('abc123');
    const payload = verifySession(token);
    expect(payload.sessionHash).toBe('abc123');
    expect(payload.startedAt).toBeLessThanOrEqual(Date.now());
  });
});
