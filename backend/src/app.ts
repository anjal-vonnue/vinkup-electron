import { type Express, type Request, type Response } from 'express';
import express from 'express';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/errorHandler';
import cors from 'cors';
import { notFoundHandler } from './middleware/notFoundHandler';
import passport from './module/auth-module/passport';
import authRoutes from './module/auth-module/auth.routes';
import desktopAuthRoutes from './module/auth-module/desktop-auth.routes';
import profileRoutes from './module/profile-module/profile.routes';
import { requireTrainee, requireAdmin, requireManager } from './middleware/authMiddleware';
import { dashboardRoutes } from './module/dashboard-module/dashboard.routes';
import { courseRoutes } from './module/dashboard-module/dashboard.routes';
import flagRoutes from './module/flag-module/flag.routes';
import activityRoutes from './module/activity-module/activity.routes';
import taskRoutes from './module/task-module/task.routes';
import { traineeReviewRoutes } from './module/review-module/review.routes';
import typingRoutes from './module/typing-test-module/typing.routes';
import dayRouter from './module/day-module/day.routes';
import journalRouter from './module/day-module/journal.routes';
import { traineeLeaveRequestRoutes } from './module/leave-module/leave-request.routes';

import { adminRoutes } from './module/admin-module/admin.routes';
import { managerRoutes } from './module/manager-module/manager.routes';
import realtimeRoutes from './module/realtime-module/realtime.routes';
import {
  managerCheckpointGroupRoutes,
  managerCheckpointRoutes,
  traineeCheckpointRoutes,
} from './module/checkpoint-module/checkpoint.routes';
import { blockDuringActiveCheckpoint } from './module/checkpoint-module/checkpoint.access.middleware';
const app: Express = express();

app.use(
  cors({
    origin: '*',
    credentials: true,
  })
);

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(passport.initialize());

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).send({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/auth/desktop', desktopAuthRoutes);
app.use('/api/activity', flagRoutes);
app.use('/api/events', realtimeRoutes);

// Checkpoints stay reachable during an attempt; everything else below is locked.
app.use('/api/checkpoints', requireTrainee, traineeCheckpointRoutes);
app.use('/api/manager/checkpoints', requireManager, managerCheckpointRoutes);
app.use('/api/manager/checkpoint-groups', requireManager, managerCheckpointGroupRoutes);

app.use('/api/profile', requireTrainee, blockDuringActiveCheckpoint, profileRoutes);
app.use('/api/activity', requireTrainee, blockDuringActiveCheckpoint, activityRoutes);
app.use('/api/dashboard', requireTrainee, blockDuringActiveCheckpoint, dashboardRoutes);
app.use('/api/courses', requireTrainee, blockDuringActiveCheckpoint, courseRoutes);
app.use('/api/tasks', requireTrainee, blockDuringActiveCheckpoint, traineeReviewRoutes);
app.use('/api/tasks', requireTrainee, blockDuringActiveCheckpoint, taskRoutes);
app.use('/api/days', requireTrainee, blockDuringActiveCheckpoint, dayRouter);
app.use('/api/journal', requireTrainee, blockDuringActiveCheckpoint, journalRouter);
app.use('/api/typing-test', requireTrainee, blockDuringActiveCheckpoint, typingRoutes);
app.use(
  '/api/leave-requests',
  requireTrainee,
  blockDuringActiveCheckpoint,
  traineeLeaveRequestRoutes
);
app.use('/api/admin', requireAdmin, adminRoutes);
app.use('/api/manager', requireManager, managerRoutes);
app.use(notFoundHandler);

app.use(errorHandler);

export default app;
