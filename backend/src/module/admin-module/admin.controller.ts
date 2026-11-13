import type { NextFunction, Request, Response } from 'express';
import type {
  AdminAnalytics,
  AdminFlagEvent,
  AdminTaskCode,
  AdminTraineeDetail,
  AdminTraineeSummary,
} from '@itp/types';
import { AdminService } from './admin.service';
import { analyticsQuerySchema, CreateTraineeBody } from './admin.schema';
import { AuthenticatedRequest } from '../../types/auth.types';
import { ValidationError } from '../../errors/AppError';

const adminService = new AdminService();

class AdminController {
  listTrainees = async (
    _req: Request,
    res: Response<AdminTraineeSummary[]>,
    next: NextFunction
  ) => {
    try {
      res.status(200).json(await adminService.listTrainees());
    } catch (error) {
      next(error);
    }
  };

  getTrainee = async (req: Request, res: Response<AdminTraineeDetail>, next: NextFunction) => {
    try {
      const { traineeId } = req.params as { traineeId: string };
      res.status(200).json(await adminService.getTraineeDetail(traineeId));
    } catch (error) {
      next(error);
    }
  };

  listFlags = async (req: Request, res: Response<AdminFlagEvent[]>, next: NextFunction) => {
    try {
      const { traineeId } = req.params as { traineeId: string };
      res.status(200).json(await adminService.listFlags(traineeId));
    } catch (error) {
      next(error);
    }
  };

  getTaskCode = async (req: Request, res: Response<AdminTaskCode>, next: NextFunction) => {
    try {
      const { traineeId, taskId } = req.params as { traineeId: string; taskId: string };
      res.status(200).json(await adminService.getTaskCode(traineeId, taskId));
    } catch (error) {
      next(error);
    }
  };

  createTrainee = async (req: Request, res: Response<AdminTraineeSummary>, next: NextFunction) => {
    try {
      const adminId = (req as AuthenticatedRequest).user.id;
      const trainee = await adminService.createTrainee(req.body as CreateTraineeBody, adminId);
      res.status(201).json(trainee);
    } catch (error) {
      next(error);
    }
  };

  getAnalytics = async (req: Request, res: Response<AdminAnalytics>, next: NextFunction) => {
    try {
      // Never trust the query string: check dates, period length and traineeId first.
      const query = analyticsQuerySchema.safeParse(req.query);
      if (!query.success) throw new ValidationError(query.error.issues);
      res.status(200).json(await adminService.getAnalytics(query.data));
    } catch (error) {
      next(error);
    }
  };
}

export const adminController = new AdminController();
