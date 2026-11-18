import type { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../errors/AppError.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  // Catch any unhandled URL string and push your custom NotFoundError into the pipeline
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found.`));
}
