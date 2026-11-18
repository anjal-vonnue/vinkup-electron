import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { adminController } from './admin.controller.js';
import { traineeIdParamsSchema, traineeTaskParamsSchema } from './admin.schema.js';
import { createTraineeSchema } from './admin.schema.js';
import { adminReviewRoutes } from '../review-module/review.routes.js';
import { requireAssignedTrainee } from '../../middleware/authMiddleware.js';

export const adminRoutes = Router();

// Review endpoints live in review-module but belong under /api/admin's auth guard.
adminRoutes.use(adminReviewRoutes);

adminRoutes.get('/trainees', adminController.listTrainees);

// Query string (from, to, traineeId) is validated in the controller.
adminRoutes.get('/analytics', adminController.getAnalytics);

adminRoutes.get(
  '/trainees/:traineeId',
  validate({ params: traineeIdParamsSchema }),
  requireAssignedTrainee,
  adminController.getTrainee
);

adminRoutes.get(
  '/trainees/:traineeId/flags',
  validate({ params: traineeIdParamsSchema }),
  requireAssignedTrainee,
  adminController.listFlags
);

adminRoutes.get(
  '/trainees/:traineeId/tasks/:taskId/code',
  validate({ params: traineeTaskParamsSchema }),
  requireAssignedTrainee,
  adminController.getTaskCode
);

adminRoutes.post(
  '/trainees',
  validate({ body: createTraineeSchema }),
  adminController.createTrainee
);
