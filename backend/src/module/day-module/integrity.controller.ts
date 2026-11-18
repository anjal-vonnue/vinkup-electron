import type { Request, Response, NextFunction } from 'express';
import type { DayIntegrityResponse } from '@itp/types';
import { integrityService } from './integrity.service.js';

export const integrityController = {
  getDayIntegrity: async (
    req: Request,
    res: Response<DayIntegrityResponse>,
    next: NextFunction
  ) => {
    try {
      const traineeId = req.user!.id; // always from the session (rule 3)
      const { dayId } = req.params as { dayId?: string };

      const integrity = await integrityService.getDayIntegrity(traineeId, dayId!);

      res.status(200).json(integrity);
    } catch (error) {
      next(error);
    }
  },
};
