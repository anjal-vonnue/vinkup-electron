import type { NextFunction, Request, Response } from 'express';
import type { ActivityTimeBodyType } from './activity.schema.js';
import type { AuthenticatedRequest } from '../../types/auth.types.js';
import { ActivityService } from './activity.service.js';
import type { ActivityTimeDay } from '@itp/types';
import { activityTimeQuerySchema } from './activity.schema.js';
import { ValidationError } from '../../errors/AppError.js';

const activityService = new ActivityService();

class ActivityController {
  addTime = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id; // from the session, never the body
      await activityService.addTime(traineeId, req.body as ActivityTimeBodyType);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };

  listTime = async (req: Request, res: Response<ActivityTimeDay[]>, next: NextFunction) => {
    try {
      const query = activityTimeQuerySchema.safeParse(req.query);
      if (!query.success) throw new ValidationError(query.error.issues);
      const traineeId = (req as AuthenticatedRequest).user.id;
      res.status(200).json(await activityService.listTime(traineeId, query.data.days));
    } catch (error) {
      next(error);
    }
  };
}

export const activityController = new ActivityController();
