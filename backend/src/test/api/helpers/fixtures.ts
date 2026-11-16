import { signJwt } from '../../../utils/jwt';
import { AUTH_COOKIE_NAME } from '../../../module/auth-module/auth.constants';
import { db, resetDatabase, resetTraineeData } from './db';

// A small curriculum with the same id formats as the real one:
//
//   html (2 days)        html-day-01  t-1 browser, t-2 browser STRETCH
//                        html-day-02  t-1 browser, t-2 browser
//   postgresql (1 day)   postgresql-day-01  t-1 sql (setup SQL), t-2 node (npm test)
//
// Curriculum order: html-day-01 -> html-day-02 -> postgresql-day-01.
// A new trainee has html-day-01 UNLOCKED and the other two LOCKED.

export const DAY = {
  html1: 'html-day-01',
  html2: 'html-day-02',
  pg1: 'postgresql-day-01',
} as const;

export const TASK = {
  html1Main: 'html-day-01-t-1',
  html1Stretch: 'html-day-01-t-2',
  html2First: 'html-day-02-t-1',
  html2Second: 'html-day-02-t-2',
  pg1Sql: 'postgresql-day-01-t-1',
  pg1Node: 'postgresql-day-01-t-2',
} as const;

export const STARTER_FILES = [{ path: 'index.html', content: '<!-- starter -->\n' }];
export const SETUP_SQL = 'CREATE TABLE ticket (id serial PRIMARY KEY, title text NOT NULL);';

export async function seedCurriculum(): Promise<void> {
  await resetDatabase();

  await db.course.createMany({
    data: [
      { id: 'html', title: 'HTML', sort_order: 1 },
      { id: 'postgresql', title: 'PostgreSQL', sort_order: 2 },
    ],
  });

  await db.curriculum_day.createMany({
    data: [
      {
        id: DAY.html1,
        course_id: 'html',
        day_number: 1,
        title: 'HTML5 Document Structure',
        subtitle: 'Build valid HTML pages.',
        lesson_summary: 'Create a profile page.',
        journal_prompt: 'What surprised you today?',
      },
      {
        id: DAY.html2,
        course_id: 'html',
        day_number: 2,
        title: 'Semantic HTML',
        subtitle: 'Use the right element for the meaning.',
        lesson_summary: 'Rebuild a page with semantic tags.',
        journal_prompt: 'Which tag did you use most?',
      },
      {
        id: DAY.pg1,
        course_id: 'postgresql',
        day_number: 1,
        title: 'Tables and Queries',
        subtitle: 'Create tables and query them.',
        lesson_summary: 'Model support tickets.',
        journal_prompt: 'What was hardest about SQL?',
      },
    ],
  });

  await db.learning_objective.createMany({
    data: [
      // Inserted out of order on purpose: the API must sort by sort_order.
      {
        id: 'html-day-01-obj-2',
        curriculum_day_id: DAY.html1,
        code: '1.2',
        title: 'Text Elements',
        description: 'Use headings and paragraphs.',
        sort_order: 2,
      },
      {
        id: 'html-day-01-obj-1',
        curriculum_day_id: DAY.html1,
        code: '1.1',
        title: 'Boilerplate',
        description: 'Write a valid HTML5 document.',
        sort_order: 1,
      },
    ],
  });

  await db.self_check_item.createMany({
    data: [
      {
        id: 'html-day-01-check-1',
        curriculum_day_id: DAY.html1,
        code: '1.1',
        label: 'HTML5 structure',
        description: 'Write the boilerplate from memory.',
        is_required: true,
        sort_order: 1,
      },
      {
        id: 'html-day-01-check-2',
        curriculum_day_id: DAY.html1,
        code: '1.2',
        label: 'Validation',
        description: 'Zero validator errors.',
        is_required: false,
        sort_order: 2,
      },
    ],
  });

  const base = { instructions_markdown: '## Task\nDo it.', starter_files: STARTER_FILES };
  await db.task.createMany({
    data: [
      {
        ...base,
        id: TASK.html1Main,
        curriculum_day_id: DAY.html1,
        sequence_order: 1,
        title: 'Profile page',
        is_stretch_goal: false,
        estimated_minutes: 45,
        runtime: 'browser',
      },
      {
        ...base,
        id: TASK.html1Stretch,
        curriculum_day_id: DAY.html1,
        sequence_order: 2,
        title: 'Printable version',
        is_stretch_goal: true,
        estimated_minutes: null,
        runtime: 'browser',
      },
      {
        ...base,
        id: TASK.html2First,
        curriculum_day_id: DAY.html2,
        sequence_order: 1,
        title: 'Semantic article',
        is_stretch_goal: false,
        runtime: 'browser',
      },
      {
        ...base,
        id: TASK.html2Second,
        curriculum_day_id: DAY.html2,
        sequence_order: 2,
        title: 'Semantic layout',
        is_stretch_goal: false,
        runtime: 'browser',
      },
      {
        ...base,
        id: TASK.pg1Sql,
        curriculum_day_id: DAY.pg1,
        sequence_order: 1,
        title: 'Ticket queries',
        is_stretch_goal: false,
        runtime: 'sql',
        setup_sql: SETUP_SQL,
        starter_files: [{ path: 'queries.sql', content: '-- write your queries\n' }],
      },
      {
        ...base,
        id: TASK.pg1Node,
        curriculum_day_id: DAY.pg1,
        sequence_order: 2,
        title: 'Node and PGlite',
        is_stretch_goal: false,
        runtime: 'node',
        run_command: 'npm test',
        starter_files: [{ path: 'package.json', content: '{}\n' }],
      },
    ],
  });
}

// ---------- Trainees ----------

export type TestTrainee = { id: string; name: string; email: string; cookie: string };

export async function createTrainee(name = 'Test Trainee'): Promise<TestTrainee> {
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@vonnue.com`;
  const row = await db.trainee.create({ data: { name, email } });
  const token = signJwt({ id: row.id, name: row.name, email: row.email, role: 'trainee' });

  return { ...row, cookie: `${AUTH_COOKIE_NAME}=${token}` };
}

/** A fresh start for each test: no trainees and no progress, curriculum kept. */
export async function freshTrainees(): Promise<{ a: TestTrainee; b: TestTrainee }> {
  await resetTraineeData();
  return { a: await createTrainee('Trainee A'), b: await createTrainee('Trainee B') };
}

// ---------- Progress set up directly in the database ----------

export async function markTaskCompleted(traineeId: string, taskId: string): Promise<void> {
  const now = new Date();
  await db.task_progress.upsert({
    where: { trainee_id_task_id: { trainee_id: traineeId, task_id: taskId } },
    update: { status: 'completed', last_submitted_at: now },
    create: {
      trainee_id: traineeId,
      task_id: taskId,
      status: 'completed',
      first_submitted_at: now,
      last_submitted_at: now,
    },
  });
}

/** Completes the day's required tasks and the day itself, as Submit Day would. */
export async function markDayCompleted(traineeId: string, dayId: string): Promise<void> {
  const tasks = await db.task.findMany({
    where: { curriculum_day_id: dayId, is_stretch_goal: false },
  });
  for (const task of tasks) await markTaskCompleted(traineeId, task.id);
  await db.day_completion.create({ data: { trainee_id: traineeId, curriculum_day_id: dayId } });
}

// ---------- Dates (calendar days are Asia/Kolkata) ----------

/** 'YYYY-MM-DD' in Asia/Kolkata, `daysAgo` days back. */
export function istDateString(daysAgo = 0): string {
  const ms = Date.now() + 330 * 60 * 1000 - daysAgo * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** The value to store in a @db.Date column for that calendar day. */
export function istDate(daysAgo = 0): Date {
  return new Date(`${istDateString(daysAgo)}T00:00:00.000Z`);
}

export function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

export type TestAdmin = { id: string; name: string; email: string; cookie: string };

/** An admin (mentor) row plus a login cookie. Upserts, so calling it in every beforeEach is safe. */
export async function createAdmin(name = 'Test Mentor', isActive = true): Promise<TestAdmin> {
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@vonnue.com`;
  const row = await db.admin.upsert({
    where: { email },
    update: { name, is_active: isActive },
    create: { name, email, is_active: isActive },
  });
  const token = signJwt({ id: row.id, name: row.name, email: row.email, role: 'mentor' });
  return { id: row.id, name: row.name, email: row.email, cookie: `${AUTH_COOKIE_NAME}=${token}` };
}
