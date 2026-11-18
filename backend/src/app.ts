import { type Express, type Request, type Response } from 'express';
import express from 'express';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/errorHandler.js';
import cors from 'cors';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import passport from './module/auth-module/passport.js';
import authRoutes from './module/auth-module/auth.routes.js';
import desktopAuthRoutes from './module/auth-module/desktop-auth.routes.js';
import profileRoutes from './module/profile-module/profile.routes.js';
import { requireTrainee, requireAdmin, requireManager } from './middleware/authMiddleware.js';
import { dashboardRoutes } from './module/dashboard-module/dashboard.routes.js';
import { courseRoutes } from './module/dashboard-module/dashboard.routes.js';
import flagRoutes from './module/flag-module/flag.routes.js';
import activityRoutes from './module/activity-module/activity.routes.js';
import taskRoutes from './module/task-module/task.routes.js';
import { traineeReviewRoutes } from './module/review-module/review.routes.js';
import typingRoutes from './module/typing-test-module/typing.routes.js';
import dayRouter from './module/day-module/day.routes.js';
import journalRouter from './module/day-module/journal.routes.js';

import { adminRoutes } from './module/admin-module/admin.routes.js';
import { managerRoutes } from './module/manager-module/manager.routes.js';
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

app.use('/api/profile', requireTrainee, profileRoutes);
app.use('/api/activity', requireTrainee, activityRoutes);
app.use('/api/dashboard', requireTrainee, dashboardRoutes);
app.use('/api/courses', requireTrainee, courseRoutes);
app.use('/api/tasks', requireTrainee, traineeReviewRoutes);
app.use('/api/tasks', requireTrainee, taskRoutes);
app.use('/api/days', requireTrainee, dayRouter);
app.use('/api/journal', requireTrainee, journalRouter);
app.use('/api/typing-test', requireTrainee, typingRoutes);
app.use('/api/admin', requireAdmin, adminRoutes);
app.use('/api/manager', requireManager, managerRoutes);
app.use(notFoundHandler);

app.use(errorHandler);

export default app;
