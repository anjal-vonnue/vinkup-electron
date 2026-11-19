import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  requireAuth,
  requireManager,
  requireMentor,
  requireTrainee,
} from '../../middleware/authMiddleware';
import { ForbiddenError } from '../../errors/AppError';
import type { AuthenticatedRequest } from '../../types/auth.types';
import { realtimeController } from './realtime.controller';

const realtimeRoutes = Router();

/**
 * `requireAuth` already verified the JWT. Running the role guard on top of it
 * keeps the same rule as the REST routes: a deactivated account's stream is
 * refused too, not only its data requests.
 */
function requireActiveAccount(req: Request, res: Response, next: NextFunction): void {
  const { role } = (req as AuthenticatedRequest).user;

  if (role === 'trainee') requireTrainee(req, res, next);
  else if (role === 'mentor') requireMentor(req, res, next);
  else if (role === 'manager') requireManager(req, res, next);
  else next(new ForbiddenError());
}

/** Mounted at /api/events. */
realtimeRoutes.get('/', requireAuth, requireActiveAccount, realtimeController.stream);

export default realtimeRoutes;
