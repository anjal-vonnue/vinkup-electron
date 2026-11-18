import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DashboardResponse } from '@itp/types';
import { db } from './helpers/db.js';
import { freshTrainees, seedCurriculum, type TestTrainee } from './helpers/fixtures.js';
import { api, body, expectError, expectIsoDateTime } from './helpers/http.js';

type TypingResult = { wpm: number; accuracy: number; takenAt: string };

let a: TestTrainee;
let b: TestTrainee;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a, b } = await freshTrainees());
});

describe('POST /api/typing-test/results', () => {
  it("saves the attempt with 201 and returns it with the server's time", async () => {
    const before = Date.now();
    const res = await api.post('/api/typing-test/results', { wpm: 74, accuracy: 96.4 }, a.cookie);

    expect(res.status).toBe(201);
    const result = body<TypingResult>(res);
    expect(result).toMatchObject({ wpm: 74, accuracy: 96.4 });
    expectIsoDateTime(result.takenAt);
    expect(Date.parse(result.takenAt)).toBeGreaterThanOrEqual(before - 1000);

    const rows = await db.typing_test_result.findMany({ where: { trainee_id: a.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ wpm: 74, accuracy: 96.4 });
  });

  it('ignores a takenAt or traineeId sent by the client', async () => {
    await api.post(
      '/api/typing-test/results',
      { wpm: 60, accuracy: 90, takenAt: '2020-01-01T00:00:00.000Z', traineeId: b.id },
      a.cookie
    );

    const rows = await db.typing_test_result.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].trainee_id).toBe(a.id);
    expect(rows[0].taken_at.getUTCFullYear()).toBeGreaterThan(2020);
  });

  it('shows up as the latest result on the dashboard', async () => {
    await api.post('/api/typing-test/results', { wpm: 81, accuracy: 97 }, a.cookie);

    const res = await api.get('/api/dashboard', a.cookie);
    expect(body<DashboardResponse>(res).typing.latest).toMatchObject({ wpm: 81, accuracy: 97 });
  });

  it('accepts the edge values 0 and 300 WPM, 0 and 100 accuracy', async () => {
    expect(
      (await api.post('/api/typing-test/results', { wpm: 0, accuracy: 0 }, a.cookie)).status
    ).toBe(201);
    expect(
      (await api.post('/api/typing-test/results', { wpm: 300, accuracy: 100 }, a.cookie)).status
    ).toBe(201);
  });

  it.each([
    ['wpm is missing', { accuracy: 95 }],
    ['accuracy is missing', { wpm: 60 }],
    ['wpm is negative', { wpm: -1, accuracy: 95 }],
    ['wpm is over 300', { wpm: 301, accuracy: 95 }],
    ['wpm is not an integer', { wpm: 60.5, accuracy: 95 }],
    ['accuracy is over 100', { wpm: 60, accuracy: 100.1 }],
    ['accuracy is negative', { wpm: 60, accuracy: -0.1 }],
    ['wpm is a string', { wpm: '60', accuracy: 95 }],
  ])('returns 400 VALIDATION_FAILED when %s', async (_label, payload) => {
    expectError(
      await api.post('/api/typing-test/results', payload, a.cookie),
      400,
      'VALIDATION_FAILED'
    );
    expect(await db.typing_test_result.count()).toBe(0);
  });
});

describe('typing test history', () => {
  it('rounds accuracy to one decimal, records each attempt, and returns only the trainee history', async () => {
    await api.post('/api/typing-test/results', { wpm: 74, accuracy: 96.46 }, a.cookie);
    await api.post(
      '/api/typing-test/results',
      { wpm: 82, accuracy: 98.04, traineeId: b.id },
      a.cookie
    );
    await api.post('/api/typing-test/results', { wpm: 120, accuracy: 99 }, b.cookie);

    const res = await api.get('/api/typing-test/results', a.cookie);
    expect(res.status).toBe(200);
    const results = body<TypingResult[]>(res);
    expect(results).toHaveLength(2);
    expect(results.map(({ wpm, accuracy }) => ({ wpm, accuracy }))).toEqual(
      expect.arrayContaining([
        { wpm: 74, accuracy: 96.5 },
        { wpm: 82, accuracy: 98 },
      ])
    );
    results.forEach((result) => expectIsoDateTime(result.takenAt));
    const saved = await db.typing_test_result.findMany({ where: { trainee_id: a.id } });
    expect(saved).toHaveLength(2);
    expect(saved.map((row) => row.accuracy)).toEqual(expect.arrayContaining([96.5, 98]));
  });

  it('accepts only bounded numeric WPM and accuracy values', async () => {
    const res = await api.post('/api/typing-test/results', { wpm: 61.5, accuracy: 90 }, a.cookie);
    expectError(res, 400, 'VALIDATION_FAILED');
    expect(await db.typing_test_result.count()).toBe(0);
  });
});
