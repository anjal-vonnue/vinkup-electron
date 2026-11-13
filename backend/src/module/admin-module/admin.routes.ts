import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { adminController } from './admin.controller';
import { traineeIdParamsSchema, traineeTaskParamsSchema } from './admin.schema';
import { createTraineeSchema } from './admin.schema';
import { adminReviewRoutes } from '../review-module/review.routes';

export const adminRoutes = Router();

// Review endpoints live in review-module but belong under /api/admin's auth guard.
adminRoutes.use(adminReviewRoutes);

adminRoutes.get('/trainees', adminController.listTrainees);

adminRoutes.get(
  '/trainees/:traineeId',
  validate({ params: traineeIdParamsSchema }),
  adminController.getTrainee
);

adminRoutes.get(
  '/trainees/:traineeId/flags',
  validate({ params: traineeIdParamsSchema }),
  adminController.listFlags
);

adminRoutes.get(
  '/trainees/:traineeId/tasks/:taskId/code',
  validate({ params: traineeTaskParamsSchema }),
  adminController.getTaskCode
);

adminRoutes.post(
  '/trainees',
  validate({ body: createTraineeSchema }),
  adminController.createTrainee
);
