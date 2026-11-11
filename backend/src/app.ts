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
import { requireTrainee, requireAdmin } from './middleware/authMiddleware';
import { dashboardRoutes } from './module/dashboard-module/dashboard.routes';
import { courseRoutes } from './module/dashboard-module/dashboard.routes';
import flagRoutes from './module/flag-module/flag.routes';
import activityRoutes from './module/activity-module/activity.routes';
import taskRoutes from './module/task-module/task.routes';
import typingRoutes from './module/typing-test-module/typing.routes';
import dayRouter from './module/day-module/day.routes';
import journalRouter from './module/day-module/journal.routes';

import { adminRoutes } from './module/admin-module/admin.routes';
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
app.use('/api/tasks', requireTrainee, taskRoutes);
app.use('/api/days', requireTrainee, dayRouter);
app.use('/api/journal', requireTrainee, journalRouter);
app.use('/api/typing-test', requireTrainee, typingRoutes);
app.use('/api/admin', requireAdmin, adminRoutes);
app.use(notFoundHandler);

app.use(errorHandler);

export default app;
