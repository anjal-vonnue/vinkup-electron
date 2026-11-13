import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AdminAnalytics } from '@itp/types';
import { db } from './helpers/db';
import {
  DAY,
  createAdmin,
  freshTrainees,
  istDate,
  istDateString,
  markDayCompleted,
  seedCurriculum,
  type TestAdmin,
  type TestTrainee,
} from './helpers/fixtures';
import { api, body, expectError } from './helpers/http';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const TASKS_IN_CURRICULUM = 6; // see seedCurriculum

// The last 7 IST days, today included.
const FROM = istDateString(6);
const TO = istDateString(0);
const lastWeek = (extra = '') => `/api/admin/analytics?from=${FROM}&to=${TO}${extra}`;

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

async function getAnalytics(extra = ''): Promise<AdminAnalytics> {
  const res = await api.get(lastWeek(extra), admin.cookie);
  expect(res.status).toBe(200);
  return body<AdminAnalytics>(res);
}

describe('GET /api/admin/analytics: access', () => {
  it('returns 401 without a login', async () => {
    expectError(await api.get(lastWeek()), 401, 'UNAUTHENTICATED');
  });

  it('returns 403 to a trainee', async () => {
    expectError(await api.get(lastWeek(), a.cookie), 403, 'FORBIDDEN');
  });

  it('returns 403 to an admin who has been deactivated', async () => {
    const former = await createAdmin('Former Mentor', false);
    expectError(await api.get(lastWeek(), former.cookie), 403, 'FORBIDDEN');
  });
});

describe('GET /api/admin/analytics: validation', () => {
  it.each([
    ['no dates', '/api/admin/analytics'],
    ['a date that does not exist', '/api/admin/analytics?from=2026-02-30&to=2026-03-01'],
    ['from after to', `/api/admin/analytics?from=${TO}&to=${FROM}`],
    ['a date in the future', `/api/admin/analytics?from=${FROM}&to=2999-01-01`],
    ['more than 366 days', `/api/admin/analytics?from=${istDateString(366)}&to=${TO}`],
    ['a traineeId that is not a uuid', `${lastWeek('&traineeId=abc')}`],
  ])('returns 400 for %s', async (_name, path) => {
    expectError(await api.get(path, admin.cookie), 400, 'VALIDATION_FAILED');
  });

  it('accepts exactly 366 days', async () => {
    const res = await api.get(
      `/api/admin/analytics?from=${istDateString(365)}&to=${TO}`,
      admin.cookie
    );
    expect(res.status).toBe(200);
  });

  it('returns 404 for a trainee that does not exist', async () => {
    expectError(
      await api.get(lastWeek(`&traineeId=${UNKNOWN_ID}`), admin.cookie),
      404,
      'NOT_FOUND'
    );
  });
});

describe('GET /api/admin/analytics: numbers', () => {
  it('returns zeros, not made-up values, when nobody has done anything', async () => {
    const data = await getAnalytics();

    expect(data).toMatchObject({ from: FROM, to: TO, traineeId: null, traineeCount: 2 });
    expect(data.totals).toEqual({
      daysCompleted: 0,
      tasksSubmitted: 0,
      activeSeconds: 0,
      codingSeconds: 0,
      typingTests: 0,
    });
    expect(data.progressTrend).toHaveLength(7);
    expect(data.progressTrend.every((point) => point.averageDaysCompleted === 0)).toBe(true);
    expect(data.taskStatus).toEqual({
      completed: 0,
      inProgress: 0,
      notStarted: 2 * TASKS_IN_CURRICULUM,
    });
    expect(data.typingTrend).toEqual([]);
    expect(data.integrityTrend).toEqual([]);
  });

  it('builds every chart from the stored records of the whole team', async () => {
    // A completes day 1 today (its one required task is submitted) and takes a typing test.
    await markDayCompleted(a.id, DAY.html1);
    await db.typing_test_result.create({ data: { trainee_id: a.id, wpm: 40, accuracy: 95 } });
    // B was active yesterday, and also 10 days ago (outside the period).
    await db.activity_log.createMany({
      data: [
        { trainee_id: b.id, date: istDate(1), active_seconds: 600, coding_seconds: 300 },
        { trainee_id: b.id, date: istDate(10), active_seconds: 999, coding_seconds: 999 },
      ],
    });

    const data = await getAnalytics();

    expect(data.totals).toEqual({
      daysCompleted: 1,
      tasksSubmitted: 1,
      activeSeconds: 600,
      codingSeconds: 300,
      typingTests: 1,
    });
    // 1 completed day / 2 trainees, reached today.
    expect(data.progressTrend[0].averageDaysCompleted).toBe(0);
    expect(data.progressTrend[6]).toEqual({ date: TO, averageDaysCompleted: 0.5 });
    expect(data.taskStatus).toEqual({
      completed: 1,
      inProgress: 0,
      notStarted: 2 * TASKS_IN_CURRICULUM - 1,
    });
    expect(data.typingTrend).toEqual([{ date: TO, averageWpm: 40, traineesIncluded: 1 }]);
    expect(data.integrityTrend).toEqual([{ date: TO, averageScore: 100, daysScored: 1 }]);

    const rowA = data.traineeComparison.find((row) => row.traineeId === a.id);
    const rowB = data.traineeComparison.find((row) => row.traineeId === b.id);
    expect(rowA).toMatchObject({ name: 'Trainee A', daysCompleted: 1, totalDays: 3 });
    expect(rowB).toMatchObject({ name: 'Trainee B', activeSeconds: 600, codingSeconds: 300 });
  });

  it('limits everything except the comparison to one trainee when traineeId is sent', async () => {
    await markDayCompleted(a.id, DAY.html1);
    await db.activity_log.create({
      data: { trainee_id: b.id, date: istDate(1), active_seconds: 600, coding_seconds: 300 },
    });

    const data = await getAnalytics(`&traineeId=${a.id}`);

    expect(data.traineeId).toBe(a.id);
    expect(data.traineeCount).toBe(1);
    expect(data.totals.activeSeconds).toBe(0); // B's activity is not A's
    expect(data.progressTrend[6].averageDaysCompleted).toBe(1);
    expect(data.taskStatus).toEqual({
      completed: 1,
      inProgress: 0,
      notStarted: TASKS_IN_CURRICULUM - 1,
    });
    expect(data.traineeComparison).toHaveLength(2); // still every trainee, to compare against
  });

  it('never sends trainee emails', async () => {
    const res = await api.get(lastWeek(), admin.cookie);
    expect(JSON.stringify(res.body)).not.toContain('@vonnue.com');
  });
});
