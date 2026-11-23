import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DayCurrentStatus, DayTask, SubmitTaskResponse, TaskResponse } from '@itp/types';
import { db } from './helpers/db';
import { DAY, TASK, freshTrainees, seedCurriculum, type TestTrainee } from './helpers/fixtures';
import { api, body, expectError, expectIsoDateTime } from './helpers/http';

let a: TestTrainee;
let b: TestTrainee;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a, b } = await freshTrainees());
});

const url = (taskId: string) => `/api/tasks/${taskId}/submit`;

describe('POST /api/tasks/:taskId/submit', () => {
  it('does not queue Slack notifications when Slack is disabled', async () => {
    const res = await api.post(url(TASK.html1Main), undefined, a.cookie);

    expect(res.status).toBe(200);
    expect(await db.slack_notification_outbox.count()).toBe(0);
  });

  it('marks the task completed and returns the submit time', async () => {
    const res = await api.post(url(TASK.html1Main), undefined, a.cookie);

    expect(res.status).toBe(200);
    const data = body<SubmitTaskResponse>(res);
    expect(data.status).toBe('completed');
    expectIsoDateTime(data.submittedAt);

    const task = await api.get(`/api/tasks/${TASK.html1Main}`, a.cookie);
    expect(body<TaskResponse>(task).status).toBe('completed');

    const tasks = await api.get(`/api/days/${DAY.html1}/tasks`, a.cookie);
    expect(body<DayTask[]>(tasks).find((t) => t.id === TASK.html1Main)?.status).toBe('completed');
  });

  it('works without a prior save, and keeps the saved code when there is one', async () => {
    const files = [{ path: 'index.html', content: '<h1>Done</h1>\n' }];
    await api.put(`/api/tasks/${TASK.html1Main}/code`, { files }, a.cookie);
    await api.post(url(TASK.html1Main), undefined, a.cookie);

    const code = await api.get(`/api/tasks/${TASK.html1Main}/code`, a.cookie);
    expect(body<{ files: unknown }>(code).files).toEqual(files);

    const noSave = await api.post(url(TASK.html1Stretch), undefined, a.cookie);
    expect(noSave.status).toBe(200);
  });

  it('can be repeated: 200 again with a newer submit time, still one progress row', async () => {
    const first = body<SubmitTaskResponse>(
      await api.post(url(TASK.html1Main), undefined, a.cookie)
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await api.post(url(TASK.html1Main), undefined, a.cookie);

    expect(second.status).toBe(200);
    const secondAt = Date.parse(body<SubmitTaskResponse>(second).submittedAt);
    expect(secondAt).toBeGreaterThan(Date.parse(first.submittedAt));
    expect(await db.task_progress.count({ where: { trainee_id: a.id } })).toBe(1);
  });

  it('does not lock editing: saving after submit still works', async () => {
    await api.post(url(TASK.html1Main), undefined, a.cookie);

    const put = await api.put(`/api/tasks/${TASK.html1Main}/code`, { files: [] }, a.cookie);
    expect(put.status).toBe(204);
  });

  it('does not complete the day (that is Submit Day)', async () => {
    await api.post(url(TASK.html1Main), undefined, a.cookie);

    const status = await api.get(`/api/days/${DAY.html1}/status`, a.cookie);
    expect(body<DayCurrentStatus>(status).isCompleted).toBe(false);
    expect(await db.day_completion.count()).toBe(0);
  });

  it("only changes the logged-in trainee's task", async () => {
    await api.post(url(TASK.html1Main), undefined, a.cookie);

    const task = await api.get(`/api/tasks/${TASK.html1Main}`, b.cookie);
    expect(body<TaskResponse>(task).status).toBe('not_started');
  });

  it('returns 403 DAY_LOCKED for a task on a locked day', async () => {
    expectError(await api.post(url(TASK.html2First), undefined, a.cookie), 403, 'DAY_LOCKED');
    expect(await db.task_progress.count()).toBe(0);
    expect(await db.slack_notification_outbox.count()).toBe(0);
  });

  it('returns 404 NOT_FOUND for an unknown task', async () => {
    expectError(await api.post(url('html-day-01-t-99'), undefined, a.cookie), 404, 'NOT_FOUND');
    expect(await db.slack_notification_outbox.count()).toBe(0);
  });
});
