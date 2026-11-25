import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DashboardResponse } from '@itp/types';
import { db } from './helpers/db';
import {
  DAY,
  TASK,
  createAdmin,
  freshTrainees,
  istDate,
  istDateString,
  markDayCompleted,
  minutesAgo,
  seedCurriculum,
  type TestTrainee,
} from './helpers/fixtures';
import { api, body, expectIsoDateTime } from './helpers/http';

let a: TestTrainee;
let b: TestTrainee;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a, b } = await freshTrainees());
});

async function getDashboard(trainee: TestTrainee): Promise<DashboardResponse> {
  const res = await api.get('/api/dashboard', trainee.cookie);
  expect(res.status).toBe(200);
  return body<DashboardResponse>(res);
}

describe('GET /api/dashboard', () => {
  it('shows day 1 as the next day and zeros for a new trainee', async () => {
    const dashboard = await getDashboard(a);

    expect(dashboard).toEqual({
      nextDay: {
        id: DAY.html1,
        courseId: 'html',
        dayNumber: 1,
        title: 'HTML5 Document Structure',
        description: 'Build valid HTML pages.',
        status: 'UNLOCKED',
        courseTotalDays: 2,
      },
      totalDaysCompleteOverall: 0,
      totalDaysOverall: 3,
      today: { activeSeconds: 0, codingSeconds: 0 },
      total: { activeSeconds: 0, codingSeconds: 0 },
      typing: { latest: null, todayAverageWpm: null, trend: [] },
      completedCourseIds: [],
    });
  });

  it('moves the next day forward, across courses, as days are completed', async () => {
    await markDayCompleted(a.id, DAY.html1);
    expect((await getDashboard(a)).nextDay?.id).toBe(DAY.html2);

    await markDayCompleted(a.id, DAY.html2);
    const dashboard = await getDashboard(a);

    expect(dashboard.nextDay).toMatchObject({
      id: DAY.pg1,
      courseId: 'postgresql',
      status: 'UNLOCKED',
      courseTotalDays: 1,
    });
    expect(dashboard.totalDaysCompleteOverall).toBe(2);
  });

  it('returns nextDay null when every day is completed', async () => {
    await markDayCompleted(a.id, DAY.html1);
    await markDayCompleted(a.id, DAY.html2);
    await markDayCompleted(a.id, DAY.pg1);

    const dashboard = await getDashboard(a);

    expect(dashboard.nextDay).toBeNull();
    expect(dashboard.totalDaysCompleteOverall).toBe(3);
  });

  it("returns today's activity and all-time totals", async () => {
    await db.activity_log.createMany({
      data: [
        {
          trainee_id: a.id,
          date: istDate(0),
          active_seconds: 660,
          coding_seconds: 400,
        },
        {
          trainee_id: a.id,
          date: istDate(2),
          active_seconds: 1000,
          coding_seconds: 700,
        },
      ],
    });

    const dashboard = await getDashboard(a);

    expect(dashboard.today).toEqual({
      activeSeconds: 660,
      codingSeconds: 400,
    });

    // activeSeconds is total platform time and already includes coding time.
    expect(dashboard.total).toEqual({
      activeSeconds: 1660,
      codingSeconds: 1100,
    });
  });

  it("builds the typing summary: latest, today's rounded average, per-day trend oldest first", async () => {
    await db.typing_test_result.createMany({
      data: [
        {
          trainee_id: a.id,
          wpm: 60,
          accuracy: 90,
          taken_at: new Date(`${istDateString(2)}T06:00:00.000Z`),
        },
        {
          trainee_id: a.id,
          wpm: 64,
          accuracy: 92,
          taken_at: new Date(`${istDateString(2)}T07:00:00.000Z`),
        },
        { trainee_id: a.id, wpm: 70, accuracy: 95, taken_at: minutesAgo(30) },
        { trainee_id: a.id, wpm: 73, accuracy: 96.5, taken_at: minutesAgo(5) },
      ],
    });

    const { typing } = await getDashboard(a);

    expect(typing.latest).toMatchObject({ wpm: 73, accuracy: 96.5 });
    expectIsoDateTime(typing.latest?.takenAt);
    expect(typing.todayAverageWpm).toBe(72);
    expect(typing.trend).toEqual([
      { date: istDateString(2), averageWpm: 62 },
      { date: istDateString(0), averageWpm: 72 },
    ]);
  });

  it("never counts another trainee's progress, activity or typing", async () => {
    await markDayCompleted(b.id, DAY.html1);

    await db.activity_log.create({
      data: {
        trainee_id: b.id,
        date: istDate(0),
        active_seconds: 500,
        coding_seconds: 250,
      },
    });

    await db.typing_test_result.create({
      data: { trainee_id: b.id, wpm: 90, accuracy: 99 },
    });

    const dashboard = await getDashboard(a);

    expect(dashboard.nextDay?.id).toBe(DAY.html1);
    expect(dashboard.totalDaysCompleteOverall).toBe(0);
    expect(dashboard.today).toEqual({
      activeSeconds: 0,
      codingSeconds: 0,
    });
    expect(dashboard.total).toEqual({
      activeSeconds: 0,
      codingSeconds: 0,
    });
    expect(dashboard.typing.latest).toBeNull();
  });

  it('does not send the course or day lists', async () => {
    const res = await api.get('/api/dashboard', a.cookie);

    expect(body<object>(res)).not.toHaveProperty('courses');
    expect(body<object>(res)).not.toHaveProperty('days');
  });
});

describe('dashboard unread task comments', () => {
  it('lists each unread approval comment and marks only the selected comment read', async () => {
    const mentor = await createAdmin('Comment Mentor');
    await markDayCompleted(a.id, DAY.html1);
    await db.task_progress.update({
      where: { trainee_id_task_id: { trainee_id: a.id, task_id: TASK.html1Main } },
      data: { review_status: 'approved', submission_count: 2 },
    });
    const first = await db.task_review.create({
      data: {
        trainee_id: a.id,
        task_id: TASK.html1Main,
        admin_id: mentor.id,
        submission_no: 1,
        decision: 'approved',
        feedback: 'First optional suggestion.',
        reviewed_at: new Date('2026-11-23T10:00:00.000Z'),
      },
    });
    const second = await db.task_review.create({
      data: {
        trainee_id: a.id,
        task_id: TASK.html1Main,
        admin_id: mentor.id,
        submission_no: 2,
        decision: 'approved',
        feedback: 'Another optional suggestion.',
        reviewed_at: new Date('2026-11-24T10:00:00.000Z'),
      },
    });

    const initial = await api.get('/api/dashboard/unread-comments', a.cookie);
    expect(initial.status).toBe(200);
    expect(body<unknown[]>(initial)).toHaveLength(2);
    expect(body<Record<string, unknown>[]>(initial)[0]).toMatchObject({
      id: second.id,
      taskId: TASK.html1Main,
      taskTitle: 'Profile page',
      dayId: DAY.html1,
      dayNumber: 1,
      courseTitle: 'HTML',
      adminName: 'Comment Mentor',
      feedback: 'Another optional suggestion.',
    });

    expect(
      (await api.patch(`/api/dashboard/unread-comments/${first.id}/read`, {}, a.cookie)).status
    ).toBe(204);
    // Repeating the same update is idempotent.
    expect(
      (await api.patch(`/api/dashboard/unread-comments/${first.id}/read`, {}, a.cookie)).status
    ).toBe(204);
    const remaining = body<{ id: string }[]>(
      await api.get('/api/dashboard/unread-comments', a.cookie)
    );
    expect(remaining.map((comment) => comment.id)).toEqual([second.id]);
  });

  it('does not expose or allow marking another trainee comment as read', async () => {
    const mentor = await createAdmin('Comment Mentor');
    await markDayCompleted(a.id, DAY.html1);
    await db.task_progress.update({
      where: { trainee_id_task_id: { trainee_id: a.id, task_id: TASK.html1Main } },
      data: { review_status: 'approved' },
    });
    const review = await db.task_review.create({
      data: {
        trainee_id: a.id,
        task_id: TASK.html1Main,
        admin_id: mentor.id,
        submission_no: 1,
        decision: 'approved',
        feedback: 'Private suggestion.',
      },
    });

    expect(body<unknown[]>(await api.get('/api/dashboard/unread-comments', b.cookie))).toEqual([]);
    expect(
      (await api.patch(`/api/dashboard/unread-comments/${review.id}/read`, {}, b.cookie)).status
    ).toBe(404);
    expect(
      (await db.task_review.findUnique({ where: { id: review.id } }))?.trainee_read_at
    ).toBeNull();
  });
});
