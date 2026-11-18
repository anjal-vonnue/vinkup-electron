import type { NextFunction, Request, Response } from 'express';
import { AuthenticatedRequest } from '../../types/auth.types.js';
import { FlagService } from './flag.service.js';
import { LogFlagType } from './flag.schema.js';

const flagService = new FlagService();
class FlagController {
  logflag = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const trainee_id = (req as AuthenticatedRequest).user.id;
      const { taskId } = req.params as { taskId: string };
      await flagService.logFlag(req.body as LogFlagType, trainee_id, taskId);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  };
}

export const flagController = new FlagController();
