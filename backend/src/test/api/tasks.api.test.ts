import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TaskResponse } from '@itp/types';
import { db } from './helpers/db';
import {
  DAY,
  SETUP_SQL,
  TASK,
  freshTrainees,
  markDayCompleted,
  markTaskCompleted,
  seedCurriculum,
  type TestTrainee,
} from './helpers/fixtures';
import { api, body, expectError } from './helpers/http';

let a: TestTrainee;
let b: TestTrainee;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a, b } = await freshTrainees());
});

async function getTask(taskId: string, trainee: TestTrainee): Promise<TaskResponse> {
  const res = await api.get(`/api/tasks/${taskId}`, trainee.cookie);
  expect(res.status).toBe(200);
  return body<TaskResponse>(res);
}

describe('GET /api/tasks/:taskId', () => {
  it('returns a browser task with its day, and no run command or setup SQL', async () => {
    expect(await getTask(TASK.html1Main, a)).toEqual({
      id: TASK.html1Main,
      title: 'Profile page',
      instructionsMarkdown: '## Task\nDo it.',
      isStretchGoal: false,
      sequenceOrder: 1,
      estimatedMinutes: 45,
      status: 'not_started',
      reviewStatus: null,
      submissionCount: 0,
      day: { id: DAY.html1, dayNumber: 1, courseTitle: 'HTML' },
      runtime: 'browser',
      runCommand: null,
      setupSql: null,
    });
  });

  it('returns estimatedMinutes null and isStretchGoal true for the stretch task', async () => {
    expect(await getTask(TASK.html1Stretch, a)).toMatchObject({
      isStretchGoal: true,
      estimatedMinutes: null,
    });
  });

  it('returns setupSql for a sql task and runCommand for a node task', async () => {
    await markDayCompleted(a.id, DAY.html1);
    await markDayCompleted(a.id, DAY.html2);

    expect(await getTask(TASK.pg1Sql, a)).toMatchObject({
      runtime: 'sql',
      setupSql: SETUP_SQL,
      runCommand: null,
      day: { id: DAY.pg1, dayNumber: 1, courseTitle: 'PostgreSQL' },
    });
    expect(await getTask(TASK.pg1Node, a)).toMatchObject({
      runtime: 'node',
      runCommand: 'npm test',
      setupSql: null,
    });
  });

  it('never sends usesDatabase (removed from the contract)', async () => {
    expect(await getTask(TASK.html1Main, a)).not.toHaveProperty('usesDatabase');
  });

  it("shows the trainee's own status: in_progress after a save, completed after submit", async () => {
    await db.task_progress.create({
      data: { trainee_id: a.id, task_id: TASK.html1Stretch, status: 'in_progress', files: [] },
    });
    await markTaskCompleted(a.id, TASK.html1Main);
    await markTaskCompleted(b.id, TASK.html1Stretch);

    expect((await getTask(TASK.html1Main, a)).status).toBe('completed');
    expect((await getTask(TASK.html1Stretch, a)).status).toBe('in_progress');
  });

  it('returns 403 DAY_LOCKED for a task on a locked day', async () => {
    expectError(await api.get(`/api/tasks/${TASK.html2First}`, a.cookie), 403, 'DAY_LOCKED');
  });

  it('returns 404 NOT_FOUND for an unknown task', async () => {
    expectError(await api.get('/api/tasks/html-day-01-t-99', a.cookie), 404, 'NOT_FOUND');
  });
});
