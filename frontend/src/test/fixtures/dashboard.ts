import type {
  CourseCertificate,
  DashboardResponse,
  DaySummary,
  DayStatus,
  TimeTotals,
} from '@itp/types';
import { mockUser } from './user';

/* ---------- Raw rows: same columns as the DB tables (Prisma-style camelCase) ---------- */

type CourseRow = { id: string; title: string };
type CurriculumDayRow = {
  id: string;
  courseId: string;
  dayNumber: number;
  title: string;
  description: string;
};
type DayUnlockRow = {
  id: string;
  traineeId: string;
  curriculumDayId: string;
  unlocked: boolean;
  isCompleted: boolean;
};
// One row per trainee per calendar day, like the activity_log table.
type ActivityLogRow = {
  id: string;
  traineeId: string;
  date: string; // YYYY-MM-DD
  activeSeconds: number;
  codingSeconds: number;
};
type TypingTestResultRow = {
  id: string;
  traineeId: string;
  wpm: number;
  accuracy: number;
  takenAt: string; // ISO
};

const TRAINEE_ID = 'trainee-1';

// Array order = curriculum order (the schema has no sort column yet).
// Course ids must match CURRICULUM_COURSES in src/constants/courses.ts
const courses: CourseRow[] = [
  { id: 'html', title: 'HTML' },
  { id: 'css', title: 'CSS' },
  { id: 'js', title: 'JavaScript' },
  { id: 'ts', title: 'TypeScript' },
  { id: 'node', title: 'Node.js' },
  { id: 'postgresql', title: 'PostgreSQL' },
  { id: 'prisma', title: 'Prisma' },
  { id: 'react', title: 'React' },
];

const DAY_COUNTS: Record<string, number> = {
  html: 5,
  css: 5,
  js: 10,
  ts: 5,
  node: 5,
  postgresql: 6,
  prisma: 8,
  react: 10,
};

// Realistic title/description for specific days; every other day gets a generated one
const DAY_OVERRIDES: Partial<Record<string, { title: string; description: string }>> = {
  'css-day-03': {
    title: 'CSS Grid - Every Property, Complex Layouts',
    description: 'Build two-dimensional layouts using CSS Grid',
  },
};

function dayId(courseId: string, dayNumber: number): string {
  return `${courseId}-day-${String(dayNumber).padStart(2, '0')}`;
}

const curriculumDays: CurriculumDayRow[] = courses.flatMap((course) =>
  Array.from({ length: DAY_COUNTS[course.id] }, (_, i) => {
    const dayNumber = i + 1;
    const id = dayId(course.id, dayNumber);
    const override = DAY_OVERRIDES[id];

    return {
      id,
      courseId: course.id,
      dayNumber,
      title: override?.title ?? `${course.title} lesson ${dayNumber}`,
      description:
        override?.description ?? `Learn the key ideas of ${course.title}, lesson ${dayNumber}.`,
    };
  })
);

/**
 * day_unlock rows for one course: days 1..completed are completed, and the next
 * day (if it exists) is unlocked. A day with no row is locked.
 */
function unlockRows(courseId: string, completed: number): DayUnlockRow[] {
  const rows: DayUnlockRow[] = [];
  for (let n = 1; n <= Math.min(completed + 1, DAY_COUNTS[courseId]); n++) {
    rows.push({
      id: `unlock-${courseId}-${n}`,
      traineeId: TRAINEE_ID,
      curriculumDayId: dayId(courseId, n),
      unlocked: true,
      isCompleted: n <= completed,
    });
  }
  return rows;
}

// Change these numbers to move the trainee's progress.
// When a course is finished, add unlockRows('<next course>', 0) so its day 1 unlocks.
const dayUnlocks: DayUnlockRow[] = [
  ...unlockRows('html', 5),
  ...unlockRows('css', 5),
  ...unlockRows('js', 10),
  ...unlockRows('ts', 5),
  ...unlockRows('node', 5),
  ...unlockRows('postgresql', 6),
  ...unlockRows('prisma', 8),
  ...unlockRows('react', 1),
];

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const activityLog: ActivityLogRow[] = [4, 3, 2, 1, 0].map((daysAgo, i) => ({
  id: `activity-${i}`,
  traineeId: TRAINEE_ID,
  date: isoDaysAgo(daysAgo).slice(0, 10),
  activeSeconds: 5400 + i * 600,
  codingSeconds: 3600 + i * 400,
}));

const typingResults: TypingTestResultRow[] = [
  { wpm: 64, accuracy: 93, daysAgo: 4 },
  { wpm: 66, accuracy: 94, daysAgo: 3 },
  { wpm: 70, accuracy: 95, daysAgo: 2 },
  { wpm: 68, accuracy: 95, daysAgo: 1 },
  { wpm: 72, accuracy: 96, daysAgo: 0 },
  { wpm: 74, accuracy: 96, daysAgo: 0 },
].map((r, i) => ({
  id: `typing-${i}`,
  traineeId: TRAINEE_ID,
  wpm: r.wpm,
  accuracy: r.accuracy,
  takenAt: isoDaysAgo(r.daysAgo),
}));

/* ---------- Builders: what the backend services will do ---------- */

function statusOf(curriculumDayId: string): DayStatus {
  const unlock = dayUnlocks.find((u) => u.curriculumDayId === curriculumDayId);
  if (!unlock || !unlock.unlocked) return 'LOCKED';
  return unlock.isCompleted ? 'COMPLETED' : 'UNLOCKED';
}

/** Every day id, in curriculum order. The other mock fixtures are built from this list. */
export const mockCurriculumDayIds: string[] = curriculumDays.map((d) => d.id);

/**
 * The trainee's progress on one day, from the same day_unlock rows as the dashboard.
 * The day page and the task page read this too, so all three pages agree. Null for an unknown day.
 */
export function mockDayProgress(dayId: string): DayStatus | null {
  return mockCurriculumDayIds.includes(dayId) ? statusOf(dayId) : null;
}

function toSummary(row: CurriculumDayRow): DaySummary {
  return { ...row, status: statusOf(row.id) };
}

function sumActivity(rows: ActivityLogRow[]): TimeTotals {
  return rows.reduce(
    (acc, r) => ({
      activeSeconds: acc.activeSeconds + r.activeSeconds,
      codingSeconds: acc.codingSeconds + r.codingSeconds,
    }),
    { activeSeconds: 0, codingSeconds: 0 }
  );
}

function average(nums: number[]): number {
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/** GET /courses/:courseId/days */
export function buildCourseDays(courseId: string): DaySummary[] | null {
  if (!courses.some((c) => c.id === courseId)) return null;

  return curriculumDays
    .filter((d) => d.courseId === courseId)
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map(toSummary);
}

/** GET /dashboard */
export function buildDashboard(): DashboardResponse {
  const allDays = courses.flatMap((c) => buildCourseDays(c.id) ?? []); // curriculum order
  const todayDate = new Date().toISOString().slice(0, 10);

  // First unlocked, uncompleted day in curriculum order
  const next = allDays.find((d) => d.status === 'UNLOCKED');

  // typing_test_result -> latest, today's average, per-date average
  const byNewest = [...typingResults].sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  const latest = byNewest[0];
  const todayResults = typingResults.filter((r) => r.takenAt.slice(0, 10) === todayDate);
  const dates = [...new Set(typingResults.map((r) => r.takenAt.slice(0, 10)))].sort();

  return {
    nextDay: next
      ? { ...next, courseTotalDays: allDays.filter((d) => d.courseId === next.courseId).length }
      : null,
    totalDaysCompleteOverall: allDays.filter((d) => d.status === 'COMPLETED').length,
    totalDaysOverall: allDays.length,
    today: sumActivity(activityLog.filter((r) => r.date === todayDate)),
    total: sumActivity(activityLog),
    typing: {
      latest: latest
        ? { wpm: latest.wpm, accuracy: latest.accuracy, takenAt: latest.takenAt }
        : null,
      todayAverageWpm: todayResults.length ? average(todayResults.map((r) => r.wpm)) : null,
      trend: dates.map((date) => ({
        date,
        averageWpm: average(
          typingResults.filter((r) => r.takenAt.slice(0, 10) === date).map((r) => r.wpm)
        ),
      })),
    },
    completedCourseIds: completedCourseIds(),
  };
}
/** Ids of the courses whose every day is COMPLETED. */
function completedCourseIds(): string[] {
  return courses
    .filter((c) => (buildCourseDays(c.id) ?? []).every((d) => d.status === 'COMPLETED'))
    .map((c) => c.id);
}

/** GET /courses/:courseId/certificate */
export function buildCertificate(
  courseId: string
): { kind: 'no-course' } | { kind: 'locked' } | { kind: 'ok'; data: CourseCertificate } {
  const course = courses.find((c) => c.id === courseId);
  if (!course) return { kind: 'no-course' };
  if (!completedCourseIds().includes(courseId)) return { kind: 'locked' };

  return {
    kind: 'ok',
    data: {
      courseId,
      courseTitle: course.title,
      traineeName: mockUser.name,
      daysCompleted: DAY_COUNTS[courseId],
      completedAt: isoDaysAgo(1),
      issuedAt: isoDaysAgo(1),
      certificateId: `VK-${courseId.toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(20, '0').slice(0, 20)}`,
      status: 'ACTIVE',
      signature: 'mock-signature',
      signatureAlgorithm: 'Ed25519',
      signatureVersion: 'v1',
    },
  };
}
