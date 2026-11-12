import { readFileSync } from 'node:fs';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env';

// Seeds the database. Safe to run again: it updates what changed and never deletes trainee data.
//
//   npm run db:seed -w backend                     trainees + curriculum
//   SEED_DEMO=true npm run db:seed -w backend      also demo progress for one trainee (local/dev only)
//
// The curriculum comes from prisma/seed-data/curriculum.json, which is exported from the frontend's
// day content and the Phase 1 / Phase 2 task catalog by `npx tsx scripts/export-curriculum.ts`.

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ---------- Data ----------

// Mentors who can open the admin dashboard. Emails must be on ALLOWED_EMAIL_DOMAIN.
const admins = [
  { email: 'hawas.backer@vonnue.com', name: 'hawas' },
  { email: 'ameesha.t@vonnue.com', name: 'Ameesha T' },
];

const trainees = [
  { email: 'hawas.backer@vonnue.com', name: 'Hawas Backer' },
  { email: 'aswin.vijayan@vonnue.com', name: 'Aswin Vijayan' },
  { email: 'fathima.fadwah@vonnue.com', name: 'Fathima Fadwah' },
  { email: 'ameesha.t@vonnue.com', name: 'Ameesha T' },
  { email: 'akshay.antony@vonnue.com', name: 'Akshay Antony' },
  { email: 'christo.jose@vonnue.com', name: 'Christo Jose' },
  { email: 'sona.kajal@vonnue.com', name: 'Sona Kajal' },
  { email: 'gauresh.pa@vonnue.com', name: 'Gauresh PA' },
  { email: 'anjal.biju@vonnue.com', name: 'Anjal K Biju' },
];

type SeedTaskFile = { path: string; content: string };

type SeedTask = {
  id: string;
  sequenceOrder: number;
  title: string;
  instructionsMarkdown: string;
  isStretchGoal: boolean;
  estimatedMinutes: number | null;
  runtime: 'browser' | 'node' | 'sql';
  runCommand: string | null;
  setupSql: string | null;
  starterFiles: SeedTaskFile[];
};

type SeedDay = {
  id: string;
  courseId: string;
  dayNumber: number;
  title: string;
  subtitle: string;
  lessonSummary: string;
  journalPrompt: string;
  learningObjectives: {
    id: string;
    code: string;
    title: string;
    description: string;
    sortOrder: number;
  }[];
  selfCheckItems: {
    id: string;
    code: string;
    label: string;
    description: string;
    isRequired: boolean;
    sortOrder: number;
  }[];
  tasks: SeedTask[];
};

type Curriculum = {
  courses: { id: string; title: string; sortOrder: number }[];
  days: SeedDay[];
};

function loadCurriculum(): Curriculum {
  const path = new URL('../../prisma/seed-data/curriculum.json', import.meta.url);
  return JSON.parse(readFileSync(path, 'utf8')) as Curriculum;
}

// ---------- Trainees ----------

async function seedTrainees() {
  for (const trainee of trainees) {
    await prisma.trainee.upsert({
      where: { email: trainee.email },
      update: { name: trainee.name },
      create: trainee,
    });
  }
  console.log(`Trainees: ${trainees.length}`);
}

// ---------- Curriculum ----------

async function seedCourses(curriculum: Curriculum) {
  // sort_order is unique, so park existing rows on negative numbers first; a reorder can't collide.
  await prisma.$transaction([
    prisma.course.updateMany({ data: { sort_order: { multiply: -1 } } }),
    ...curriculum.courses.map((c) =>
      prisma.course.upsert({
        where: { id: c.id },
        update: { title: c.title, sort_order: c.sortOrder },
        create: { id: c.id, title: c.title, sort_order: c.sortOrder },
      })
    ),
  ]);
  console.log(`Courses: ${curriculum.courses.length}`);
}

async function seedDays(curriculum: Curriculum) {
  const rows = curriculum.days.map((d) => ({
    id: d.id,
    course_id: d.courseId,
    day_number: d.dayNumber,
    title: d.title,
    subtitle: d.subtitle,
    lesson_summary: d.lessonSummary,
    journal_prompt: d.journalPrompt,
  }));

  const existing = new Map((await prisma.curriculum_day.findMany()).map((r) => [r.id, r]));
  const toCreate = rows.filter((r) => !existing.has(r.id));
  const toUpdate = rows.filter((r) => {
    const old = existing.get(r.id);
    return old !== undefined && JSON.stringify({ ...old }) !== JSON.stringify({ ...old, ...r });
  });

  if (toCreate.length > 0) await prisma.curriculum_day.createMany({ data: toCreate });
  for (const { id, ...data } of toUpdate) {
    await prisma.curriculum_day.update({ where: { id }, data });
  }
  warnAboutRemoved(
    'curriculum_day',
    [...existing.keys()],
    rows.map((r) => r.id)
  );
  console.log(`Days: ${rows.length} (${toCreate.length} new, ${toUpdate.length} updated)`);
}

/** Objectives and checklist items are content only (no trainee rows point at them): replace them all. */
async function seedDayDetails(curriculum: Curriculum) {
  const objectives = curriculum.days.flatMap((d) =>
    d.learningObjectives.map((o) => ({
      id: o.id,
      curriculum_day_id: d.id,
      code: o.code,
      title: o.title,
      description: o.description,
      sort_order: o.sortOrder,
    }))
  );
  const checkItems = curriculum.days.flatMap((d) =>
    d.selfCheckItems.map((s) => ({
      id: s.id,
      curriculum_day_id: d.id,
      code: s.code,
      label: s.label,
      description: s.description,
      is_required: s.isRequired,
      sort_order: s.sortOrder,
    }))
  );

  await prisma.$transaction([
    prisma.learning_objective.deleteMany(),
    prisma.learning_objective.createMany({ data: objectives }),
    prisma.self_check_item.deleteMany(),
    prisma.self_check_item.createMany({ data: checkItems }),
  ]);
  console.log(`Learning objectives: ${objectives.length}, checklist items: ${checkItems.length}`);
}

async function seedTasks(curriculum: Curriculum) {
  const rows = curriculum.days.flatMap((d) =>
    d.tasks.map((t) => ({
      id: t.id,
      curriculum_day_id: d.id,
      sequence_order: t.sequenceOrder,
      title: t.title,
      instructions_markdown: t.instructionsMarkdown,
      is_stretch_goal: t.isStretchGoal,
      estimated_minutes: t.estimatedMinutes,
      runtime: t.runtime,
      run_command: t.runCommand,
      setup_sql: t.setupSql,
      starter_files: t.starterFiles,
    }))
  );

  // Tasks can't be deleted and re-created: task_progress and flag_event rows point at them.
  const existing = new Map((await prisma.task.findMany()).map((r) => [r.id, r]));
  const toCreate = rows.filter((r) => !existing.has(r.id));
  const toUpdate = rows.filter((r) => {
    const old = existing.get(r.id);
    return old !== undefined && JSON.stringify({ ...old }) !== JSON.stringify({ ...old, ...r });
  });

  if (toCreate.length > 0) await prisma.task.createMany({ data: toCreate });
  for (const { id, ...data } of toUpdate) {
    await prisma.task.update({ where: { id }, data });
  }
  warnAboutRemoved(
    'task',
    [...existing.keys()],
    rows.map((r) => r.id)
  );
  console.log(`Tasks: ${rows.length} (${toCreate.length} new, ${toUpdate.length} updated)`);
}

function warnAboutRemoved(table: string, inDb: string[], inSeed: string[]) {
  const keep = new Set(inSeed);
  const removed = inDb.filter((id) => !keep.has(id));
  if (removed.length > 0) {
    console.warn(
      `Warning: ${removed.length} ${table} row(s) are in the database but not in the seed data, ` +
        `so they were left as they are: ${removed.join(', ')}`
    );
  }
}

// ---------- Demo progress (SEED_DEMO=true only) ----------

// Same picture as the frontend mock: HTML finished, CSS days 1-2 done, CSS day 3 is today's day.
const DEMO_COMPLETED_DAYS = [
  'html-day-01',
  'html-day-02',
  'html-day-03',
  'html-day-04',
  'html-day-05',
  'css-day-01',
  'css-day-02',
];
const DEMO_CURRENT_DAY = 'css-day-03';

/** Midnight UTC of the calendar date in Asia/Kolkata `daysAgo` days back (for @db.Date columns). */
function istDate(daysAgo: number): Date {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000 - daysAgo * 24 * 60 * 60 * 1000);
  return new Date(`${ist.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

async function seedDemo(curriculum: Curriculum) {
  const email = process.env.DEMO_TRAINEE_EMAIL ?? trainees[0].email;
  const trainee = await prisma.trainee.findUnique({ where: { email } });
  if (!trainee) throw new Error(`Demo trainee ${email} not found`);

  const days = new Map(curriculum.days.map((d) => [d.id, d]));

  for (const [i, dayId] of DEMO_COMPLETED_DAYS.entries()) {
    const day = days.get(dayId);
    if (!day) throw new Error(`Demo day ${dayId} is not in the curriculum`);
    const doneAt = hoursAgo((DEMO_COMPLETED_DAYS.length - i) * 24);

    // Submit Day needs every required task completed, so complete those first.
    for (const task of day.tasks.filter((t) => !t.isStretchGoal)) {
      await prisma.task_progress.upsert({
        where: { trainee_id_task_id: { trainee_id: trainee.id, task_id: task.id } },
        update: {},
        create: {
          trainee_id: trainee.id,
          task_id: task.id,
          status: 'completed',
          files: task.starterFiles,
          code_updated_at: doneAt,
          first_submitted_at: doneAt,
          last_submitted_at: doneAt,
        },
      });
    }
    await prisma.day_completion.upsert({
      where: {
        trainee_id_curriculum_day_id: { trainee_id: trainee.id, curriculum_day_id: dayId },
      },
      update: {},
      create: { trainee_id: trainee.id, curriculum_day_id: dayId, completed_at: doneAt },
    });
  }

  // Five days of activity, like the dashboard mock. The schema keeps one row per trainee per
  // calendar day (unique on trainee + date), so these are that day's totals.
  for (const [i, daysAgo] of [4, 3, 2, 1, 0].entries()) {
    const seconds = {
      active_seconds: 5400 + i * 600,
      coding_seconds: 3600 + i * 400,
    };
    await prisma.activity_log.upsert({
      where: {
        trainee_id_date: { trainee_id: trainee.id, date: istDate(daysAgo) },
      },
      update: seconds,
      create: { trainee_id: trainee.id, date: istDate(daysAgo), ...seconds },
    });
  }

  // Typing attempts, like the dashboard mock. Replaced on every demo run.
  const typing = [
    { wpm: 64, accuracy: 93, daysAgo: 4 },
    { wpm: 66, accuracy: 94, daysAgo: 3 },
    { wpm: 70, accuracy: 95, daysAgo: 2 },
    { wpm: 68, accuracy: 95, daysAgo: 1 },
    { wpm: 72, accuracy: 96, daysAgo: 0 },
    { wpm: 74, accuracy: 96, daysAgo: 0 },
  ];
  await prisma.$transaction([
    prisma.typing_test_result.deleteMany({ where: { trainee_id: trainee.id } }),
    prisma.typing_test_result.createMany({
      data: typing.map((t, i) => ({
        trainee_id: trainee.id,
        wpm: t.wpm,
        accuracy: t.accuracy,
        taken_at: hoursAgo(t.daysAgo * 24 + (typing.length - i)),
      })),
    }),
  ]);

  console.log(
    `Demo progress for ${email}: ${DEMO_COMPLETED_DAYS.length} days completed, ` +
      `${DEMO_CURRENT_DAY} unlocked, 5 days of activity, ${typing.length} typing results`
  );
}

// ---------- Run ----------

async function main() {
  const curriculum = loadCurriculum();

  await seedTrainees();
  await seedCourses(curriculum);
  await seedDays(curriculum);
  await seedDayDetails(curriculum);
  await seedTasks(curriculum);

  if (process.env.SEED_DEMO === 'true') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SEED_DEMO must not run when NODE_ENV is production');
    }
    await seedDemo(curriculum);
  }

  for (const admin of admins) {
    const email = admin.email.toLowerCase();
    await prisma.admin.upsert({
      where: { email },
      update: { name: admin.name },
      create: { email, name: admin.name },
    });
  }

  console.log(`Admins: ${admins.length}`);

  console.log('Seeding complete.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
