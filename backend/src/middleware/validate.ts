// src/middleware/validate.ts
import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';
import { ValidationError } from '../errors/AppError.js';

type Schemas = {
  body?: ZodType;
  params?: ZodType;
};

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) return next(new ValidationError(result.error.issues));
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) return next(new ValidationError(result.error.issues));
      req.body = result.data; // cleaned data (unknown fields removed)
    }

    next();
  };
}
