import type { Request, Response, NextFunction } from 'express';
import type { DayTask } from '@itp/types';
import type { AuthenticatedRequest } from '../../types/auth.types.js';
import { dayTasksService } from './day-tasks.services.js';

export const dayTasksController = {
  getDayTasks: async (req: Request, res: Response<DayTask[]>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id; // requireAuth guarantees req.user exists
      const { dayId } = (req as AuthenticatedRequest).params;

      const tasks = await dayTasksService.getDayTasks(traineeId, dayId as string);

      res.status(200).json(tasks);
    } catch (error) {
      next(error);
    }
  },
};
