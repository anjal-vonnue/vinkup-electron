import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { adminController } from './admin.controller';
import { traineeIdParamsSchema, traineeTaskParamsSchema } from './admin.schema';
import { createTraineeSchema } from './admin.schema';
import { adminReviewRoutes } from '../review-module/review.routes';
import { staffLeaveRequestRoutes } from '../leave-module/leave-request.routes';
import { requireAssignedTrainee } from '../../middleware/authMiddleware';
import { aiReviewRoutes } from '../ai-review-module/ai-review.routes';

export const adminRoutes = Router();

// Review endpoints live in review-module but belong under /api/admin's auth guard.
adminRoutes.use(adminReviewRoutes);
adminRoutes.use('/ai-review', aiReviewRoutes);

// Mentors review leave requests through the same router managers use. The
// service derives the assignment scope from the authenticated reviewer.
adminRoutes.use('/leave-requests', staffLeaveRequestRoutes);

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
