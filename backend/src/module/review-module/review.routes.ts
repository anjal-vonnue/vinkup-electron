import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { taskIdParamsSchema } from '../task-module/task.schema.js';
import { traineeIdParamsSchema, traineeTaskParamsSchema } from '../admin-module/admin.schema.js';
import { reviewController } from './review.controller.js';
import { approveNoteSchema, reworkFeedbackSchema } from './review.schema.js';
import { requireAssignedTrainee } from '../../middleware/authMiddleware.js';

/** Mounted at /api/admin behind requireAdmin (in admin.routes.ts). */
export const adminReviewRoutes = Router();

adminReviewRoutes.post(
  '/trainees/:traineeId/tasks/:taskId/approve',
  validate({ params: traineeTaskParamsSchema, body: approveNoteSchema }),
  requireAssignedTrainee,
  reviewController.approve
);

adminReviewRoutes.post(
  '/trainees/:traineeId/tasks/:taskId/rework',
  validate({ params: traineeTaskParamsSchema, body: reworkFeedbackSchema }),
  requireAssignedTrainee,
  reviewController.requestRework
);

adminReviewRoutes.get(
  '/trainees/:traineeId/tasks/:taskId/reviews',
  validate({ params: traineeTaskParamsSchema }),
  requireAssignedTrainee,
  reviewController.listTaskReviews
);

adminReviewRoutes.get(
  '/trainees/:traineeId/feedback',
  validate({ params: traineeIdParamsSchema }),
  requireAssignedTrainee,
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
