import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { leaveRequestController } from './leave-request.controller';
import {
  createLeaveRequestSchema,
  leaveRequestIdParamsSchema,
  reviewLeaveRequestSchema,
} from './leave-request.schema';

/** Mounted at /api/leave-requests behind requireTrainee. */
export const traineeLeaveRequestRoutes = Router();

traineeLeaveRequestRoutes.post(
  '/',
  validate({ body: createLeaveRequestSchema }),
  leaveRequestController.create
);

// Static paths first — otherwise `/:requestId` swallows them and the UUID
// validation rejects "unread-count" with a 400.
traineeLeaveRequestRoutes.get('/unread-count', leaveRequestController.getUnreadCount);

traineeLeaveRequestRoutes.get('/', leaveRequestController.listMine);

traineeLeaveRequestRoutes.get(
  '/:requestId',
  validate({ params: leaveRequestIdParamsSchema }),
  leaveRequestController.getMine
);

/**
 * One router for both staff roles. It is mounted under /api/admin behind
 * requireMentor and /api/manager behind requireManager; the service applies the
 * assignment scope from the authenticated reviewer.
 */
export const staffLeaveRequestRoutes = Router();

// Static paths first — same reason as above.
staffLeaveRequestRoutes.get('/pending-count', leaveRequestController.getPendingCount);

staffLeaveRequestRoutes.get('/', leaveRequestController.listForReviewer);

staffLeaveRequestRoutes.get(
  '/:requestId',
  validate({ params: leaveRequestIdParamsSchema }),
  leaveRequestController.getForReviewer
);

staffLeaveRequestRoutes.patch(
  '/:requestId/review',
  validate({ params: leaveRequestIdParamsSchema, body: reviewLeaveRequestSchema }),
  leaveRequestController.review
);
