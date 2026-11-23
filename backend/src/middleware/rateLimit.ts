import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';

type RateLimitOptions = {
  windowMs: number;
  max: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export function createRateLimit({ windowMs, max }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= max) {
      return next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.'));
    }

    bucket.count += 1;
    next();
  };
}
