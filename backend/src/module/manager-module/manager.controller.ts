import type { NextFunction, Request, Response } from 'express';
import type { ManagerStaffMember, ManagerTrainee } from '@itp/types';
import type { AuthenticatedRequest } from '../../types/auth.types';
import { ManagerService } from './manager.service';
import type {
  AccountStatusBody,
  AssignMentorBody,
  CreateManagerTraineeBody,
  CreateStaffBody,
  UpdateManagerTraineeBody,
  UpdateStaffBody,
} from './manager.schema';

const managerService = new ManagerService();

class ManagerController {
  listStaff = async (_req: Request, res: Response<ManagerStaffMember[]>, next: NextFunction) => {
    try {
      res.status(200).json(await managerService.listStaff());
    } catch (error) {
      next(error);
    }
  };

  createStaff = async (req: Request, res: Response<ManagerStaffMember>, next: NextFunction) => {
    try {
      const managerId = (req as AuthenticatedRequest).user.id;
      res
        .status(201)
        .json(await managerService.createStaff(req.body as CreateStaffBody, managerId));
    } catch (error) {
      next(error);
    }
  };

  updateStaff = async (req: Request, res: Response<ManagerStaffMember>, next: NextFunction) => {
    try {
      const managerId = (req as AuthenticatedRequest).user.id;
      const { staffId } = req.params as { staffId: string };
      res
        .status(200)
        .json(await managerService.updateStaff(staffId, req.body as UpdateStaffBody, managerId));
    } catch (error) {
      next(error);
    }
  };

  setStaffActive = async (req: Request, res: Response<ManagerStaffMember>, next: NextFunction) => {
    try {
      const managerId = (req as AuthenticatedRequest).user.id;
      const { staffId } = req.params as { staffId: string };
      const { isActive } = req.body as AccountStatusBody;
      res.status(200).json(await managerService.setStaffActive(staffId, isActive, managerId));
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

  createTrainee = async (req: Request, res: Response<ManagerTrainee>, next: NextFunction) => {
    try {
      const managerId = (req as AuthenticatedRequest).user.id;
      res
        .status(201)
        .json(await managerService.createTrainee(req.body as CreateManagerTraineeBody, managerId));
    } catch (error) {
      next(error);
    }
  };

  updateTrainee = async (req: Request, res: Response<ManagerTrainee>, next: NextFunction) => {
    try {
      const managerId = (req as AuthenticatedRequest).user.id;
      const { traineeId } = req.params as { traineeId: string };
      res
        .status(200)
        .json(
          await managerService.updateTrainee(
            traineeId,
            req.body as UpdateManagerTraineeBody,
            managerId
          )
        );
    } catch (error) {
      next(error);
    }
  };

  setTraineeActive = async (req: Request, res: Response<ManagerTrainee>, next: NextFunction) => {
    try {
      const managerId = (req as AuthenticatedRequest).user.id;
      const { traineeId } = req.params as { traineeId: string };
      const { isActive } = req.body as AccountStatusBody;
      res.status(200).json(await managerService.setTraineeActive(traineeId, isActive, managerId));
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
