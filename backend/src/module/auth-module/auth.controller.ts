import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../types/auth.types.js';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_CLEAR_OPTIONS } from './auth.constants.js';

import type { MeResponse } from '@itp/types';

class AuthController {
  me = (req: Request, res: Response<MeResponse>, next: NextFunction) => {
    try {
      const trainee = (req as AuthenticatedRequest).user;
      res.status(200).json({
        id: trainee.id,
        email: trainee.email,
        name: trainee.name,
        role: trainee.role,
      });
    } catch (error) {
      next(error);
    }
  };

  logout = (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.clearCookie(AUTH_COOKIE_NAME, AUTH_COOKIE_CLEAR_OPTIONS);
      res.status(200).json({ message: 'Logged out' });
    } catch (error) {
      next(error);
    }
  };
}

export const authController = new AuthController();
