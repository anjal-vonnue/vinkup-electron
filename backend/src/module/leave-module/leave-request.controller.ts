import type { NextFunction, Request, Response } from 'express';
import type { LeaveRequest, LeaveCountResponse } from '@itp/types';
import { ForbiddenError } from '../../errors/AppError';
import type { AuthenticatedRequest } from '../../types/auth.types';
import type { LeaveReviewer } from './leave-request.repository';
import { leaveRequestService } from './leave-request.service';
import type { CreateLeaveRequestBody, ReviewLeaveRequestBody } from './leave-request.schema';

/** Reviewer identity always comes from the signed request context. */
function reviewerFrom(request: Request): LeaveReviewer {
  const user = (request as AuthenticatedRequest).user;
  if (!user || (user.role !== 'mentor' && user.role !== 'manager')) {
    throw new ForbiddenError();
  }
  return {
    id: user.id,
    name: user.name,
    role: user.role === 'manager' ? 'MANAGER' : 'MENTOR',
  };
}

class LeaveRequestController {
  // ---------- Trainee actions (mounted behind requireTrainee) ----------

  create = async (req: Request, res: Response<LeaveRequest>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      const request = await leaveRequestService.create(
        traineeId,
        req.body as CreateLeaveRequestBody
      );
      res.status(201).json(request);
    } catch (error) {
      next(error);
    }
  };

  listMine = async (req: Request, res: Response<LeaveRequest[]>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      res.status(200).json(await leaveRequestService.listMine(traineeId));
    } catch (error) {
      next(error);
    }
  };

  getMine = async (req: Request, res: Response<LeaveRequest>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      const { requestId } = req.params as { requestId: string };
      res.status(200).json(await leaveRequestService.getMine(traineeId, requestId));
    } catch (error) {
      next(error);
    }
  };

  // ---------- Shared staff actions (mounted behind requireMentor/requireManager) ----------

  listForReviewer = async (req: Request, res: Response<LeaveRequest[]>, next: NextFunction) => {
    try {
      res.status(200).json(await leaveRequestService.listForReviewer(reviewerFrom(req)));
    } catch (error) {
      next(error);
    }
  };

  getForReviewer = async (req: Request, res: Response<LeaveRequest>, next: NextFunction) => {
    try {
      const { requestId } = req.params as { requestId: string };
      res.status(200).json(await leaveRequestService.getForReviewer(reviewerFrom(req), requestId));
    } catch (error) {
      next(error);
    }
  };

  review = async (req: Request, res: Response<LeaveRequest>, next: NextFunction) => {
    try {
      const { requestId } = req.params as { requestId: string };
      const reviewed = await leaveRequestService.review(
        reviewerFrom(req),
        requestId,
        req.body as ReviewLeaveRequestBody
      );
      res.status(200).json(reviewed);
    } catch (error) {
      next(error);
    }
  };

  getUnreadCount = async (req: Request, res: Response<LeaveCountResponse>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      // `?since=<ISO>` — the client sends the last time it opened the leave list.
      const sinceParam = req.query.since;
      const since =
        typeof sinceParam === 'string' && sinceParam !== '' ? new Date(sinceParam) : null;
      const count = await leaveRequestService.countDecidedSince(traineeId, since);
      res.status(200).json({ count });
    } catch (error) {
      next(error);
    }
  };

  getPendingCount = async (req: Request, res: Response<LeaveCountResponse>, next: NextFunction) => {
    try {
      const count = await leaveRequestService.countPendingForReviewer(reviewerFrom(req));
      res.status(200).json({ count });
    } catch (error) {
      next(error);
    }
  };
}

export const leaveRequestController = new LeaveRequestController();
