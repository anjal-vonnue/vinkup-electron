import type { Request, Response, NextFunction } from 'express';
import type { CompleteDayResponse, DayContent, DayCurrentStatus } from '@itp/types';
import type { AuthenticatedRequest } from '../../types/auth.types.js';
import { dayService } from './day.services.js';

export const dayController = {
  getDay: async (req: Request, res: Response<DayContent>, next: NextFunction) => {
    try {
      const { dayId } = req.params as { dayId: string };
      res.status(200).json(await dayService.getDayContent(dayId));
    } catch (error) {
      next(error);
    }
  },

  getStatus: async (req: Request, res: Response<DayCurrentStatus>, next: NextFunction) => {
    try {
      const { id: traineeId } = (req as AuthenticatedRequest).user;
      const { dayId } = req.params as { dayId: string };
      res.status(200).json(await dayService.getDayStatus(traineeId, dayId));
    } catch (error) {
      next(error);
    }
  },

  completeDay: async (req: Request, res: Response<CompleteDayResponse>, next: NextFunction) => {
    try {
      const { id: traineeId } = (req as AuthenticatedRequest).user;
      const { dayId } = req.params as { dayId: string };
      res.status(200).json(await dayService.completeDay(traineeId, dayId));
    } catch (error) {
      next(error);
    }
  },

  completeDayStatus: async (req: Request, res: Response<DayCurrentStatus>, next: NextFunction) => {
    try {
      const { id: traineeId } = (req as AuthenticatedRequest).user;
      const { dayId } = req.params as { dayId: string };
      const result = await dayService.completeDay(traineeId, dayId);
      res.status(200).json(result.status);
    } catch (error) {
      next(error);
    }
  },
};
