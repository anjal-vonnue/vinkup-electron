import type { NextFunction, Request, Response } from 'express';
import type {
  AdminAnalytics,
  AdminFlagEvent,
  AdminTaskCode,
  AdminTraineeDetail,
  AdminTraineeSummary,
  MentorSlackChannelResponse,
} from '@itp/types';
import { AdminService } from './admin.service';
import { analyticsQuerySchema, CreateTraineeBody, SaveSlackChannelBody } from './admin.schema';
import { AuthenticatedRequest } from '../../types/auth.types';
import { ValidationError } from '../../errors/AppError';

const adminService = new AdminService();

class AdminController {
  listTrainees = async (req: Request, res: Response<AdminTraineeSummary[]>, next: NextFunction) => {
    try {
      const mentorId = (req as AuthenticatedRequest).user.id;
      res.status(200).json(await adminService.listTrainees(mentorId));
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
      const mentorId = (req as AuthenticatedRequest).user.id;
      // Never trust the query string: check dates, period length and traineeId first.
      const query = analyticsQuerySchema.safeParse(req.query);
      if (!query.success) throw new ValidationError(query.error.issues);
      res.status(200).json(await adminService.getAnalytics(query.data, mentorId));
    } catch (error) {
      next(error);
    }
  };

  getSlackChannel = async (
    req: Request,
    res: Response<MentorSlackChannelResponse>,
    next: NextFunction
  ) => {
    try {
      const mentorId = (req as AuthenticatedRequest).user.id;
      res.status(200).json(await adminService.getSlackChannel(mentorId));
    } catch (error) {
      next(error);
    }
  };

  saveSlackChannel = async (
    req: Request,
    res: Response<MentorSlackChannelResponse>,
    next: NextFunction
  ) => {
    try {
      const mentorId = (req as AuthenticatedRequest).user.id;
      const channel = await adminService.saveSlackChannel(
        mentorId,
        req.body as SaveSlackChannelBody
      );
      res.status(200).json(channel);
    } catch (error) {
      next(error);
    }
  };

  deleteSlackChannel = async (
    req: Request,
    res: Response<MentorSlackChannelResponse>,
    next: NextFunction
  ) => {
    try {
      const mentorId = (req as AuthenticatedRequest).user.id;
      res.status(200).json(await adminService.deleteSlackChannel(mentorId));
    } catch (error) {
      next(error);
    }
  };
}

export const adminController = new AdminController();
