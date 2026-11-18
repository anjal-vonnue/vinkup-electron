import { describe, it, expect, beforeEach } from 'vitest';
import axios from 'axios';
import type {
  TaskCodeResponse,
  TaskResponse,
  DayTask,
  DayCurrentStatus,
  DayJournal,
  DashboardResponse,
  DaySummary,
  ActivityTimeDay,
  ProfileData,
  CourseCertificate,
} from '@itp/types';
import { installMockAdapter } from './mockAdapter';
import { mockDayContents } from './dayOverview';
import { mockTasksByDay } from '../test/fixtures/dayTasks';
import { mockJournalByDay, mockStatusByDay } from '../test/fixtures/dayStatus';
import { mockDateKey } from '../test/fixtures/activity';
import { CURRICULUM_COURSES } from '../constants/courses';
import { HEATMAP_DAYS } from '../lib/activityHeatmap';
import { todayKey } from '../lib/platformDate';

function createClient() {
  const client = axios.create();
  installMockAdapter(client);
  return client;
}

// Lock state now lives in mockStatusByDay, not on the day content.
function findUnlockedDayId(): string {
  const dayId = Object.keys(mockDayContents).find(
    (id) => mockStatusByDay[id] && !mockStatusByDay[id].isLocked
  );

  if (!dayId) {
    throw new Error('No unlocked day fixture found');
  }

  return dayId;
}

function findLockedDayId(): string {
  const dayId = Object.keys(mockDayContents).find((id) => mockStatusByDay[id]?.isLocked);

  if (!dayId) {
    throw new Error('No locked day fixture found');
  }

  return dayId;
}

describe('mockAdapter', () => {
  let client: ReturnType<typeof createClient>;

  beforeEach(() => {
    client = createClient();
  });

  it('returns the node fixture for GET /tasks/t-node', async () => {
    const res = await client.get<TaskResponse>('/tasks/t-node');

    expect(res.data.runtime).toBe('node');
  });

  it('rejects GET /tasks/locked with 403 DAY_LOCKED', async () => {
    await expect(client.get('/tasks/locked')).rejects.toMatchObject({
      response: {
        status: 403,
        data: {
          error: {
            code: 'DAY_LOCKED',
          },
        },
      },
    });
  });

  it('returns the saved files after a PUT then GET on the same code endpoint', async () => {
    const files = [
      {
        path: 'a.js',
        content: 'console.log(1)',
      },
    ];

    await client.put('/tasks/t-browser/code', {
      files,
    });

    const res = await client.get<TaskCodeResponse>('/tasks/t-browser/code');

    expect(res.data.files).toEqual(files);
  });

  it('no longer answers the removed /sql routes (SQL runs in the browser now)', async () => {
    await expect(client.get('/sql/database')).rejects.toMatchObject({
      response: {
        status: 404,
      },
    });
  });

  describe('curriculum tasks (from the trainee guides)', () => {
    it('returns a real task for GET /tasks/:id with its day and runtime', async () => {
      const res = await client.get<TaskResponse>('/tasks/html-day-01-t-2');

      expect(res.data).toMatchObject({
        id: 'html-day-01-t-2',
        title: 'Personal Profile Page',
        runtime: 'browser',
        status: 'completed',
        day: {
          id: 'html-day-01',
          dayNumber: 1,
          courseTitle: 'HTML',
        },
      });

      expect(res.data.instructionsMarkdown).toContain('profile.html');
    });

    it('returns starter files for GET /tasks/:id/code', async () => {
      const res = await client.get<TaskCodeResponse>('/tasks/react-day-01-t-1/code');

      expect(res.data.files.map((f) => f.path)).toContain('src/App.tsx');
    });

    it('runs PostgreSQL days in the terminal and ships the sample data as a file', async () => {
      const res = await client.get<TaskResponse>('/tasks/postgresql-day-03-t-1');
      const code = await client.get<TaskCodeResponse>('/tasks/postgresql-day-03-t-1/code');

      expect(res.data).toMatchObject({ runtime: 'node', runCommand: null, setupSql: null });
      expect(code.data.files.map((f) => f.path)).toContain('sample-data.sql');
      expect(code.data.files.find((f) => f.path === 'sample-data.sql')?.content).toContain(
        'create table tickets'
      );
    });

    it('rejects a task on a locked day with 403 DAY_LOCKED', async () => {
      const dayId = findLockedDayId();

      await expect(client.get(`/tasks/${dayId}-t-1`)).rejects.toMatchObject({
        response: {
          status: 403,
          data: {
            error: {
              code: 'DAY_LOCKED',
            },
          },
        },
      });
    });

    it('rejects an unknown task with 404 NOT_FOUND', async () => {
      await expect(client.get('/tasks/no-such-task')).rejects.toMatchObject({
        response: {
          status: 404,
          data: {
            error: {
              code: 'NOT_FOUND',
            },
          },
        },
      });
    });
  });

  describe('error scenarios', () => {
    it('fails the save for t-save-error', async () => {
      await expect(
        client.put('/tasks/t-save-error/code', {
          files: [],
        })
      ).rejects.toMatchObject({
        response: {
          status: 500,
          data: {
            error: {
              code: 'INTERNAL_ERROR',
            },
          },
        },
      });
    });

    it('rejects the submit for t-submit-error', async () => {
      await expect(client.post('/tasks/t-submit-error/submit')).rejects.toMatchObject({
        response: {
          status: 403,
          data: {
            error: {
              code: 'CHECKLIST_INCOMPLETE',
            },
          },
        },
      });
    });

    it('fails the task load for t-server-error', async () => {
      await expect(client.get('/tasks/t-server-error')).rejects.toMatchObject({
        response: {
          status: 500,
          data: {
            error: {
              code: 'INTERNAL_ERROR',
            },
          },
        },
      });
    });
  });

  describe('days', () => {
    it('PUT /days/:id/journal returns 404 NOT_FOUND for an unknown day', async () => {
      await expect(
        client.put('/days/unknown-day/journal', {
          responseText: 'hello',
        })
      ).rejects.toMatchObject({
        response: {
          status: 404,
          data: {
            error: {
              code: 'NOT_FOUND',
            },
          },
        },
      });
    });

    it('keeps a saved journal in localStorage so it survives a refresh', async () => {
      const dayId = findUnlockedDayId();

      const originalJournal = mockJournalByDay[dayId] ?? {
        responseText: null,
      };

      try {
        await client.put(`/days/${dayId}/journal`, {
          responseText: 'persist me',
        });

        const stored = JSON.parse(localStorage.getItem('itp-mock-journals-v1') ?? '{}') as Record<
          string,
          string | null
        >;

        expect(stored[dayId]).toBe('persist me');
      } finally {
        mockJournalByDay[dayId] = originalJournal;
        localStorage.removeItem('itp-mock-journals-v1');
      }
    });

    it('returns tasks for GET /days/:dayId/tasks', async () => {
      const dayId = findUnlockedDayId();

      const res = await client.get<DayTask[]>(`/days/${dayId}/tasks`);

      expect(res.status).toBe(200);
      expect(res.data).toEqual(mockTasksByDay[dayId] ?? []);
    });

    it('rejects GET /days/missing/tasks with 404 NOT_FOUND', async () => {
      await expect(client.get('/days/missing/tasks')).rejects.toMatchObject({
        response: {
          status: 404,
          data: {
            error: {
              code: 'NOT_FOUND',
            },
          },
        },
      });
    });

    it('rejects GET /days/:dayId/tasks with 403 DAY_LOCKED for a locked day', async () => {
      const dayId = findLockedDayId();

      await expect(client.get(`/days/${dayId}/tasks`)).rejects.toMatchObject({
        response: {
          status: 403,
          data: {
            error: {
              code: 'DAY_LOCKED',
            },
          },
        },
      });
    });

    it('returns the status for GET /days/:dayId/status', async () => {
      const dayId = findUnlockedDayId();

      const res = await client.get<DayCurrentStatus>(`/days/${dayId}/status`);

      expect(res.status).toBe(200);
      expect(res.data).toEqual(mockStatusByDay[dayId]);
    });

    it('returns the status with isLocked: true for a locked day instead of an error', async () => {
      const dayId = findLockedDayId();

      const res = await client.get<DayCurrentStatus>(`/days/${dayId}/status`);

      expect(res.status).toBe(200);
      expect(res.data.isLocked).toBe(true);
    });

    it('rejects GET /days/missing/status with 404 NOT_FOUND', async () => {
      await expect(client.get('/days/missing/status')).rejects.toMatchObject({
        response: {
          status: 404,
          data: {
            error: {
              code: 'NOT_FOUND',
            },
          },
        },
      });
    });

    it('PUT /days/:id/journal returns 204 and stores the body', async () => {
      const dayId = findUnlockedDayId();

      const originalJournal = mockJournalByDay[dayId] ?? {
        responseText: null,
      };

      try {
        const put = await client.put(`/days/${dayId}/journal`, {
          responseText: 'hello',
        });

        expect(put.status).toBe(204);

        const get = await client.get<DayJournal>(`/days/${dayId}/journal`);

        expect(get.status).toBe(200);
        expect(get.data.responseText).toBe('hello');
      } finally {
        mockJournalByDay[dayId] = originalJournal;
      }
    });

    it('returns the journal for GET /days/:dayId/journal', async () => {
      const dayId = findUnlockedDayId();

      const res = await client.get<DayJournal>(`/days/${dayId}/journal`);

      expect(res.status).toBe(200);
      expect(res.data).toEqual(
        mockJournalByDay[dayId] ?? {
          responseText: null,
        }
      );
    });

    it('returns an empty journal, not a 404, when the day has no journal row yet', async () => {
      const res = await client.get<DayJournal>('/days/no-journal-yet/journal');

      expect(res.status).toBe(200);
      expect(res.data).toEqual({
        responseText: null,
      });
    });

    it('PATCH /days/:id/status returns 404 with NOT_FOUND for an unknown day', async () => {
      await expect(client.patch('/days/unknown-day/status')).rejects.toMatchObject({
        response: {
          status: 404,
          data: {
            error: {
              code: 'NOT_FOUND',
            },
          },
        },
      });
    });

    it('does not handle PUT /days/:id/status anymore because completion uses PATCH', async () => {
      const dayId = findUnlockedDayId();

      await expect(client.put(`/days/${dayId}/status`)).rejects.toMatchObject({
        response: {
          status: 404,
        },
      });
    });

    it('completes a day with PATCH /days/:dayId/status when all required tasks are completed', async () => {
      const dayId = findUnlockedDayId();
      const tasks = mockTasksByDay[dayId] ?? [];

      const originalStatuses = tasks.map((task) => task.status);

      const originalCompleted = mockStatusByDay[dayId].isCompleted;

      try {
        tasks.forEach((task) => {
          if (!task.isStretchGoal) {
            task.status = 'completed';
          }
        });

        const res = await client.patch<DayCurrentStatus>(`/days/${dayId}/status`);

        expect(res.status).toBe(200);
        expect(res.data.isCompleted).toBe(true);
      } finally {
        tasks.forEach((task, index) => {
          task.status = originalStatuses[index];
        });

        mockStatusByDay[dayId].isCompleted = originalCompleted;
      }
    });

    it('rejects PATCH /days/:dayId/status when required tasks are incomplete', async () => {
      const dayId = findUnlockedDayId();
      const tasks = mockTasksByDay[dayId] ?? [];

      const originalStatuses = tasks.map((task) => task.status);

      try {
        const requiredTask = tasks.find((task) => !task.isStretchGoal);

        if (!requiredTask) {
          throw new Error('No required task fixture found');
        }

        requiredTask.status = 'not_started';

        await expect(client.patch(`/days/${dayId}/status`)).rejects.toMatchObject({
          response: {
            status: 400,
            data: {
              error: {
                code: 'CHECKLIST_INCOMPLETE',
              },
            },
          },
        });
      } finally {
        tasks.forEach((task, index) => {
          task.status = originalStatuses[index];
        });
      }
    });

    it('rejects PATCH /days/:dayId/status with 403 DAY_LOCKED for a locked day', async () => {
      const dayId = findLockedDayId();

      await expect(client.patch(`/days/${dayId}/status`)).rejects.toMatchObject({
        response: {
          status: 403,
          data: {
            error: {
              code: 'DAY_LOCKED',
            },
          },
        },
      });
    });
  });

  describe('activity', () => {
    it('answers GET /activity/time with generated activity, newest first', async () => {
      const res = await client.get<ActivityTimeDay[]>('/activity/time', {
        params: { days: HEATMAP_DAYS },
      });

      expect(res.status).toBe(200);
      expect(res.data.length).toBeGreaterThan(0);
      expect(res.data.length).toBeLessThanOrEqual(HEATMAP_DAYS);

      for (const day of res.data) {
        expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(day.activeSeconds).toBeGreaterThan(0);
        expect(day.codingSeconds).toBeLessThanOrEqual(day.activeSeconds);
      }

      const dates = res.data.map((day) => day.date);
      expect(dates).toEqual([...dates].sort().reverse());
      expect(dates[0] <= todayKey()).toBe(true); // nothing in the future
    });

    it('returns only the last 7 days when days is not given', async () => {
      const res = await client.get<ActivityTimeDay[]>('/activity/time');

      expect(res.status).toBe(200);
      const oldest = mockDateKey(6);
      expect(res.data.every((day) => day.date >= oldest)).toBe(true);
    });

    it('matches the mock profile: same total and same last 7 days', async () => {
      const activity = await client.get<ActivityTimeDay[]>('/activity/time', {
        params: { days: HEATMAP_DAYS },
      });
      const profile = await client.get<ProfileData>('/profile');

      const total = activity.data.reduce((sum, day) => sum + day.activeSeconds, 0);
      expect(total).toBe(profile.data.total.activeSeconds);

      // dailyActivity is newest first with today included; a day without activity is 0.
      profile.data.dailyActivity.forEach((row, daysAgo) => {
        const day = activity.data.find((d) => d.date === mockDateKey(daysAgo));
        expect(row.timeSpentSeconds).toBe(day?.activeSeconds ?? 0);
      });
    });
  });

  describe('dashboard', () => {
    async function getAllCourseDays(): Promise<DaySummary[]> {
      const responses = await Promise.all(
        CURRICULUM_COURSES.map((course) => client.get<DaySummary[]>(`/courses/${course.id}/days`))
      );

      return responses.flatMap((res) => res.data);
    }

    it('returns the dashboard for GET /dashboard', async () => {
      const res = await client.get<DashboardResponse>('/dashboard');

      expect(res.status).toBe(200);

      expect(res.data.today).toEqual(
        expect.objectContaining({
          activeSeconds: expect.any(Number) as number,
        })
      );

      expect(res.data.total.codingSeconds).toBeGreaterThanOrEqual(res.data.today.codingSeconds);
    });

    it('does not send the list of courses or days in the dashboard', async () => {
      const res = await client.get<DashboardResponse>('/dashboard');

      expect(res.data).not.toHaveProperty('courses');

      expect(res.data).not.toHaveProperty('currentDay');
    });

    it('returns an unlocked next day with the total number of days in its course', async () => {
      const dashboard = await client.get<DashboardResponse>('/dashboard');

      const nextDay = dashboard.data.nextDay;

      if (!nextDay) {
        throw new Error('Expected the fixture to have a next day');
      }

      expect(nextDay.status).toBe('UNLOCKED');

      const courseDays = await client.get<DaySummary[]>(`/courses/${nextDay.courseId}/days`);

      expect(nextDay.courseTotalDays).toBe(courseDays.data.length);

      expect(nextDay.description.length).toBeGreaterThan(0);
    });

    it('lists the next day in its own course with the same status', async () => {
      const dashboard = await client.get<DashboardResponse>('/dashboard');

      const nextDay = dashboard.data.nextDay;

      if (!nextDay) {
        throw new Error('Expected the fixture to have a next day');
      }

      const courseDays = await client.get<DaySummary[]>(`/courses/${nextDay.courseId}/days`);

      const listed = courseDays.data.find((day) => day.id === nextDay.id);

      expect(listed?.status).toBe(nextDay.status);

      expect(listed?.title).toBe(nextDay.title);
    });

    it('counts the total and completed days across every course', async () => {
      const [dashboard, allDays] = await Promise.all([
        client.get<DashboardResponse>('/dashboard'),
        getAllCourseDays(),
      ]);

      expect(dashboard.data.totalDaysOverall).toBe(allDays.length);

      expect(dashboard.data.totalDaysCompleteOverall).toBe(
        allDays.filter((day) => day.status === 'COMPLETED').length
      );
    });

    it('has exactly one unlocked day across all courses', async () => {
      const allDays = await getAllCourseDays();

      expect(allDays.filter((day) => day.status === 'UNLOCKED')).toHaveLength(1);
    });

    it('returns typing results with a latest attempt and a trend in date order', async () => {
      const res = await client.get<DashboardResponse>('/dashboard');

      const { latest, trend } = res.data.typing;

      expect(latest?.wpm).toBeGreaterThan(0);

      const dates = trend.map((point) => point.date);

      expect(dates).toEqual([...dates].sort());
    });
  });

  describe('course days', () => {
    it('returns the days of a course for GET /courses/:courseId/days', async () => {
      const res = await client.get<DaySummary[]>('/courses/css/days');

      expect(res.status).toBe(200);
      expect(res.data.length).toBeGreaterThan(0);

      expect(res.data.every((day) => day.courseId === 'css')).toBe(true);
    });

    it('returns the days in day-number order', async () => {
      const res = await client.get<DaySummary[]>('/courses/css/days');

      const numbers = res.data.map((day) => day.dayNumber);

      expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    });

    it('never has a completed day after a locked one within a course', async () => {
      const res = await client.get<DaySummary[]>('/courses/css/days');

      const firstLocked = res.data.findIndex((day) => day.status === 'LOCKED');

      if (firstLocked !== -1) {
        expect(res.data.slice(firstLocked).every((day) => day.status === 'LOCKED')).toBe(true);
      }
    });

    it('includes a description on every day', async () => {
      const res = await client.get<DaySummary[]>('/courses/css/days');

      expect(res.data.every((day) => day.description.length > 0)).toBe(true);
    });

    it('rejects GET /courses/missing/days with 404 NOT_FOUND', async () => {
      await expect(client.get('/courses/missing/days')).rejects.toMatchObject({
        response: {
          status: 404,
          data: {
            error: {
              code: 'NOT_FOUND',
            },
          },
        },
      });
    });
  });

  describe('certificates', () => {
    it('lists the finished courses on GET /dashboard', async () => {
      const res = await client.get<DashboardResponse>('/dashboard');

      expect(res.data.completedCourseIds).toContain('html');
      expect(res.data.completedCourseIds).not.toContain('react');
    });

    it('returns the certificate of a finished course', async () => {
      const res = await client.get<CourseCertificate>('/courses/html/certificate');

      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({
        courseId: 'html',
        courseTitle: 'HTML',
        daysCompleted: 5,
      });
      expect(res.data.certificateId).toMatch(/^VK-/);
    });

    it('rejects an unfinished course with 403 FORBIDDEN', async () => {
      await expect(client.get('/courses/react/certificate')).rejects.toMatchObject({
        response: { status: 403, data: { error: { code: 'FORBIDDEN' } } },
      });
    });

    it('rejects an unknown course with 404 NOT_FOUND', async () => {
      await expect(client.get('/courses/cobol/certificate')).rejects.toMatchObject({
        response: { status: 404, data: { error: { code: 'NOT_FOUND' } } },
      });
    });
  });

  it('returns 404 for an unknown route', async () => {
    await expect(client.get('/nothing-here')).rejects.toMatchObject({
      response: {
        status: 404,
        data: {
          error: {
            code: 'NOT_FOUND',
          },
        },
      },
    });
  });
});
