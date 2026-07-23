import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const SECRET = process.env.API_KEY_SECRET || 'dev-secret-change-me';

export interface SessionPayload {
  sessionHash: string;
  startedAt: number;
}

export function signSession(sessionHash: string): string {
  const payload: SessionPayload = {
    sessionHash,
    startedAt: Date.now(),
  };
  return jwt.sign(payload, SECRET, { expiresIn: '2h' });
}

export function verifySession(token: string): SessionPayload {
  return jwt.verify(token, SECRET) as SessionPayload;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }
  try {
    req.session = verifySession(auth.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

declare global {
  namespace Express {
    interface Request {
      session?: SessionPayload;
    }
  }
}
