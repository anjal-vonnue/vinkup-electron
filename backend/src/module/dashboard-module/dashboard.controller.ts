import type { Request, Response, NextFunction } from 'express';
import type {
  CourseDaysResponse,
  DashboardResponse,
  CourseCertificate,
  ReworkTaskSummary,
} from '@itp/types';
import type { AuthenticatedRequest } from '../../types/auth.types';
import type { CourseIdParams } from './dashboard.schema';
import { DashboardService } from './dashboard.service';
import { CertificateService } from './certificate.service';

const dashboardService = new DashboardService();
const certificateService = new CertificateService();

class DashboardController {
  getDashboard = async (req: Request, res: Response<DashboardResponse>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      const dashboard = await dashboardService.getDashboard(traineeId);
      res.status(200).json(dashboard);
    } catch (error) {
      next(error);
    }
  };

  getCourseDays = async (req: Request, res: Response<CourseDaysResponse>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      const { courseId } = req.params as CourseIdParams; // checked by validate()
      const days = await dashboardService.getCourseDays(traineeId, courseId);
      res.status(200).json(days);
    } catch (error) {
      next(error);
    }
  };

  getCourseCertificate = async (
    req: Request,
    res: Response<CourseCertificate>,
    next: NextFunction
  ) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      const { courseId } = req.params as CourseIdParams;
      res.status(200).json(await certificateService.getCourseCertificate(traineeId, courseId));
    } catch (error) {
      next(error);
    }
  };

  getReworkTasks = async (
    req: Request,
    res: Response<ReworkTaskSummary[]>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      const reworkTasks = await dashboardService.getReworkTasks(traineeId);
      res.status(200).json(reworkTasks);
    } catch (error) {
      next(error);
    }
  };
}

export const dashboardController = new DashboardController();
