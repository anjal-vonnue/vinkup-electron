import { readFileSync } from 'node:fs';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env';

// Seeds the database. Safe to run again: it updates what changed and never deletes trainee data.
//
//   npm run db:seed -w backend                     staff + trainees + curriculum
//   SEED_DEMO=true npm run db:seed -w backend      also demo progress for every assigned trainee
//                                                  (local/dev only)
//
// The demo cohort is defined below: one manager, two mentors and the trainees assigned to them.
// The manager defaults to akshay.antony@vonnue.com; set SEED_MANAGER_EMAIL/SEED_MANAGER_NAME to
// sign in to /manager with your own company Google account.
//
// The curriculum comes from prisma/seed-data/curriculum.json, which is exported from the frontend's
// day content and the Phase 1 / Phase 2 task catalog by `npx tsx scripts/export-curriculum.ts`.

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ---------- Data ----------

// Staff who can open the mentor dashboard (/admin) or the manager console (/manager). Emails must
// be on ALLOWED_EMAIL_DOMAIN and belong to real Google accounts, otherwise nobody can sign in as
// them. Override the manager with SEED_MANAGER_EMAIL / SEED_MANAGER_NAME to use your own account.
const manager = {
  email: (process.env.SEED_MANAGER_EMAIL ?? 'akshay.antony@vonnue.com').toLowerCase(),
  name: process.env.SEED_MANAGER_NAME ?? 'Akshay Antony',
  role: 'MANAGER' as const,
};

const mentors = [
  { email: 'hawas.backer@vonnue.com', name: 'Hawas Backer', role: 'MENTOR' as const },
  { email: 'ameesha.t@vonnue.com', name: 'Ameesha T', role: 'MENTOR' as const },
];

const staff = [manager, ...mentors];

type SeedTrainee = {
  email: string;
  name: string;
  /** Mentor they are assigned to on first seed. null leaves them unassigned for the manager. */
  mentorEmail: string | null;
};

// The demo cohort. Trainees with a mentorEmail are split across the seeded mentors so each mentor
// dashboard has work to show. Staff emails are also trainee rows so you can preview the trainee
// side by deactivating the staff row (staff rows win at sign-in); they stay unassigned.
const trainees: SeedTrainee[] = [
  {
    email: 'aswin.vijayan@vonnue.com',
    name: 'Aswin Vijayan',
    mentorEmail: 'hawas.backer@vonnue.com',
  },
  {
    email: 'fathima.fadwah@vonnue.com',
    name: 'Fathima Fadwah',
    mentorEmail: 'hawas.backer@vonnue.com',
  },
  { email: 'anjal.biju@vonnue.com', name: 'Anjal K Biju', mentorEmail: 'hawas.backer@vonnue.com' },
  { email: 'christo.jose@vonnue.com', name: 'Christo Jose', mentorEmail: 'ameesha.t@vonnue.com' },
  { email: 'sona.kajal@vonnue.com', name: 'Sona Kajal', mentorEmail: 'ameesha.t@vonnue.com' },
  { email: 'gauresh.pa@vonnue.com', name: 'Gauresh PA', mentorEmail: 'ameesha.t@vonnue.com' },
  { email: 'akshay.antony@vonnue.com', name: 'Akshay Antony', mentorEmail: null },
  { email: 'hawas.backer@vonnue.com', name: 'Hawas Backer', mentorEmail: null },
  { email: 'ameesha.t@vonnue.com', name: 'Ameesha T', mentorEmail: null },
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

// ---------- Accounts ----------

async function seedStaff() {
  if (mentors.some((mentor) => mentor.email === manager.email)) {
    throw new Error(
      `SEED_MANAGER_EMAIL ${manager.email} is also a seeded mentor; choose a different manager email`
    );
  }

  for (const member of staff) {
    const email = member.email.toLowerCase();
    await prisma.admin.upsert({
      where: { email },
      update: { name: member.name, role: member.role },
      create: { email, name: member.name, role: member.role },
    });
  }
  const managers = staff.filter((member) => member.role === 'MANAGER').length;
  console.log(`Staff: ${staff.length} (${managers} manager, ${staff.length - managers} mentors)`);
}

async function seedTrainees() {
  const mentorIds = new Map(
    (await prisma.admin.findMany({ select: { id: true, email: true } })).map((row) => [
      row.email,
      row.id,
    ])
  );

  for (const trainee of trainees) {
    const mentorId = trainee.mentorEmail ? mentorIds.get(trainee.mentorEmail) : undefined;
    if (trainee.mentorEmail && !mentorId) {
      throw new Error(
        `Mentor ${trainee.mentorEmail} for ${trainee.email} is not in the seeded staff list`
      );
    }

    const row = await prisma.trainee.upsert({
      where: { email: trainee.email },
      // Don't touch mentor_id here: a manager's reassignment must survive re-seeding.
      update: { name: trainee.name },
      create: { email: trainee.email, name: trainee.name, mentor_id: mentorId },
    });

    // Fill in the seed assignment only when nobody owns the trainee. This assigns a cohort that
    // existed before assignments were seeded, without undoing a manager's reassignment or unassign.
    if (mentorId && row.mentor_id === null) {
      await prisma.trainee.update({ where: { id: row.id }, data: { mentor_id: mentorId } });
    }
  }

  const assigned = trainees.filter((trainee) => trainee.mentorEmail).length;
  console.log(`Trainees: ${trainees.length} (${assigned} assigned to a mentor)`);
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

const DEMO_JOURNALS = [
  'I practised semantic HTML today. Planning the structure before writing the markup made the page much easier to style.',
  'Forms need labels connected to inputs, so I checked every field with the keyboard. Next time I will test the error states too.',
  'Today was mostly about spacing. I compared padding and margin in the inspector until the card looked right.',
  'I split the layout into small sections and styled each one separately. I want to get faster at choosing class names.',
  'The responsive part was the hardest. I tested at three widths and fixed the overflow I found at the smallest one.',
  'CSS variables helped me keep the colours consistent. I moved every repeated value into a custom property.',
  'I finished the CSS module and reviewed my earlier pages. The main lesson is to write less CSS and reuse more.',
];

/** Midnight UTC of the calendar date in Asia/Kolkata `daysAgo` days back (for @db.Date columns). */
function istDate(daysAgo: number): Date {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000 - daysAgo * 24 * 60 * 60 * 1000);
  return new Date(`${ist.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/** Demo data for one trainee: completed days, journals, activity, typing and review history. */
async function seedTraineeDemo(
  trainee: { id: string; email: string; mentor_id: string | null },
  curriculum: Curriculum,
  index: number
) {
  const days = new Map(curriculum.days.map((d) => [d.id, d]));

  for (const [i, dayId] of DEMO_COMPLETED_DAYS.entries()) {
    const day = days.get(dayId);
    if (!day) throw new Error(`Demo day ${dayId} is not in the curriculum`);
    const doneAt = hoursAgo((DEMO_COMPLETED_DAYS.length - i) * 24);
    const reviewedAt = new Date(doneAt.getTime() + 60 * 60 * 1000);
    // Leave the newest completed day pending so the mentor has reviews to act on.
    const awaitingReview = i === DEMO_COMPLETED_DAYS.length - 1;

    // Submit Day needs every required task completed, so complete those first.
    for (const task of day.tasks.filter((t) => !t.isStretchGoal)) {
      const progress = await prisma.task_progress.upsert({
        where: { trainee_id_task_id: { trainee_id: trainee.id, task_id: task.id } },
        update: {},
        create: {
          trainee_id: trainee.id,
          task_id: task.id,
          status: 'completed',
          review_status: awaitingReview ? 'pending' : 'approved',
          submission_count: 1,
          files: task.starterFiles,
          code_updated_at: doneAt,
          first_submitted_at: doneAt,
          last_submitted_at: doneAt,
        },
      });

      // Older submissions have a review row; the newest day waits for the mentor.
      if (!awaitingReview && trainee.mentor_id && progress.submission_count > 0) {
        await prisma.task_review.upsert({
          where: {
            trainee_id_task_id_submission_no: {
              trainee_id: trainee.id,
              task_id: task.id,
              submission_no: progress.submission_count,
            },
          },
          update: {},
          create: {
            trainee_id: trainee.id,
            task_id: task.id,
            admin_id: trainee.mentor_id,
            submission_no: progress.submission_count,
            decision: 'approved',
            feedback: i === 0 ? 'Clear solution and every checklist item is covered.' : '',
            reviewed_at: reviewedAt,
          },
        });
      }
    }

    await prisma.day_completion.upsert({
      where: {
        trainee_id_curriculum_day_id: { trainee_id: trainee.id, curriculum_day_id: dayId },
      },
      update: {},
      create: { trainee_id: trainee.id, curriculum_day_id: dayId, completed_at: doneAt },
    });

    await prisma.journal_response.upsert({
      where: {
        trainee_id_curriculum_day_id: { trainee_id: trainee.id, curriculum_day_id: dayId },
      },
      update: {},
      create: {
        trainee_id: trainee.id,
        curriculum_day_id: dayId,
        response_text: DEMO_JOURNALS[i % DEMO_JOURNALS.length],
      },
    });
  }

  // Five days of activity, like the dashboard mock. The schema keeps one row per trainee per
  // calendar day (unique on trainee + date), so these are that day's totals.
  for (const [i, daysAgo] of [4, 3, 2, 1, 0].entries()) {
    const seconds = {
      active_seconds: 5400 + index * 900 + i * 600,
      coding_seconds: 3600 + index * 600 + i * 400,
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
    { wpm: 64 + index, accuracy: 93, daysAgo: 4 },
    { wpm: 66 + index, accuracy: 94, daysAgo: 3 },
    { wpm: 70 + index, accuracy: 95, daysAgo: 2 },
    { wpm: 68 + index, accuracy: 95, daysAgo: 1 },
    { wpm: 72 + index, accuracy: 96, daysAgo: 0 },
    { wpm: 74 + index, accuracy: 96, daysAgo: 0 },
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
}

async function seedDemo(curriculum: Curriculum) {
  const override = process.env.DEMO_TRAINEE_EMAIL?.toLowerCase();
  const targets = override
    ? trainees.filter((trainee) => trainee.email === override)
    : trainees.filter((trainee) => trainee.mentorEmail !== null);

  if (targets.length === 0) {
    throw new Error(
      override
        ? `DEMO_TRAINEE_EMAIL ${override} is not in the seed list`
        : 'No seeded trainee has a mentor; set mentorEmail on a trainee before seeding demo data'
    );
  }

  for (const [index, target] of targets.entries()) {
    const trainee = await prisma.trainee.findUnique({ where: { email: target.email } });
    if (!trainee) throw new Error(`Demo trainee ${target.email} not found`);
    await seedTraineeDemo(trainee, curriculum, index);
  }

  const names = targets.map((trainee) => trainee.email).join(', ');
  console.log(
    `Demo progress for ${targets.length} trainee(s): ${DEMO_COMPLETED_DAYS.length} days completed, ` +
      `${DEMO_CURRENT_DAY} unlocked, 5 days of activity, journals, typing results and reviews`
  );
  console.log(`  ${names}`);
}

// ---------- Run ----------

async function main() {
  const curriculum = loadCurriculum();

  await seedStaff();
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
