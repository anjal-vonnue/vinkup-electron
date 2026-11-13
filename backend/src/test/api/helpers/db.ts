import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';

/** The tests' own Prisma client, for setting up rows and checking what the API wrote. */
export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

const TABLES = [
  'activity_log',
  'flag_event',
  'typing_test_result',
  'journal_response',
  'day_completion',
  'task_review',
  'task_progress',
  'self_check_item',
  'learning_objective',
  'task',
  'curriculum_day',
  'course',
  'trainee',
  'admin',
];

/** Empties every table. Only ever runs against TEST_DATABASE_URL (see setup.ts). */
export async function resetDatabase(): Promise<void> {
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`);
}

/** Empties only the trainee tables, keeping the curriculum. */
export async function resetTraineeData(): Promise<void> {
  const traineeTables = TABLES.slice(0, 6).concat('trainee');
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE ${traineeTables.map((t) => `"${t}"`).join(', ')} CASCADE`
  );
}
