import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { HttpError } from './httpError';

export function partnerAuth(req: Request, _res: Response, next: NextFunction) {
  const apiKey = req.header('x-api-key');
  if (!apiKey || apiKey !== env.partnerApiKey) {
    next(new HttpError(401, 'UNAUTHORIZED', 'Missing or invalid partner API key.'));
    return;
  }
  next();
}
