import type { NextFunction, Request, Response } from 'express';
import { CheckpointActiveError } from '../../errors/AppError';
import type { AuthenticatedRequest } from '../../types/auth.types';
import { CheckpointRepository } from './checkpoint.repository';

const repository = new CheckpointRepository();

/**
 * Blocks every non-checkpoint trainee module while an attempt is running.
 * The frontend also hides navigation, but this is the authorization boundary:
 * a typed URL or a direct API call still cannot reach the dashboard/courses.
 */
export function blockDuringActiveCheckpoint(
  request: Request,
  _response: Response,
  next: NextFunction
): void {
  const user = (request as AuthenticatedRequest).user;
  if (!user || user.role !== 'trainee') {
    next();
    return;
  }

  repository
    .findActiveAttemptWithCheckpoint(user.id)
    .then((attempt) => {
      if (attempt && attempt.deadline_at.getTime() > Date.now()) {
        next(
          new CheckpointActiveError({
            attemptId: attempt.id,
            checkpointId: attempt.checkpoint_id,
          })
        );
        return;
      }
      next();
    })
    .catch(next);
}
