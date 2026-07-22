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

  // express.json() throws a SyntaxError with a 4xx status for malformed request bodies — treat
  // that (and anything else shaped the same way) as a client error, not a server fault.
  const status =
    (err as { status?: unknown; statusCode?: unknown })?.status ??
    (err as { statusCode?: unknown })?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({
      error: { code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'Bad request.' },
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
  });
};
