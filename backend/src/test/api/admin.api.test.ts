import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type {
  AdminFlagEvent,
  AdminTaskCode,
  AdminTraineeDetail,
  AdminTraineeSummary,
  ProfileData,
} from '@itp/types';
import app from '../../app';
import { db } from './helpers/db';
import {
  DAY,
  STARTER_FILES,
  TASK,
  createAdmin,
  freshTrainees,
  istDate,
  istDateString,
  markDayCompleted,
  minutesAgo,
  seedCurriculum,
  type TestAdmin,
  type TestTrainee,
} from './helpers/fixtures';
import { api, body, expectError, expectIsoDateTime } from './helpers/http';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

let a: TestTrainee;
let b: TestTrainee;
let admin: TestAdmin;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a, b } = await freshTrainees());
  admin = await createAdmin('Test Mentor');
});

async function getAs<T>(path: string, cookie: string): Promise<T> {
  const res = await api.get(path, cookie);
  expect(res.status).toBe(200);
  return body<T>(res);
}

function rowFor(list: AdminTraineeSummary[], trainee: TestTrainee): AdminTraineeSummary {
  const row = list.find((r) => r.id === trainee.id);
  expect(row).toBeDefined();
  return row as AdminTraineeSummary;
}

const listTrainees = () => getAs<AdminTraineeSummary[]>('/api/admin/trainees', admin.cookie);

describe('access to /api/admin', () => {
  const paths = () => [
    '/api/admin/trainees',
    `/api/admin/trainees/${a.id}`,
    `/api/admin/trainees/${a.id}/flags`,
    `/api/admin/trainees/${a.id}/tasks/${TASK.html1Main}/code`,
  ];

  it('returns 403 FORBIDDEN to a trainee on every admin endpoint', async () => {
    for (const path of paths()) {
      expectError(await api.get(path, a.cookie), 403, 'FORBIDDEN');
    }
  });

  it('returns 403 FORBIDDEN to an admin who has been deactivated', async () => {
    const former = await createAdmin('Former Mentor', false);
    for (const path of paths()) {
      expectError(await api.get(path, former.cookie), 403, 'FORBIDDEN');
    }
  });

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'has no %s routes: admins cannot change trainee data',
    async (method) => {
      const res = await request(app)
        [method](`/api/admin/trainees/${a.id}`)
        .set('Cookie', admin.cookie)
        .send({});
      expectError(res, 404, 'NOT_FOUND');
    }
  );
});

describe('GET /api/admin/trainees', () => {
  it('lists every trainee sorted by name, and never an admin', async () => {
    const list = await listTrainees();

    expect(list.map((r) => r.name)).toEqual(['Trainee A', 'Trainee B']);
    expect(list.map((r) => r.email)).not.toContain(admin.email);
  });

  it('shows a new trainee on the first day with zeros', async () => {
    expect(rowFor(await listTrainees(), a)).toEqual({
      id: a.id,
      name: 'Trainee A',
      email: a.email,
      daysCompleted: 0,
      totalDays: 3,
      currentDay: {
        id: DAY.html1,
        courseTitle: 'HTML',
        dayNumber: 1,
        title: 'HTML5 Document Structure',
      },
      todayActiveSeconds: 0,
      totalActiveSeconds: 0,
      totalCodingSeconds: 0,
      lastActiveDate: null,
      latestWpm: null,
      flagsLast7Days: 0,
      averageScore: null,
      daysScored: 0,
    });
  });

  it('moves the current day on as days are completed, per trainee', async () => {
    await markDayCompleted(a.id, DAY.html1);

    const list = await listTrainees();

    expect(rowFor(list, a)).toMatchObject({ daysCompleted: 1, currentDay: { id: DAY.html2 } });
    expect(rowFor(list, b)).toMatchObject({ daysCompleted: 0, currentDay: { id: DAY.html1 } });
  });

  it('shows currentDay null after the last day', async () => {
    for (const day of [DAY.html1, DAY.html2, DAY.pg1]) await markDayCompleted(a.id, day);

    expect(rowFor(await listTrainees(), a)).toMatchObject({ daysCompleted: 3, currentDay: null });
  });

  it("sums activity and shows today's time and the last active date", async () => {
    await db.activity_log.createMany({
      data: [
        { trainee_id: a.id, date: istDate(0), active_seconds: 600, coding_seconds: 300 },
        { trainee_id: a.id, date: istDate(2), active_seconds: 1200, coding_seconds: 100 },
      ],
    });

    expect(rowFor(await listTrainees(), a)).toMatchObject({
      todayActiveSeconds: 600,
      totalActiveSeconds: 1800,
      totalCodingSeconds: 400,
      lastActiveDate: istDateString(0),
    });
  });

  it('shows the latest typing result', async () => {
    await db.typing_test_result.createMany({
      data: [
        { trainee_id: a.id, wpm: 40, accuracy: 90, taken_at: minutesAgo(60) },
        { trainee_id: a.id, wpm: 55, accuracy: 96, taken_at: minutesAgo(5) },
      ],
    });

    expect(rowFor(await listTrainees(), a).latestWpm).toBe(55);
  });

  it('counts only flags from the last 7 days, per trainee', async () => {
    await db.flag_event.createMany({
      data: [
        {
          trainee_id: b.id,
          task_id: TASK.html1Main,
          type: 'TAB_SWITCH',
          duration_ms: 4000,
          timestamp: minutesAgo(60),
        },
        {
          trainee_id: b.id,
          task_id: TASK.html1Main,
          type: 'FULLSCREEN_EXIT',
          timestamp: minutesAgo(5),
        },
        {
          trainee_id: b.id,
          task_id: TASK.html1Main,
          type: 'PASTE_BLOCKED',
          timestamp: minutesAgo(8 * 24 * 60),
        },
      ],
    });

    const list = await listTrainees();

    expect(rowFor(list, b).flagsLast7Days).toBe(2);
    expect(rowFor(list, a).flagsLast7Days).toBe(0);
  });
});

describe('GET /api/admin/trainees/:traineeId', () => {
  it('returns exactly the profile the trainee sees on /api/profile', async () => {
    const detail = await getAs<AdminTraineeDetail>(`/api/admin/trainees/${a.id}`, admin.cookie);
    const own = await getAs<ProfileData>('/api/profile', a.cookie);

    expect(detail.id).toBe(a.id);
    expect(detail.profile).toEqual(own);
  });

  it('returns the day grid by course with statuses', async () => {
    await markDayCompleted(a.id, DAY.html1);

    const { courses } = await getAs<AdminTraineeDetail>(
      `/api/admin/trainees/${a.id}`,
      admin.cookie
    );

    expect(courses.map((c) => c.id)).toEqual(['html', 'postgresql']);
    expect(courses[0].days.map((d) => [d.id, d.status])).toEqual([
      [DAY.html1, 'COMPLETED'],
      [DAY.html2, 'UNLOCKED'],
    ]);
    expect(courses[1].days.map((d) => [d.id, d.status])).toEqual([[DAY.pg1, 'LOCKED']]);
    expectIsoDateTime(courses[0].days[0].completedAt);
    expect(courses[0].days[1].completedAt).toBeNull();
  });

  it("returns only the completed tasks, and nothing of another trainee's", async () => {
    // markDayCompleted completes the day's required task (html1Main), not its stretch task.
    await markDayCompleted(a.id, DAY.html1);

    // This task is in progress and should NOT be returned by the admin API.
    await db.task_progress.create({
      data: {
        trainee_id: a.id,
        task_id: TASK.html2First,
        status: 'in_progress',
        files: [{ path: 'index.html', content: '<article>draft</article>' }],
        code_updated_at: new Date(),
      },
    });

    await db.journal_response.create({
      data: {
        trainee_id: a.id,
        curriculum_day_id: DAY.html1,
        response_text: 'Learned the boilerplate.',
      },
    });

    const detailA = await getAs<AdminTraineeDetail>(`/api/admin/trainees/${a.id}`, admin.cookie);
    const detailB = await getAs<AdminTraineeDetail>(`/api/admin/trainees/${b.id}`, admin.cookie);

    // Only the completed task should be returned.
    expect(detailA.tasks).toEqual([
      expect.objectContaining({
        taskId: TASK.html1Main,
        title: 'Profile page',
        dayId: DAY.html1,
        isStretchGoal: false,
        status: 'completed',
      }),
    ]);

    expectIsoDateTime(detailA.tasks[0].lastSubmittedAt);

    // The in-progress task should not be returned.
    expect(detailA.tasks.some((task) => task.taskId === TASK.html2First)).toBe(false);

    expect(detailA.journal).toEqual([
      expect.objectContaining({
        dayId: DAY.html1,
        courseTitle: 'HTML',
        dayNumber: 1,
        dayTitle: 'HTML5 Document Structure',
        responseText: 'Learned the boilerplate.',
      }),
    ]);

    expect(detailB.tasks).toEqual([]);
    expect(detailB.journal).toEqual([]);
  });

  it('lists started tasks in curriculum order, not the order they were started in', async () => {
    const data = { status: 'completed' as const, files: STARTER_FILES };
    await db.task_progress.create({
      data: { trainee_id: a.id, task_id: TASK.pg1Sql, ...data },
    });
    await db.task_progress.create({
      data: { trainee_id: a.id, task_id: TASK.html2First, ...data },
    });
    await db.task_progress.create({
      data: { trainee_id: a.id, task_id: TASK.html1Main, ...data },
    });

    const { tasks } = await getAs<AdminTraineeDetail>(`/api/admin/trainees/${a.id}`, admin.cookie);

    expect(tasks.map((t) => t.taskId)).toEqual([TASK.html1Main, TASK.html2First, TASK.pg1Sql]);
  });

  it('leaves out a task whose progress row says it was never started', async () => {
    await db.task_progress.create({
      data: { trainee_id: a.id, task_id: TASK.html1Main, status: 'not_started' },
    });

    const { tasks } = await getAs<AdminTraineeDetail>(`/api/admin/trainees/${a.id}`, admin.cookie);

    expect(tasks).toEqual([]);
  });

  it('returns 404 NOT_FOUND for an unknown trainee', async () => {
    expectError(await api.get(`/api/admin/trainees/${UNKNOWN_ID}`, admin.cookie), 404, 'NOT_FOUND');
  });

  it("returns 404 NOT_FOUND for an admin's own id (admins are not trainees)", async () => {
    expectError(await api.get(`/api/admin/trainees/${admin.id}`, admin.cookie), 404, 'NOT_FOUND');
  });

  it('returns 400 VALIDATION_FAILED for an id that is not a UUID', async () => {
    expectError(
      await api.get('/api/admin/trainees/not-a-uuid', admin.cookie),
      400,
      'VALIDATION_FAILED'
    );
  });
});

describe('GET /api/admin/trainees/:traineeId/flags', () => {
  it("returns the trainee's flags newest first, and none of another trainee", async () => {
    await db.flag_event.createMany({
      data: [
        {
          trainee_id: b.id,
          task_id: TASK.html1Main,
          type: 'TAB_SWITCH',
          duration_ms: 4000,
          timestamp: minutesAgo(60),
        },
        {
          trainee_id: b.id,
          task_id: TASK.html1Main,
          type: 'FULLSCREEN_EXIT',
          timestamp: minutesAgo(5),
        },
      ],
    });

    const flagsB = await getAs<AdminFlagEvent[]>(`/api/admin/trainees/${b.id}/flags`, admin.cookie);
    const flagsA = await getAs<AdminFlagEvent[]>(`/api/admin/trainees/${a.id}/flags`, admin.cookie);

    expect(flagsB.map((f) => f.type)).toEqual(['FULLSCREEN_EXIT', 'TAB_SWITCH']);
    expect(flagsB[1]).toMatchObject({
      taskId: TASK.html1Main,
      taskTitle: 'Profile page',
      dayId: DAY.html1,
      durationMs: 4000,
      reviewPriority: 'NORMAL',
    });
    expect(flagsB[0].durationMs).toBeNull();
    expectIsoDateTime(flagsB[0].timestamp);
    expect(flagsA).toEqual([]);
  });

  it('returns 404 NOT_FOUND for an unknown trainee', async () => {
    expectError(
      await api.get(`/api/admin/trainees/${UNKNOWN_ID}/flags`, admin.cookie),
      404,
      'NOT_FOUND'
    );
  });
});

describe('GET /api/admin/trainees/:traineeId/tasks/:taskId/code', () => {
  const codeUrl = (trainee: string, task: string) =>
    `/api/admin/trainees/${trainee}/tasks/${task}/code`;

  it('returns the starter files when the trainee never saved', async () => {
    const code = await getAs<AdminTaskCode>(codeUrl(a.id, TASK.html1Main), admin.cookie);

    expect(code).toEqual({
      taskId: TASK.html1Main,
      title: 'Profile page',
      status: 'not_started',
      isStarterCode: true,
      reviewStatus: null,
      submissionCount: 0,
      files: STARTER_FILES,
      codeUpdatedAt: null,
      lastSubmittedAt: null,
    });
  });

  it('returns the trainee’s saved files', async () => {
    const saved = [
      { path: 'index.html', content: '<h1>Mine</h1>' },
      { path: 'style.css', content: 'h1 { color: red; }' },
    ];
    await db.task_progress.create({
      data: {
        trainee_id: a.id,
        task_id: TASK.html1Main,
        status: 'in_progress',
        files: saved,
        code_updated_at: new Date(),
      },
    });

    const code = await getAs<AdminTaskCode>(codeUrl(a.id, TASK.html1Main), admin.cookie);

    expect(code).toMatchObject({ status: 'in_progress', isStarterCode: false, files: saved });
    expectIsoDateTime(code.codeUpdatedAt);
  });

  it("never returns another trainee's code", async () => {
    await db.task_progress.create({
      data: {
        trainee_id: b.id,
        task_id: TASK.html1Main,
        status: 'in_progress',
        files: [{ path: 'index.html', content: '<h1>B only</h1>' }],
        code_updated_at: new Date(),
      },
    });

    const code = await getAs<AdminTaskCode>(codeUrl(a.id, TASK.html1Main), admin.cookie);

    expect(code.files).toEqual(STARTER_FILES);
  });

  it('returns 404 NOT_FOUND for an unknown task or trainee', async () => {
    expectError(await api.get(codeUrl(a.id, 'html-day-99-t-1'), admin.cookie), 404, 'NOT_FOUND');
    expectError(await api.get(codeUrl(UNKNOWN_ID, TASK.html1Main), admin.cookie), 404, 'NOT_FOUND');
  });
});
