import { Router, type Request, type Response, type NextFunction } from 'express';
import { URLSearchParams } from 'url';
import passport from './passport.js';
import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { signJwt } from '../../utils/jwt.js';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS, AUTH_COOKIE_MAX_AGE_MS } from './auth.constants.js';
import { authController } from './auth.controller.js';
import { requireAuth } from '../../middleware/authMiddleware.js';

const authRoutes = Router();

authRoutes.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
    session: false,
  }) as RequestHandler
);

authRoutes.get('/google/callback', (req: Request, res: Response, next: NextFunction) => {
  const authenticateCallback: RequestHandler = passport.authenticate(
    'google',
    { session: false },
    (error: unknown, user: Express.User | false, info?: { message?: string; email?: string }) => {
      if (error) return next(error);

      if (!user) {
        const params = new URLSearchParams({
          error: info?.message ?? 'LOGIN_FAILED',
          email: info?.email ?? '',
        });

        return res.redirect(`${env.FRONTEND_URL}/login?${params.toString()}`);
      }
      const role =
        user.role === 'manager' ? 'manager' : user.role === 'trainee' ? 'trainee' : 'mentor';
      const token = signJwt({ id: user.id, name: user.name, email: user.email, role });

      res.cookie(AUTH_COOKIE_NAME, token, {
        ...AUTH_COOKIE_OPTIONS,
        maxAge: AUTH_COOKIE_MAX_AGE_MS, //7 days should keep in sync with JWT_EXPIRES_IN
      });
      const redirectUrl =
        role === 'trainee'
          ? env.FRONTEND_URL
          : `${env.FRONTEND_URL}${role === 'manager' ? '/manager' : '/admin'}`;
      res.redirect(redirectUrl);
    }
  ) as RequestHandler;

  authenticateCallback(req, res, next);
});

authRoutes.post('/logout', requireAuth, authController.logout);
authRoutes.get('/me', requireAuth, authController.me);

export default authRoutes;
