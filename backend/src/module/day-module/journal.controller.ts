import type { Request, Response, NextFunction } from 'express';
import type { DayJournal, JournalListResponse, SaveJournalRequest } from '@itp/types';
import type { AuthenticatedRequest } from '../../types/auth.types.js';
import { journalService } from './journal.services.js';

export const journalController = {
  listJournal: async (req: Request, res: Response<JournalListResponse>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      const response = await journalService.listJournalEntries(traineeId);
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },

  getJournal: async (req: Request, res: Response<DayJournal>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id; // requireAuth guarantees req.user exists
      const { dayId } = (req as AuthenticatedRequest).params;

      const journal = await journalService.getJournal(traineeId, dayId as string);

      res.status(200).json(journal);
    } catch (error) {
      next(error);
    }
  },

  saveJournal: async (req: Request, res: Response<DayJournal>, next: NextFunction) => {
    try {
      const traineeId = req.user!.id;
      const { dayId } = (req as AuthenticatedRequest).params;
      const body = req.body as SaveJournalRequest; // safe: validate() already checked it

      const journal = await journalService.saveJournal(
        traineeId,
        dayId as string,
        body.responseText
      );

      res.status(200).json(journal);
    } catch (error) {
      next(error);
    }
  },
};
