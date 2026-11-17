import type { Request, Response, NextFunction } from 'express';
import type {
  AdminFeedbackEntry,
  TaskReview,
  TaskReviewListResponse,
  TaskReviewSummary,
} from '@itp/types';
import type { AuthenticatedRequest } from '../../types/auth.types';
import type { ReworkFeedbackBody, ApproveNoteBody } from './review.schema';
import { ReviewService } from './review.service';

const reviewService = new ReviewService();

// params and body are checked by validate() before these run. Both routers that
// mount these handlers are behind an auth middleware, so req.user is always set.

class ReviewController {
  // ---------- Admin actions (mounted at /api/admin behind requireAdmin) ----------

  approve = async (req: Request, res: Response<TaskReview>, next: NextFunction) => {
    try {
      const adminId = (req as AuthenticatedRequest).user.id; // server-side identity
      const { traineeId, taskId } = req.params as { traineeId: string; taskId: string };
      const { feedback } = (req.body ?? {}) as ApproveNoteBody;
      const review = await reviewService.approve(traineeId, taskId, adminId, feedback ?? '');
      res.status(201).json(review);
    } catch (error) {
      next(error);
    }
  };

  requestRework = async (req: Request, res: Response<TaskReview>, next: NextFunction) => {
    try {
      const adminId = (req as AuthenticatedRequest).user.id; // server-side identity
      const { traineeId, taskId } = req.params as { traineeId: string; taskId: string };
      const { feedback } = req.body as ReworkFeedbackBody;
      const review = await reviewService.requestRework(traineeId, taskId, adminId, feedback);
      res.status(201).json(review);
    } catch (error) {
      next(error);
    }
  };

  listTaskReviews = async (req: Request, res: Response<TaskReview[]>, next: NextFunction) => {
    try {
      const { traineeId, taskId } = req.params as { traineeId: string; taskId: string };
      const reviews = await reviewService.getTaskReviews(traineeId, taskId);
      res.status(200).json(reviews);
    } catch (error) {
      next(error);
    }
  };

  listTraineeFeedback = async (
    req: Request,
    res: Response<AdminFeedbackEntry[]>,
    next: NextFunction
  ) => {
    try {
      const { traineeId } = req.params as { traineeId: string };
      const feedback = await reviewService.listTraineeFeedback(traineeId);
      res.status(200).json(feedback);
    } catch (error) {
      next(error);
    }
  };

  // ---------- Trainee actions (mounted at /api/tasks behind requireTrainee) ----------

  getReview = async (req: Request, res: Response<TaskReviewSummary>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id; // own task only
      const { taskId } = req.params as { taskId: string };
      const review = await reviewService.getReview(traineeId, taskId);
      res.status(200).json(review);
    } catch (error) {
      next(error);
    }
  };

  listReviews = async (req: Request, res: Response<TaskReviewListResponse>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id; // own task only
      const { taskId } = req.params as { taskId: string };
      const reviews = await reviewService.getReviews(traineeId, taskId);
      res.status(200).json(reviews);
    } catch (error) {
      next(error);
    }
  };
}

export const reviewController = new ReviewController();
