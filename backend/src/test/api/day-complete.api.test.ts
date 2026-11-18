import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiErrorResponse, DayCurrentStatus } from '@itp/types';
import { db } from './helpers/db.js';
import {
  DAY,
  TASK,
  freshTrainees,
  markDayCompleted,
  markTaskCompleted,
  seedCurriculum,
  type TestTrainee,
} from './helpers/fixtures.js';
import { api, body, expectError } from './helpers/http.js';

// Response of PATCH /api/days/:dayId/complete (add to packages/types as CompleteDayResponse).
type CompleteDayResponse = { status: DayCurrentStatus; nextDayId: string | null };

let a: TestTrainee;
let b: TestTrainee;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a, b } = await freshTrainees());
});

const url = (dayId: string) => `/api/days/${dayId}/complete`;

describe('PATCH /api/days/:dayId/complete', () => {
  it('returns 403 CHECKLIST_INCOMPLETE with counts while required tasks are not done', async () => {
    const res = await api.patch(url(DAY.html1), undefined, a.cookie);

    expectError(res, 403, 'CHECKLIST_INCOMPLETE');
    expect(body<ApiErrorResponse>(res).error.details).toEqual({
      completedTasks: 0,
      requiredTasks: 1,
    });
    expect(await db.day_completion.count()).toBe(0);
  });

  it("counts only the trainee's own completed tasks", async () => {
    await markTaskCompleted(b.id, TASK.html1Main);
    expectError(await api.patch(url(DAY.html1), undefined, a.cookie), 403, 'CHECKLIST_INCOMPLETE');
  });

  it('completes the day when required tasks are done, without the stretch task', async () => {
    await markTaskCompleted(a.id, TASK.html1Main);

    const res = await api.patch(url(DAY.html1), undefined, a.cookie);

    expect(res.status).toBe(200);
    expect(body<CompleteDayResponse>(res)).toEqual({
      status: { isLocked: false, isCompleted: true },
      nextDayId: DAY.html2,
    });
    expect(await db.day_completion.count({ where: { trainee_id: a.id } })).toBe(1);
  });

  it('unlocks the next day', async () => {
    await markTaskCompleted(a.id, TASK.html1Main);
    await api.patch(url(DAY.html1), undefined, a.cookie);

    const status = await api.get(`/api/days/${DAY.html2}/status`, a.cookie);
    expect(body<DayCurrentStatus>(status)).toEqual({ isLocked: false, isCompleted: false });
  });

  it('is safe to repeat: 200 again and still one completion row', async () => {
    await markTaskCompleted(a.id, TASK.html1Main);
    await api.patch(url(DAY.html1), undefined, a.cookie);

    const again = await api.patch(url(DAY.html1), undefined, a.cookie);
    expect(again.status).toBe(200);
    expect(body<CompleteDayResponse>(again).status.isCompleted).toBe(true);
    expect(await db.day_completion.count({ where: { trainee_id: a.id } })).toBe(1);
  });

  it("points to the first day of the next course after a course's last day", async () => {
    await markDayCompleted(a.id, DAY.html1);
    await markTaskCompleted(a.id, TASK.html2First);
    await markTaskCompleted(a.id, TASK.html2Second);

    const res = await api.patch(url(DAY.html2), undefined, a.cookie);
    expect(body<CompleteDayResponse>(res).nextDayId).toBe(DAY.pg1);
  });

  it('returns nextDayId null after the last day of the curriculum', async () => {
    await markDayCompleted(a.id, DAY.html1);
    await markDayCompleted(a.id, DAY.html2);
    await markTaskCompleted(a.id, TASK.pg1Sql);
    await markTaskCompleted(a.id, TASK.pg1Node);

    const res = await api.patch(url(DAY.pg1), undefined, a.cookie);
    expect(res.status).toBe(200);
    expect(body<CompleteDayResponse>(res).nextDayId).toBeNull();
  });

  it('returns 403 DAY_LOCKED for a locked day, even with its tasks done', async () => {
    await markTaskCompleted(a.id, TASK.html2First);
    await markTaskCompleted(a.id, TASK.html2Second);

    expectError(await api.patch(url(DAY.html2), undefined, a.cookie), 403, 'DAY_LOCKED');
    expect(await db.day_completion.count()).toBe(0);
  });

  it('returns 404 NOT_FOUND for an unknown day', async () => {
    expectError(await api.patch(url('html-day-99'), undefined, a.cookie), 404, 'NOT_FOUND');
  });
});
