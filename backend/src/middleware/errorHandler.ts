// src/middleware/errorHandler.ts
import type { Request, Response, NextFunction } from 'express';
import type { ApiErrorResponse } from '@itp/types';
import { AppError } from '../errors/AppError.js';

/**
 * express.json() rejects a body over its limit or with broken JSON before any route runs. Those
 * are the client's fault, so answer 400 (the frontend shows the message and doesn't retry)
 * instead of falling through to 500.
 */
function toBodyParserError(error: unknown): AppError | null {
  const { type, status, expose } = (error ?? {}) as {
    type?: unknown;
    status?: unknown;
    expose?: unknown;
  };
  if (type === 'entity.too.large') {
    return new AppError(400, 'VALIDATION_FAILED', 'The request is too large (5 MB max).');
  }
  if (type === 'entity.parse.failed') {
    return new AppError(400, 'VALIDATION_FAILED', 'The request body is not valid JSON.');
  }
  // Any other body-parser rejection (unsupported charset or encoding, aborted request)
  const isClientError = typeof status === 'number' && status >= 400 && status < 500;
  if (typeof type === 'string' && expose === true && isClientError) {
    return new AppError(400, 'VALIDATION_FAILED', 'The request could not be read.');
  }
  return null;
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response<ApiErrorResponse>,
  _next: NextFunction
) {
  // One of our errors → send its status and code
  const appError = error instanceof AppError ? error : toBodyParserError(error);
  if (appError) {
    res.status(appError.statusCode).json({
      error: { code: appError.code, message: appError.message, details: appError.details },
    });
    return;
  }

  // Anything else is a bug → log it, but never send internal details to the trainee (TRD §10.2)
  console.error(error);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  });
}
