import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { adminController } from './admin.controller';
import { traineeIdParamsSchema, traineeTaskParamsSchema } from './admin.schema';
import { createTraineeSchema } from './admin.schema';

export const adminRoutes = Router();

adminRoutes.get('/trainees', adminController.listTrainees);

// Query string (from, to, traineeId) is validated in the controller.
adminRoutes.get('/analytics', adminController.getAnalytics);

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
