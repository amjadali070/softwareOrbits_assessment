import type { ErrorRequestHandler } from 'express';
import { HttpError } from './httpError';

// Centralized so every route — frontend, partner, or future additions — returns errors in the
// same JSON shape, regardless of whether they came from validation, business rules, or a bug.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
  });
};
