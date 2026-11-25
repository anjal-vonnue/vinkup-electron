import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { dashboardController } from './dashboard.controller';
import { courseIdParamsSchema } from './dashboard.schema';
import { z } from 'zod';

// Both routers are mounted behind requireAuth in app.ts.

/** /api/dashboard */
export const dashboardRoutes = Router();

dashboardRoutes.get('/', dashboardController.getDashboard);
dashboardRoutes.get('/rework', dashboardController.getReworkTasks);
dashboardRoutes.get('/unread-comments', dashboardController.getUnreadTaskComments);
dashboardRoutes.patch(
  '/unread-comments/:reviewId/read',
  validate({ params: z.object({ reviewId: z.string().uuid() }) }),
  dashboardController.markTaskCommentRead
);

/** /api/courses */
export const courseRoutes = Router();

courseRoutes.get(
  '/:courseId/days',
  validate({ params: courseIdParamsSchema }),
  dashboardController.getCourseDays
);

courseRoutes.get(
  '/:courseId/certificate',
  validate({ params: courseIdParamsSchema }),
  dashboardController.getCourseCertificate
);
