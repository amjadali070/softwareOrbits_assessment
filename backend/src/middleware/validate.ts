import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { HttpError } from './httpError';

// Shared by every route that accepts a body — the frontend and partner reservation routes both
// use this with the same schema, so "malformed input" is rejected identically on both paths.
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(
        new HttpError(400, 'INVALID_INPUT', 'Request body failed validation.', {
          issues: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        }),
      );
      return;
    }
    req.body = result.data;
    next();
  };
}
