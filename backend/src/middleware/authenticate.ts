import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../services/auth.service';
import { HttpError } from './httpError';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  if (!token) {
    next(new HttpError(401, 'UNAUTHORIZED', 'Missing bearer token.'));
    return;
  }
  try {
    req.userId = verifyToken(token).userId;
    next();
  } catch {
    next(new HttpError(401, 'UNAUTHORIZED', 'Invalid or expired token.'));
  }
}
