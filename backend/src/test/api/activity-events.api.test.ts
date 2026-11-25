import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LogFlagEventRequest } from '@itp/types';
import { db } from './helpers/db';
import { DAY, TASK, freshTrainees, seedCurriculum, type TestTrainee } from './helpers/fixtures';
import { api, expectError } from './helpers/http';

let a: TestTrainee;
let b: TestTrainee;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a, b } = await freshTrainees());
});

const url = (taskId: string) => `/api/activity/${taskId}/events`;

describe('POST /api/activity/:taskId/events', () => {
  it('logs the flag with 204 and stores it for the logged-in trainee', async () => {
    const payload: LogFlagEventRequest = {
      type: 'PASTE_BLOCKED',
      durationMs: 4200,
      context: { source: 'terminal', attempt: 2, fromShortcut: true },
    };

    const res = await api.post(url(TASK.html1Main), payload, a.cookie);

    expect(res.status).toBe(204);
    const rows = await db.flag_event.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      trainee_id: a.id,
      task_id: TASK.html1Main,
      type: 'PASTE_BLOCKED',
      duration_ms: 4200,
      context_data: { source: 'terminal', attempt: 2, fromShortcut: true },
    });
    expect(rows[0].timestamp).toBeInstanceOf(Date);
  });

  it('accepts a flag with only a type', async () => {
    const res = await api.post(url(TASK.html1Main), { type: 'TAB_SWITCH' }, a.cookie);
    expect(res.status).toBe(204);
  });

  it('takes the trainee from the cookie, never from the body', async () => {
    await api.post(url(TASK.html1Main), { type: 'TAB_SWITCH', traineeId: b.id }, a.cookie);

    expect(await db.flag_event.count({ where: { trainee_id: a.id } })).toBe(1);
    expect(await db.flag_event.count({ where: { trainee_id: b.id } })).toBe(0);
  });

  it('ignores the same flag again within 2 seconds, still answering 204', async () => {
    await api.post(url(TASK.html1Main), { type: 'TAB_SWITCH' }, a.cookie);
    const repeat = await api.post(url(TASK.html1Main), { type: 'TAB_SWITCH' }, a.cookie);

    expect(repeat.status).toBe(204);
    expect(await db.flag_event.count()).toBe(1);
  });

  it("keeps a different flag type, or another trainee's flag, within those 2 seconds", async () => {
    await api.post(url(TASK.html1Main), { type: 'TAB_SWITCH' }, a.cookie);
    await api.post(url(TASK.html1Main), { type: 'FULLSCREEN_EXIT' }, a.cookie);
    await api.post(url(TASK.html1Main), { type: 'TAB_SWITCH' }, b.cookie);

    expect(await db.flag_event.count()).toBe(3);
  });

  it('logs the same flag again after 2 seconds', async () => {
    await db.flag_event.create({
      data: {
        trainee_id: a.id,
        task_id: TASK.html1Main,
        type: 'TAB_SWITCH',
        timestamp: new Date(Date.now() - 3000),
      },
    });
    await api.post(url(TASK.html1Main), { type: 'TAB_SWITCH' }, a.cookie);

    expect(await db.flag_event.count()).toBe(2);
  });

  it('stores an idle flag with its length, always as NORMAL priority', async () => {
    const res = await api.post(
      url(TASK.html1Main),
      { type: 'IDLE', durationMs: 18 * 60_000 },
      a.cookie
    );

    expect(res.status).toBe(204);
    const rows = await db.flag_event.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      trainee_id: a.id,
      task_id: TASK.html1Main,
      type: 'IDLE',
      duration_ms: 18 * 60_000,
      review_priority: 'NORMAL',
    });
  });

  it("does not change the trainee's day integrity score", async () => {
    await api.post(url(TASK.html1Main), { type: 'IDLE', durationMs: 40 * 60_000 }, a.cookie);

    const res = await api.get(`/api/days/${DAY.html1}/integrity`, a.cookie);

    expect(res.status).toBe(200);
    // Nothing scored: an idle flag doesn't make the task count as worked on.
    expect(res.body).toEqual({ score: null });
  });

  it('has no way to read flags back (trainees never see them)', async () => {
    expectError(await api.get(url(TASK.html1Main), a.cookie), 404, 'NOT_FOUND');
  });

  const tooManyKeys = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, i]));

  it.each([
    ['type is missing', {}],
    ['type is unknown', { type: 'COPY' }],
    ['durationMs is negative', { type: 'TAB_SWITCH', durationMs: -1 }],
    ['durationMs is not an integer', { type: 'TAB_SWITCH', durationMs: 1.5 }],
    ['context has over 10 keys', { type: 'TAB_SWITCH', context: tooManyKeys }],
    [
      'a context key is over 50 characters',
      { type: 'TAB_SWITCH', context: { ['k'.repeat(51)]: 1 } },
    ],
    [
      'a context string is over 200 characters',
      { type: 'TAB_SWITCH', context: { s: 'x'.repeat(201) } },
    ],
    ['a context value is an object', { type: 'TAB_SWITCH', context: { nested: { a: 1 } } }],
    ['an IDLE flag has no durationMs', { type: 'IDLE' }],
  ])('returns 400 VALIDATION_FAILED when %s', async (_label, payload) => {
    expectError(await api.post(url(TASK.html1Main), payload, a.cookie), 400, 'VALIDATION_FAILED');
    expect(await db.flag_event.count()).toBe(0);
  });

  it('returns 403 DAY_LOCKED for a task on a locked day', async () => {
    expectError(
      await api.post(url(TASK.html2First), { type: 'TAB_SWITCH' }, a.cookie),
      403,
      'DAY_LOCKED'
    );
  });

  it('returns 404 NOT_FOUND for an unknown task', async () => {
    expectError(
      await api.post(url('html-day-01-t-99'), { type: 'TAB_SWITCH' }, a.cookie),
      404,
      'NOT_FOUND'
    );
  });
});
