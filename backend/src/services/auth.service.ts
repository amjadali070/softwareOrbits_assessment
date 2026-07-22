import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type TokenPayload = { userId: string };

// Deliberately minimal per the brief ("minimal JWT/session flow"): no password, no user
// database. userId stays self-declared (see README assumptions) — what changes is that once
// issued, a token cryptographically asserts that identity for subsequent requests instead of
// the server just trusting whatever userId a request body claims.
export function signToken(userId: string): string {
  return jwt.sign({ userId } satisfies TokenPayload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwtSecret) as TokenPayload;
}
