import { z } from 'zod';
import { istDateString } from '../../utils/istDate';

export const traineeIdParamsSchema = z.object({ traineeId: z.string().uuid() });

// task ids are strings like "css-day-03-t-2", not UUIDs
export const traineeTaskParamsSchema = z.object({
  traineeId: z.string().uuid(),
  taskId: z.string().min(1).max(100),
});

export const createTraineeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter the full name.')
    .max(80, 'Keep the name under 80 characters.'),
  // Lower-cased here, so every later check and the stored value use the same form.
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254),
});

export type CreateTraineeBody = z.infer<typeof createTraineeSchema>;

// The longest period GET /api/admin/analytics accepts, in days (both ends included).
export const MAX_ANALYTICS_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Number of calendar days from `from` to `to`, both included.
function daysInRange(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / MS_PER_DAY + 1;
}

// GET /api/admin/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD&traineeId=<uuid, optional>
export const analyticsQuerySchema = z
  .object({
    from: z.string().date('from must be a date like 2026-11-01.'),
    to: z.string().date('to must be a date like 2026-11-30.'),
    traineeId: z.string().uuid('traineeId must be a valid id.').optional(),
  })
  .refine((query) => query.from <= query.to, {
    message: 'from must be on or before to.',
    path: ['from'],
  })
  .refine((query) => query.to <= istDateString(), {
    message: 'to cannot be in the future.',
    path: ['to'],
  })
  .refine((query) => daysInRange(query.from, query.to) <= MAX_ANALYTICS_DAYS, {
    message: `The period can be at most ${MAX_ANALYTICS_DAYS} days.`,
    path: ['to'],
  });

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
