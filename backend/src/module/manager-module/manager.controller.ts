import type { NextFunction, Request, Response } from 'express';
import type { ManagerStaffMember, ManagerTrainee } from '@itp/types';
import type { AuthenticatedRequest } from '../../types/auth.types';
import { ManagerService } from './manager.service';
import type { AssignMentorBody } from './manager.schema';

const managerService = new ManagerService();

class ManagerController {
  listStaff = async (_req: Request, res: Response<ManagerStaffMember[]>, next: NextFunction) => {
    try {
      res.status(200).json(await managerService.listStaff());
    } catch (error) {
      next(error);
    }
  };

  listTrainees = async (_req: Request, res: Response<ManagerTrainee[]>, next: NextFunction) => {
    try {
      res.status(200).json(await managerService.listTrainees());
    } catch (error) {
      next(error);
    }
  };

  assignMentor = async (req: Request, res: Response<ManagerTrainee>, next: NextFunction) => {
    try {
      const managerId = (req as AuthenticatedRequest).user.id;
      const { traineeId } = req.params as { traineeId: string };
      const { mentorId } = req.body as AssignMentorBody;
      res.status(200).json(await managerService.assignMentor(traineeId, mentorId, managerId));
    } catch (error) {
      next(error);
    }
  };
}

export const managerController = new ManagerController();
