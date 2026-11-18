import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from './helpers/db.js';
import {
  freshTrainees,
  istDate,
  istDateString,
  seedCurriculum,
  type TestTrainee,
} from './helpers/fixtures.js';
import { api, body, expectError } from './helpers/http.js';

type ActivityTimeDay = {
  date: string;
  activeSeconds: number;
  codingSeconds: number;
};

let a: TestTrainee;
let b: TestTrainee;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a, b } = await freshTrainees());
});

const batch = { activeSeconds: 60, codingSeconds: 45, date: istDateString(0) };

describe('POST /api/activity/time', () => {
  it("adds the seconds to today's row with 204", async () => {
    const res = await api.post('/api/activity/time', batch, a.cookie);

    expect(res.status).toBe(204);

    const rows = await db.activity_log.findMany({
      where: { trainee_id: a.id },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      active_seconds: 60,
      coding_seconds: 45,
    });
    expect(rows[0].date.toISOString().slice(0, 10)).toBe(istDateString(0));
  });

  it('adds up repeated batches in the same daily row', async () => {
    await api.post('/api/activity/time', batch, a.cookie);
    await api.post('/api/activity/time', batch, a.cookie);

    const rows = await db.activity_log.findMany({
      where: { trainee_id: a.id },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      active_seconds: 120,
      coding_seconds: 90,
    });
  });

  it('stores activity separately for each calendar day', async () => {
    await api.post('/api/activity/time', batch, a.cookie);

    await db.activity_log.create({
      data: {
        trainee_id: a.id,
        date: istDate(1),
        active_seconds: 120,
        coding_seconds: 90,
      },
    });

    const rows = await db.activity_log.findMany({
      where: { trainee_id: a.id },
      orderBy: { date: 'asc' },
    });

    expect(rows).toHaveLength(2);
    expect(
      rows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        active_seconds: r.active_seconds,
        coding_seconds: r.coding_seconds,
      }))
    ).toEqual([
      {
        date: istDateString(1),
        active_seconds: 120,
        coding_seconds: 90,
      },
      {
        date: istDateString(0),
        active_seconds: 60,
        coding_seconds: 45,
      },
    ]);
  });

  it('stores time for the logged-in trainee only', async () => {
    await api.post('/api/activity/time', batch, a.cookie);

    expect(await db.activity_log.count({ where: { trainee_id: a.id } })).toBe(1);
    expect(await db.activity_log.count({ where: { trainee_id: b.id } })).toBe(0);
  });

  it('accepts 600 seconds', async () => {
    const edge = {
      activeSeconds: 600,
      codingSeconds: 600,
      date: '2025-10-10',
    };

    expect((await api.post('/api/activity/time', edge, a.cookie)).status).toBe(204);
  });

  it.each([
    ['a field is missing', { activeSeconds: 60 }],
    ['a value is negative', { ...batch, codingSeconds: -1 }],
    ['a value is not an integer', { ...batch, activeSeconds: 60.5 }],
    ['activeSeconds is over 600', { activeSeconds: 601, codingSeconds: 0 }],
    ['codingSeconds exceeds activeSeconds', { activeSeconds: 60, codingSeconds: 61 }],
    ['activeSeconds is negative', { activeSeconds: -1, codingSeconds: 0 }],
    ['codingSeconds is over 600', { activeSeconds: 600, codingSeconds: 601 }],
  ])('returns 400 VALIDATION_FAILED when %s', async (_label, payload) => {
    expectError(await api.post('/api/activity/time', payload, a.cookie), 400, 'VALIDATION_FAILED');

    expect(await db.activity_log.count()).toBe(0);
  });
});

describe('GET /api/activity/time', () => {
  async function addRow(traineeId: string, daysAgo: number, active: number, coding: number) {
    await db.activity_log.create({
      data: {
        trainee_id: traineeId,
        date: istDate(daysAgo),
        active_seconds: active,
        coding_seconds: coding,
      },
    });
  }

  it('returns one entry per calendar day, newest first', async () => {
    await addRow(a.id, 0, 600, 400);
    await addRow(a.id, 3, 1000, 700);

    const res = await api.get('/api/activity/time', a.cookie);

    expect(res.status).toBe(200);
    expect(body<ActivityTimeDay[]>(res)).toEqual([
      {
        date: istDateString(0),
        activeSeconds: 600,
        codingSeconds: 400,
      },
      {
        date: istDateString(3),
        activeSeconds: 1000,
        codingSeconds: 700,
      },
    ]);
  });

  it('covers the last 7 days by default', async () => {
    await addRow(a.id, 6, 100, 50);
    await addRow(a.id, 7, 100, 50);

    const res = await api.get('/api/activity/time', a.cookie);

    expect(body<ActivityTimeDay[]>(res).map((d) => d.date)).toEqual([istDateString(6)]);
  });

  it('covers `days` days when asked', async () => {
    await addRow(a.id, 0, 100, 50);
    await addRow(a.id, 1, 100, 50);
    await addRow(a.id, 20, 100, 50);

    const one = await api.get('/api/activity/time?days=1', a.cookie);

    expect(body<ActivityTimeDay[]>(one).map((d) => d.date)).toEqual([istDateString(0)]);

    const thirty = await api.get('/api/activity/time?days=30', a.cookie);

    expect(body<ActivityTimeDay[]>(thirty)).toHaveLength(3);
  });

  it('returns an empty list with no activity', async () => {
    const res = await api.get('/api/activity/time', a.cookie);

    expect(body<ActivityTimeDay[]>(res)).toEqual([]);
  });

  it("never returns another trainee's time", async () => {
    await addRow(b.id, 0, 999, 500);

    const res = await api.get('/api/activity/time', a.cookie);

    expect(body<ActivityTimeDay[]>(res)).toEqual([]);
  });

  it.each(['0', '366', 'abc', '2.5'])('returns 400 VALIDATION_FAILED for days=%s', async (days) => {
    expectError(
      await api.get(`/api/activity/time?days=${days}`, a.cookie),
      400,
      'VALIDATION_FAILED'
    );
  });
});
