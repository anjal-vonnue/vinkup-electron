import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DayContent, DayCurrentStatus, DayTask } from '@itp/types';
import { db } from './helpers/db';
import {
  DAY,
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

describe('GET /api/days/:dayId', () => {
  it('returns the day content with objectives and checklist in order', async () => {
    const res = await api.get(`/api/days/${DAY.html1}`, a.cookie);

    expect(res.status).toBe(200);
    expect(body<DayContent>(res)).toEqual({
      dayId: DAY.html1,
      courseSlug: 'html',
      courseTitle: 'HTML',
      dayNumber: 1,
      totalDays: 2,
      title: 'HTML5 Document Structure',
      subtitle: 'Build valid HTML pages.',
      lessonSummary: 'Create a profile page.',
      learningObjectives: [
        {
          id: 'html-day-01-obj-1',
          code: '1.1',
          title: 'Boilerplate',
          description: 'Write a valid HTML5 document.',
        },
        {
          id: 'html-day-01-obj-2',
          code: '1.2',
          title: 'Text Elements',
          description: 'Use headings and paragraphs.',
        },
      ],
      selfCheckItems: [
        {
          id: 'html-day-01-check-1',
          code: '1.1',
          label: 'HTML5 structure',
          description: 'Write the boilerplate from memory.',
          isRequired: true,
        },
        {
          id: 'html-day-01-check-2',
          code: '1.2',
          label: 'Validation',
          description: 'Zero validator errors.',
          isRequired: false,
        },
      ],
      journalPrompt: 'What surprised you today?',
    });
  });

  it('returns empty lists for a day with no objectives or checklist', async () => {
    const res = await api.get(`/api/days/${DAY.html2}`, a.cookie);
    expect(body<DayContent>(res)).toMatchObject({ learningObjectives: [], selfCheckItems: [] });
  });

  it('returns the content of a locked day too (the page shows its title)', async () => {
    const res = await api.get(`/api/days/${DAY.pg1}`, a.cookie);
    expect(res.status).toBe(200);
    expect(body<DayContent>(res)).toMatchObject({
      dayId: DAY.pg1,
      courseSlug: 'postgresql',
      totalDays: 1,
    });
  });

  it('returns 404 NOT_FOUND for an unknown day', async () => {
    expectError(await api.get('/api/days/html-day-99', a.cookie), 404, 'NOT_FOUND');
  });
});

describe('GET /api/days/:dayId/status', () => {
  it('returns unlocked and not completed for the current day', async () => {
    const res = await api.get(`/api/days/${DAY.html1}/status`, a.cookie);
    expect(res.status).toBe(200);
    expect(body<DayCurrentStatus>(res)).toEqual({ isLocked: false, isCompleted: false });
  });

  it('returns 200 with isLocked true for a locked day, not 403', async () => {
    const res = await api.get(`/api/days/${DAY.html2}/status`, a.cookie);
    expect(res.status).toBe(200);
    expect(body<DayCurrentStatus>(res)).toEqual({ isLocked: true, isCompleted: false });
  });

  it('returns completed for a completed day, and unlocks the next', async () => {
    await markDayCompleted(a.id, DAY.html1);

    const done = await api.get(`/api/days/${DAY.html1}/status`, a.cookie);
    expect(body<DayCurrentStatus>(done)).toEqual({ isLocked: false, isCompleted: true });

    const next = await api.get(`/api/days/${DAY.html2}/status`, a.cookie);
    expect(body<DayCurrentStatus>(next)).toEqual({ isLocked: false, isCompleted: false });
  });

  it("ignores another trainee's progress", async () => {
    await markDayCompleted(b.id, DAY.html1);
    const res = await api.get(`/api/days/${DAY.html1}/status`, a.cookie);
    expect(body<DayCurrentStatus>(res)).toEqual({ isLocked: false, isCompleted: false });
  });

  it('returns 404 NOT_FOUND for an unknown day', async () => {
    expectError(await api.get('/api/days/html-day-99/status', a.cookie), 404, 'NOT_FOUND');
  });
});

describe('GET /api/days/:dayId/tasks', () => {
  it("lists the day's tasks in order, all not started for a new trainee", async () => {
    const res = await api.get(`/api/days/${DAY.html1}/tasks`, a.cookie);

    expect(res.status).toBe(200);
    expect(body<DayTask[]>(res)).toEqual([
      {
        id: TASK.html1Main,
        sequenceOrder: 1,
        title: 'Profile page',
        status: 'not_started',
        isStretchGoal: false,
        reviewStatus: null,
      },
      {
        id: TASK.html1Stretch,
        sequenceOrder: 2,
        title: 'Printable version',
        status: 'not_started',
        isStretchGoal: true,
        reviewStatus: null,
      },
    ]);
  });

  it('shows in_progress for saved code and completed for a submitted task', async () => {
    await db.task_progress.create({
      data: { trainee_id: a.id, task_id: TASK.html1Stretch, status: 'in_progress', files: [] },
    });
    await markTaskCompleted(a.id, TASK.html1Main);

    const res = await api.get(`/api/days/${DAY.html1}/tasks`, a.cookie);
    expect(body<DayTask[]>(res).map((t) => t.status)).toEqual(['completed', 'in_progress']);
  });

  it("never shows another trainee's task progress", async () => {
    await markTaskCompleted(b.id, TASK.html1Main);

    const res = await api.get(`/api/days/${DAY.html1}/tasks`, a.cookie);
    expect(body<DayTask[]>(res).map((t) => t.status)).toEqual(['not_started', 'not_started']);
  });

  it('returns 403 DAY_LOCKED for a locked day', async () => {
    expectError(await api.get(`/api/days/${DAY.html2}/tasks`, a.cookie), 403, 'DAY_LOCKED');
  });

  it('returns 404 NOT_FOUND for an unknown day', async () => {
    expectError(await api.get('/api/days/html-day-99/tasks', a.cookie), 404, 'NOT_FOUND');
  });
});
