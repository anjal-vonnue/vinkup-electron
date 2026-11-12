import type {
  AdminDay,
  AdminFlagEvent,
  AdminJournalEntry,
  AdminTaskCode,
  AdminTaskRow,
  AdminTraineeDetail,
  AdminTraineeSummary,
  FlagEventType,
  MeResponse,
  ProfileDay,
  TaskFile,
} from '@itp/types';
import { mockDayContents } from '../../api/dayOverview';
import { catalogDays, catalogTaskCode, findCatalogTask } from '../../api/mockTasks';
import type { CreateTraineeRequest } from '@itp/types';

// Mock data for the mentor pages (GET /admin/...). Built from the same catalog as the trainee
// pages, so day ids, task ids and titles match what a mentor sees when they open a task.

export const mockAdmin: MeResponse = {
  id: 'mock-admin-001',
  email: 'mentor@vonnue.com',
  name: 'Mock Mentor',
  role: 'admin',
};

type MockTrainee = {
  id: string;
  name: string;
  email: string;
  /** Days finished, counted from the first day of the curriculum. */
  completed: number;
  /** Days ago the trainee was last active, or null for "never". */
  lastActiveDaysAgo: number | null;
  todayActiveSeconds: number;
  latestWpm: number | null;
  latestAccuracy: number | null;
  /** Flag events: [type, days ago, duration in ms, priority]. */
  flags: [FlagEventType, number, number | null, AdminFlagEvent['reviewPriority']][];
  averageScore: number | null;
  daysScored: number;
};

const HOUR = 60 * 60;

// One trainee per situation the pages must handle: mid-course, far ahead, many flags,
// finished everything (currentDay null), and brand new (no activity, no typing result).
const trainees: MockTrainee[] = [
  {
    id: '3f0c1a52-8d4e-4b7a-9a11-0c5d2e7b1001',
    name: 'Rahul Sharma',
    email: 'rahul.sharma@vonnue.com',
    completed: 12,
    lastActiveDaysAgo: 0,
    todayActiveSeconds: 2 * HOUR + 15 * 60,
    latestWpm: 74,
    latestAccuracy: 96.4,
    flags: [
      ['TAB_SWITCH', 1, 12000, 'LOW'],
      ['WINDOW_BLUR', 3, 4000, 'LOW'],
    ],
    averageScore: 20,
    daysScored: 12,
  },
  {
    id: '3f0c1a52-8d4e-4b7a-9a11-0c5d2e7b1002',
    name: 'Priya Nair',
    email: 'priya.nair@vonnue.com',
    completed: 27,
    lastActiveDaysAgo: 0,
    todayActiveSeconds: 3 * HOUR + 40 * 60,
    latestWpm: 82,
    latestAccuracy: 98.1,
    flags: [],
    averageScore: 70,
    daysScored: 32,
  },
  {
    id: '3f0c1a52-8d4e-4b7a-9a11-0c5d2e7b1003',
    name: 'Arjun Menon',
    email: 'arjun.menon@vonnue.com',
    completed: 3,
    lastActiveDaysAgo: 1,
    todayActiveSeconds: 0,
    latestWpm: 48,
    latestAccuracy: 88.7,
    flags: [
      ['PASTE_BLOCKED', 0, null, 'HIGH'],
      ['PASTE_BLOCKED', 0, null, 'HIGH'],
      ['FULLSCREEN_EXIT', 1, 95000, 'HIGH'],
      ['TAB_SWITCH', 1, 240000, 'HIGH'],
      ['WINDOW_BLUR', 2, 31000, 'NORMAL'],
      ['TAB_SWITCH', 2, 18000, 'NORMAL'],
      ['FULLSCREEN_EXIT', 4, 8000, 'NORMAL'],
      ['PASTE_BLOCKED', 5, null, 'NORMAL'],
      ['WINDOW_BLUR', 6, 2500, 'LOW'],
      ['TAB_SWITCH', 9, 6000, 'LOW'],
    ],
    averageScore: 81,
    daysScored: 32,
  },
  {
    id: '3f0c1a52-8d4e-4b7a-9a11-0c5d2e7b1004',
    name: 'Sneha Iyer',
    email: 'sneha.iyer@vonnue.com',
    completed: catalogDays.length,
    lastActiveDaysAgo: 2,
    todayActiveSeconds: 0,
    latestWpm: 91,
    latestAccuracy: 99,
    flags: [['WINDOW_BLUR', 20, 3000, 'LOW']],
    averageScore: 90,
    daysScored: 2,
  },
  {
    id: '3f0c1a52-8d4e-4b7a-9a11-0c5d2e7b1005',
    name: 'Karthik Raj',
    email: 'karthik.raj@vonnue.com',
    completed: 0,
    lastActiveDaysAgo: null,
    todayActiveSeconds: 0,
    latestWpm: null,
    latestAccuracy: null,
    flags: [],
    averageScore: null,
    daysScored: 0,
  },
];

/* ---------- Small helpers ---------- */

function daysAgoDate(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function isoDaysAgo(n: number, hour = 10): string {
  const d = daysAgoDate(n);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
}

function dayTitle(dayId: string, fallback: string): string {
  return mockDayContents[dayId]?.title ?? fallback;
}

function courseIdOf(dayId: string): string {
  return dayId.split('-day-')[0];
}

function requireTrainee(traineeId: string): MockTrainee | null {
  return trainees.find((t) => t.id === traineeId) ?? null;
}

/** Hours of work spread over the days a trainee has been active; made up but stable. */
function totalsFor(t: MockTrainee): { active: number; coding: number } {
  const active = t.completed * 2.2 * HOUR + t.todayActiveSeconds;
  return { active: Math.round(active), coding: Math.round(active * 0.55) };
}

/* ---------- GET /admin/trainees ---------- */

export function buildAdminTrainees(): AdminTraineeSummary[] {
  return trainees.map((t) => {
    const current = catalogDays[t.completed] ?? null;
    const totals = totalsFor(t);
    const lastActive = t.lastActiveDaysAgo === null ? null : daysAgoDate(t.lastActiveDaysAgo);

    return {
      id: t.id,
      name: t.name,
      email: t.email,
      daysCompleted: t.completed,
      totalDays: catalogDays.length,
      currentDay: current
        ? {
            id: current.dayId,
            courseTitle: current.courseTitle,
            dayNumber: current.dayNumber,
            title: dayTitle(current.dayId, `${current.courseTitle} day ${current.dayNumber}`),
          }
        : null,
      todayActiveSeconds: t.todayActiveSeconds,
      totalActiveSeconds: totals.active,
      totalCodingSeconds: totals.coding,
      lastActiveDate: lastActive ? lastActive.toISOString().slice(0, 10) : null,
      latestWpm: t.latestWpm,
      flagsLast7Days: t.flags.filter(([, daysAgo]) => daysAgo < 7).length,
      averageScore: t.averageScore,
      daysScored: t.daysScored,
    };
  });
}

/* ---------- GET /admin/trainees/:traineeId ---------- */

function buildCourses(t: MockTrainee): AdminTraineeDetail['courses'] {
  const courses: AdminTraineeDetail['courses'] = [];

  catalogDays.forEach((day, index) => {
    const id = courseIdOf(day.dayId);
    let course = courses.find((c) => c.id === id);
    if (!course) {
      course = { id, title: day.courseTitle, days: [] };
      courses.push(course);
    }

    const status: AdminDay['status'] =
      index < t.completed ? 'COMPLETED' : index === t.completed ? 'UNLOCKED' : 'LOCKED';

    course.days.push({
      id: day.dayId,
      dayNumber: day.dayNumber,
      title: dayTitle(day.dayId, `${day.courseTitle} day ${day.dayNumber}`),
      status,
      // The most recent completed day finished yesterday; earlier ones one more day back each.
      completedAt: status === 'COMPLETED' ? isoDaysAgo(t.completed - index, 17) : null,
    });
  });

  return courses;
}

/** Tasks that have a task_progress row: everything required on finished days + the current one. */
function buildTaskRows(t: MockTrainee): AdminTaskRow[] {
  const rows: AdminTaskRow[] = [];

  catalogDays.slice(0, t.completed + 1).forEach((day, index) => {
    const isCurrentDay = index === t.completed;
    const daysBack = t.completed - index;

    day.tasks.forEach((task, taskIndex) => {
      if (isCurrentDay) {
        // Only the first task has been started on the current day.
        if (taskIndex > 0) return;
        rows.push({
          taskId: task.id,
          title: task.title,
          dayId: day.dayId,
          isStretchGoal: task.isStretchGoal,
          status: 'in_progress',
          codeUpdatedAt: isoDaysAgo(0, 11),
          lastSubmittedAt: null,
        });
        return;
      }
      // Stretch goals are optional: the trainee skipped them on finished days.
      if (task.isStretchGoal) return;
      rows.push({
        taskId: task.id,
        title: task.title,
        dayId: day.dayId,
        isStretchGoal: false,
        status: 'completed',
        codeUpdatedAt: isoDaysAgo(daysBack, 14),
        lastSubmittedAt: isoDaysAgo(daysBack, 15),
      });
    });
  });

  // Newest saved code first, like the real query.
  return rows.sort((a, b) => (b.codeUpdatedAt ?? '').localeCompare(a.codeUpdatedAt ?? ''));
}

function buildJournal(t: MockTrainee): AdminJournalEntry[] {
  const entries: AdminJournalEntry[] = [];

  catalogDays.slice(0, t.completed).forEach((day, index) => {
    // Not every day has a journal entry.
    if (index % 3 !== 0) return;
    entries.push({
      dayId: day.dayId,
      courseTitle: day.courseTitle,
      dayNumber: day.dayNumber,
      dayTitle: dayTitle(day.dayId, `${day.courseTitle} day ${day.dayNumber}`),
      responseText:
        `Today I worked through ${day.courseTitle} day ${day.dayNumber}.\n\n` +
        'What clicked: the examples made more sense once I typed them out myself.\n' +
        'Still unsure: when to pick one approach over the other. I will ask in the next review.',
      updatedAt: isoDaysAgo(t.completed - index, 18),
    });
  });

  return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function buildProfileDays(t: MockTrainee): ProfileDay[] {
  return Array.from({ length: 7 }, (_, daysAgo) => {
    const neverActive = t.lastActiveDaysAgo === null || daysAgo < t.lastActiveDaysAgo;
    return {
      date: daysAgoDate(daysAgo).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
      timeSpentSeconds:
        neverActive && daysAgo !== 0
          ? 0
          : daysAgo === 0
            ? t.todayActiveSeconds
            : 3 * HOUR + ((daysAgo * 17) % 6) * 600,
      typingWpm: t.latestWpm === null ? null : t.latestWpm - daysAgo,
      isToday: daysAgo === 0,
    };
  });
}

export function buildAdminTraineeDetail(traineeId: string): AdminTraineeDetail | null {
  const t = requireTrainee(traineeId);
  if (!t) return null;

  const current = catalogDays[Math.min(t.completed, catalogDays.length - 1)];
  const sameCourse = catalogDays.filter((d) => courseIdOf(d.dayId) === courseIdOf(current.dayId));
  const totals = totalsFor(t);

  return {
    id: t.id,
    profile: {
      trainee: {
        name: t.name,
        email: t.email,
        track: current.courseTitle,
        currentDay: current.dayNumber,
        totalDays: sameCourse.length,
      },
      total: { activeSeconds: totals.active, codingSeconds: totals.coding },
      typing: { latestWpm: t.latestWpm, latestAccuracy: t.latestAccuracy },
      dailyActivity: buildProfileDays(t),
    },
    typingStats: {
      averageWpm: t.latestWpm ?? 0,
      averageAccuracy: t.latestAccuracy ?? 0,
      highestWpm: t.latestWpm,
      highestWpmAccuracy: t.latestAccuracy,
    },
    courses: buildCourses(t),
    tasks: buildTaskRows(t),
    totalTasks: 7,
    journal: buildJournal(t),
  };
}

/* ---------- GET /admin/trainees/:traineeId/flags ---------- */

export function buildAdminFlags(traineeId: string): AdminFlagEvent[] | null {
  const t = requireTrainee(traineeId);
  if (!t) return null;

  // Flags point at tasks the trainee actually worked on.
  const worked = buildTaskRows(t);
  if (worked.length === 0) return [];

  return t.flags
    .map(([type, daysAgo, durationMs, reviewPriority], index): AdminFlagEvent => {
      const task = worked[index % worked.length];
      return {
        id: `${t.id.slice(-4)}-flag-${index + 1}`,
        type,
        taskId: task.taskId,
        taskTitle: task.title,
        dayId: task.dayId,
        durationMs,
        reviewPriority,
        timestamp: isoDaysAgo(daysAgo, 9 + (index % 8)),
      };
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // newest first
}

/* ---------- GET /admin/trainees/:traineeId/tasks/:taskId/code ---------- */

function mockWorkLine(path: string): string {
  if (path.endsWith('.html')) return '<!-- mock: trainee work saved here -->';
  if (path.endsWith('.css')) return '/* mock: trainee work saved here */';
  if (path.endsWith('.sql') || path.endsWith('.prisma')) return '-- mock: trainee work saved here';
  return '// mock: trainee work saved here';
}

export type AdminTaskCodeResult =
  { kind: 'ok'; data: AdminTaskCode } | { kind: 'no-trainee' } | { kind: 'no-task' };

export function buildAdminTaskCode(traineeId: string, taskId: string): AdminTaskCodeResult {
  const t = requireTrainee(traineeId);
  if (!t) return { kind: 'no-trainee' };

  const found = findCatalogTask(taskId);
  const starter = catalogTaskCode(taskId);
  if (!found || !starter) return { kind: 'no-task' };

  const row = buildTaskRows(t).find((r) => r.taskId === taskId);

  // No progress row = never saved: the real API sends the starter files and isStarterCode: true.
  if (!row) {
    return {
      kind: 'ok',
      data: {
        taskId,
        title: found.task.title,
        status: 'not_started',
        isStarterCode: true,
        files: starter.files,
        codeUpdatedAt: null,
        lastSubmittedAt: null,
      },
    };
  }

  const files: TaskFile[] = starter.files.map((file, index) =>
    index === 0 ? { ...file, content: `${file.content}\n${mockWorkLine(file.path)}\n` } : file
  );

  return {
    kind: 'ok',
    data: {
      taskId,
      title: found.task.title,
      status: row.status,
      isStarterCode: false,
      files,
      codeUpdatedAt: row.codeUpdatedAt,
      lastSubmittedAt: row.lastSubmittedAt,
    },
  };
}

/** Ids the tests and pages can rely on. */
export const mockAdminTraineeIds = trainees.map((t) => t.id);

export type AddMockTraineeResult =
  | { kind: 'created'; trainee: AdminTraineeSummary }
  | { kind: 'exists' }
  | { kind: 'admin' }
  | { kind: 'domain' };

/** POST /admin/trainees in mock mode. Same rules as the backend. */
export function addMockTrainee(body: CreateTraineeRequest): AddMockTraineeResult {
  const email = body.email.trim().toLowerCase();
  if (!email.endsWith('@vonnue.com')) return { kind: 'domain' };
  if (email === mockAdmin.email) return { kind: 'admin' };
  if (trainees.some((t) => t.email === email)) return { kind: 'exists' };

  const id = crypto.randomUUID();
  trainees.push({
    id,
    name: body.name.trim().replace(/\s+/g, ' '),
    email,
    completed: 0,
    lastActiveDaysAgo: null,
    todayActiveSeconds: 0,
    latestWpm: null,
    latestAccuracy: null,
    flags: [],
    averageScore: 0,
    daysScored: 0,
  });
  const trainee = buildAdminTrainees().find((t) => t.id === id) as AdminTraineeSummary;
  return { kind: 'created', trainee };
}
