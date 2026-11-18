import type { Request, Response, NextFunction } from 'express';
import type { TypingResultRecord, TypingStats } from '@itp/types';
import type { AuthenticatedRequest } from '../../types/auth.types.js';
import type { SaveTypingResultBody } from './typing.schema.js';
import { TypingService } from './typing.service.js';

const typingService = new TypingService();

class TypingController {
  createResult = async (req: Request, res: Response<TypingResultRecord>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      const { wpm, accuracy } = req.body as SaveTypingResultBody;
      res.status(201).json(await typingService.createResult(traineeId, wpm, accuracy));
    } catch (error) {
      next(error);
    }
  };

  getResults = async (req: Request, res: Response<TypingResultRecord[]>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      res.status(200).json(await typingService.getResults(traineeId));
    } catch (error) {
      next(error);
    }
  };

  getStats = async (req: Request, res: Response<TypingStats>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      res.status(200).json(await typingService.getStats(traineeId));
    } catch (error) {
      next(error);
    }
  };
}

export const typingController = new TypingController();
