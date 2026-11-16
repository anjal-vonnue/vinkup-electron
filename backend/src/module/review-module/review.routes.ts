import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { taskIdParamsSchema } from '../task-module/task.schema';
import { traineeIdParamsSchema, traineeTaskParamsSchema } from '../admin-module/admin.schema';
import { reviewController } from './review.controller';
import { approveNoteSchema, reworkFeedbackSchema } from './review.schema';

/** Mounted at /api/admin behind requireAdmin (in admin.routes.ts). */
export const adminReviewRoutes = Router();

adminReviewRoutes.post(
  '/trainees/:traineeId/tasks/:taskId/approve',
  validate({ params: traineeTaskParamsSchema, body: approveNoteSchema }),
  reviewController.approve
);

adminReviewRoutes.post(
  '/trainees/:traineeId/tasks/:taskId/rework',
  validate({ params: traineeTaskParamsSchema, body: reworkFeedbackSchema }),
  reviewController.requestRework
);

adminReviewRoutes.get(
  '/trainees/:traineeId/tasks/:taskId/reviews',
  validate({ params: traineeTaskParamsSchema }),
  reviewController.listTaskReviews
);

adminReviewRoutes.get(
  '/trainees/:traineeId/feedback',
  validate({ params: traineeIdParamsSchema }),
  reviewController.listTraineeFeedback
);

/** Mounted at /api/tasks behind requireTrainee, before task.routes.ts. */
export const traineeReviewRoutes = Router();

traineeReviewRoutes.get(
  '/:taskId/review',
  validate({ params: taskIdParamsSchema }),
  reviewController.getReview
);

traineeReviewRoutes.get(
  '/:taskId/reviews',
  validate({ params: taskIdParamsSchema }),
  reviewController.listReviews
);
