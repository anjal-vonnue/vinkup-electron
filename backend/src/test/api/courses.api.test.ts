import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CourseDaysResponse } from '@itp/types';
import {
  DAY,
  freshTrainees,
  markDayCompleted,
  seedCurriculum,
  type TestTrainee,
} from './helpers/fixtures.js';
import { api, body, expectError } from './helpers/http.js';

let a: TestTrainee;
let b: TestTrainee;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a, b } = await freshTrainees());
});

describe('GET /api/courses/:courseId/days', () => {
  it('lists the course days in order with their status, locked days included', async () => {
    const res = await api.get('/api/courses/html/days', a.cookie);

    expect(res.status).toBe(200);
    expect(body<CourseDaysResponse>(res)).toEqual([
      {
        id: DAY.html1,
        courseId: 'html',
        dayNumber: 1,
        title: 'HTML5 Document Structure',
        description: 'Build valid HTML pages.',
        status: 'UNLOCKED',
      },
      {
        id: DAY.html2,
        courseId: 'html',
        dayNumber: 2,
        title: 'Semantic HTML',
        description: 'Use the right element for the meaning.',
        status: 'LOCKED',
      },
    ]);
  });

  it('shows COMPLETED, then the next day UNLOCKED, after a day is completed', async () => {
    await markDayCompleted(a.id, DAY.html1);

    const res = await api.get('/api/courses/html/days', a.cookie);
    const statuses = body<CourseDaysResponse>(res).map((d) => d.status);
    expect(statuses).toEqual(['COMPLETED', 'UNLOCKED']);
  });

  it('locks a later course until the earlier course is finished', async () => {
    const before = await api.get('/api/courses/postgresql/days', a.cookie);
    expect(body<CourseDaysResponse>(before).map((d) => d.status)).toEqual(['LOCKED']);

    await markDayCompleted(a.id, DAY.html1);
    await markDayCompleted(a.id, DAY.html2);

    const after = await api.get('/api/courses/postgresql/days', a.cookie);
    expect(body<CourseDaysResponse>(after).map((d) => d.status)).toEqual(['UNLOCKED']);
  });

  it("uses only the logged-in trainee's progress", async () => {
    await markDayCompleted(b.id, DAY.html1);

    const res = await api.get('/api/courses/html/days', a.cookie);
    expect(body<CourseDaysResponse>(res).map((d) => d.status)).toEqual(['UNLOCKED', 'LOCKED']);
  });

  it('returns 404 NOT_FOUND for an unknown course', async () => {
    const res = await api.get('/api/courses/cobol/days', a.cookie);
    expectError(res, 404, 'NOT_FOUND');
  });
});
