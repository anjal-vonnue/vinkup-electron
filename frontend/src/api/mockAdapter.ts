import {
  AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import type {
  ApiErrorResponse,
  CompleteDayResponse,
  SubmitTaskResponse,
  TaskCodeResponse,
  TaskFile,
  TaskResponse,
  SaveJournalRequest,
  TaskReview,
  TaskReviewSummary,
  AdminFeedbackEntry,
} from '@itp/types';
import { mockUser } from '../test/fixtures/user';
import {
  buildAdminFlags,
  buildAdminTaskCode,
  buildAdminTraineeDetail,
  buildAdminTrainees,
  mockAdmin,
} from '../test/fixtures/admin';
import { mockTaskStatus, mockTasksByDay } from '../test/fixtures/dayTasks';
import {
  catalogTaskCode,
  catalogTaskResponse,
  findCatalogTask,
  scenarios,
  catalogDayTasks,
} from './mockTasks';
import { mockStatusByDay, mockJournalByDay } from '../test/fixtures/dayStatus';
import { mockDayContents } from './dayOverview';
import { buildCourseDays, buildDashboard, buildCertificate } from '../test/fixtures/dashboard';
import { addTypingResult, buildTypingResults } from '../test/fixtures/typingTest';
import { mockProfile } from '../test/fixtures/profile';
import { addMockTrainee } from '../test/fixtures/admin';
import type { CreateTraineeRequest } from '@itp/types';
import { buildMockActivityTime } from '../test/fixtures/activity';

const MOCK_DELAY_MS = 300;

/**
 * Who `/auth/me` answers as. Default is the trainee; run with VITE_MOCK_ROLE=admin to see the
 * mentor pages. Read on every call so tests can switch it with vi.stubEnv.
 */
function currentMockUser() {
  return import.meta.env.VITE_MOCK_ROLE === 'admin' ? mockAdmin : mockUser;
}

const savedFiles = new Map<string, TaskFile[]>();
const mockReviews: TaskReview[] = [];
const JOURNAL_STORAGE_KEY = 'itp-mock-journals-v1';

function readSavedJournals(): Record<string, string | null> {
  try {
    const raw = localStorage.getItem(JOURNAL_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string | null>;
  } catch {
    // storage unavailable or corrupted: start fresh
  }
  return {};
}

function writeSavedJournals(journals: Record<string, string | null>): void {
  try {
    localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(journals));
  } catch {
    // ignore: the mock still works in memory
  }
}

const savedJournals = readSavedJournals();

for (const [dayId, responseText] of Object.entries(savedJournals)) {
  mockJournalByDay[dayId] = { responseText };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function respond<T>(config: InternalAxiosRequestConfig, status: number, data: T): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: String(status),
    headers: {},
    config,
  };
}

function errorResponse(
  config: InternalAxiosRequestConfig,
  status: number,
  code: ApiErrorResponse['error']['code'],
  message: string
): Promise<AxiosResponse<never>> {
  const data: ApiErrorResponse = { error: { code, message } };
  const response = respond(config, status, data);
  return Promise.reject(new AxiosError(message, undefined, config, undefined, response));
}

// Tasks: test scenarios first (/tasks/t-browser, t-node, t-sql, … see mockTasks/scenarios.ts),
// then the real curriculum tasks from the trainee guides (/tasks/html-day-01-t-2, …).

function codeFixtureFor(taskId: string): TaskCodeResponse | null {
  if (savedFiles.has(taskId)) {
    return { files: savedFiles.get(taskId) as TaskFile[], updatedAt: new Date().toISOString() };
  }
  return scenarios[taskId]?.code ?? catalogTaskCode(taskId);
}

function taskFixtureFor(taskId: string): TaskResponse | null {
  const scenario = scenarios[taskId];
  if (scenario) return scenario.task;
  const found = findCatalogTask(taskId);
  return found ? catalogTaskResponse(taskId, mockTaskStatus(found.day.dayId)) : null;
}

/** A curriculum task whose day is locked answers 403, like the real API (FR-1). */
function isLockedTask(taskId: string): boolean {
  if (taskId === 'locked') return true;
  const found = findCatalogTask(taskId);
  return found ? mockStatusByDay[found.day.dayId]?.isLocked === true : false;
}

function scenarioFailure(
  config: InternalAxiosRequestConfig,
  taskId: string,
  step: 'getTask' | 'getCode' | 'saveCode' | 'submit'
): Promise<AxiosResponse<never>> | null {
  const failure = scenarios[taskId]?.fail?.[step];
  return failure ? errorResponse(config, failure.status, failure.code, failure.message) : null;
}

async function handle(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  await delay(MOCK_DELAY_MS);

  const method = (config.method ?? 'get').toLowerCase();
  const url = config.url ?? '';

  const codeMatch = /^\/?tasks\/([^/]+)\/code$/.exec(url);
  const taskMatch = /^\/tasks\/([^/]+)$/.exec(url);
  const submitMatch = /^\/tasks\/([^/]+)\/submit$/.exec(url);
  const taskReviewMatch = /^\/tasks\/([^/]+)\/review$/.exec(url);
  const taskReviewsMatch = /^\/tasks\/([^/]+)\/reviews$/.exec(url);
  const activityMatch = /^\/activity\/([^/]+)\/events$/.exec(url);
  const dayContentMatch = /^\/days\/([^/]+)$/.exec(url);
  const dayTasksMatch = /^\/days\/([^/]+)\/tasks$/.exec(url);
  const dayStatusMatch = /^\/days\/([^/]+)\/status$/.exec(url);
  const dayCompleteMatch = /^\/days\/([^/]+)\/complete$/.exec(url);
  const dayJournalMatch = /^\/days\/([^/]+)\/journal$/.exec(url);
  const courseDaysMatch = /^\/courses\/([^/]+)\/days$/.exec(url);
  const adminTraineeMatch = /^\/admin\/trainees\/([^/]+)$/.exec(url);
  const adminFlagsMatch = /^\/admin\/trainees\/([^/]+)\/flags$/.exec(url);
  const adminCodeMatch = /^\/admin\/trainees\/([^/]+)\/tasks\/([^/]+)\/code$/.exec(url);
  const adminApproveMatch = /^\/admin\/trainees\/([^/]+)\/tasks\/([^/]+)\/approve$/.exec(url);
  const adminReworkMatch = /^\/admin\/trainees\/([^/]+)\/tasks\/([^/]+)\/rework$/.exec(url);
  const adminTaskReviewsMatch = /^\/admin\/trainees\/([^/]+)\/tasks\/([^/]+)\/reviews$/.exec(url);
  const adminFeedbackMatch = /^\/admin\/trainees\/([^/]+)\/feedback$/.exec(url);
  const courseCertificateMatch = /^\/courses\/([^/]+)\/certificate$/.exec(url);

  if (method === 'get' && codeMatch) {
    const taskId = codeMatch[1];
    if (isLockedTask(taskId)) {
      return errorResponse(
        config,
        403,
        'DAY_LOCKED',
        'Finish the previous day to unlock this task.'
      );
    }
    const failure = scenarioFailure(config, taskId, 'getCode');
    if (failure) return failure;
    const code = codeFixtureFor(taskId);
    return code
      ? respond(config, 200, code)
      : errorResponse(config, 404, 'NOT_FOUND', 'Task not found.');
  }

  if (method === 'put' && codeMatch) {
    const taskId = codeMatch[1];
    const failure = scenarioFailure(config, taskId, 'saveCode');
    if (failure) return failure;
    const body = JSON.parse(config.data as string) as { files: TaskFile[] };
    savedFiles.set(taskId, body.files);
    return respond(config, 204, undefined);
  }

  if (method === 'post' && submitMatch) {
    const failure = scenarioFailure(config, submitMatch[1], 'submit');
    if (failure) return failure;
    const data: SubmitTaskResponse = {
      status: 'completed',
      submittedAt: new Date().toISOString(),
      reviewStatus: 'pending',
      submissionCount: 1,
    };
    return respond(config, 200, data);
  }

  if (method === 'get' && taskReviewMatch) {
    const taskId = taskReviewMatch[1];
    const reviews = mockReviews.filter((r) => r.taskId === taskId);
    const latestReview = reviews[0] ?? null;
    const data: TaskReviewSummary = {
      reviewStatus: latestReview ? latestReview.decision : null,
      submissionCount: reviews.length,
      latestReview,
    };
    return respond(config, 200, data);
  }

  if (method === 'get' && taskReviewsMatch) {
    const taskId = taskReviewsMatch[1];
    const reviews = mockReviews.filter((r) => r.taskId === taskId);
    return respond(config, 200, reviews);
  }

  if (method === 'get' && taskMatch) {
    const taskId = taskMatch[1];
    if (isLockedTask(taskId)) {
      return errorResponse(
        config,
        403,
        'DAY_LOCKED',
        'Finish the previous day to unlock this task.'
      );
    }
    const failure = scenarioFailure(config, taskId, 'getTask');
    if (failure) return failure;
    const task = taskFixtureFor(taskId);
    return task
      ? respond(config, 200, task)
      : errorResponse(config, 404, 'NOT_FOUND', 'Task not found.');
  }

  if (method === 'post' && activityMatch) {
    console.log(config.data);
    return respond(config, 204, undefined);
  }

  if (method === 'get' && url === '/activity/time') {
    const params = config.params as { days?: number } | undefined;
    const days = params?.days ?? 7;
    return respond(config, 200, buildMockActivityTime(days));
  }

  if (method === 'get' && url === '/activity/time') {
    console.log('[MOCK ACTIVITY GET]', config.data);
    return respond(config, 200, []);
  }

  if (method === 'get' && url === '/auth/me') {
    return respond(config, 200, currentMockUser());
  }

  if (method === 'get' && dayContentMatch) {
    const day = mockDayContents[dayContentMatch[1]];
    return day
      ? respond(config, 200, day)
      : errorResponse(config, 404, 'NOT_FOUND', 'Day not found.');
  }

  if (method === 'get' && dayTasksMatch) {
    const dayId = dayTasksMatch[1];

    if (!mockDayContents[dayId]) {
      return errorResponse(config, 404, 'NOT_FOUND', 'Day not found.');
    }
    if (mockStatusByDay[dayId]?.isLocked) {
      return errorResponse(
        config,
        403,
        'DAY_LOCKED',
        'Finish the previous day to unlock this day.'
      );
    }

    const status = mockTaskStatus(dayId);

    return respond(config, 200, catalogDayTasks(dayId, status));
  }

  if (method === 'get' && dayStatusMatch) {
    const dayId = dayStatusMatch[1];
    const status = mockStatusByDay[dayId];
    if (!mockDayContents[dayId] || !status) {
      return errorResponse(config, 404, 'NOT_FOUND', 'Day not found.');
    }
    return respond(config, 200, status);
  }

  if (method === 'patch' && (dayStatusMatch || dayCompleteMatch)) {
    const dayId = (dayCompleteMatch ?? dayStatusMatch)![1];
    const status = mockStatusByDay[dayId];

    if (!mockDayContents[dayId] || !status) {
      return errorResponse(config, 404, 'NOT_FOUND', 'Day not found.');
    }
    if (status.isLocked) {
      return errorResponse(config, 403, 'DAY_LOCKED', "This day isn't unlocked yet.");
    }

    // Every required task must be completed (stretch goals don't count).
    const hasIncompleteRequired = (mockTasksByDay[dayId] ?? []).some(
      (task) => !task.isStretchGoal && task.status !== 'completed'
    );
    if (hasIncompleteRequired) {
      return errorResponse(
        config,
        400,
        'CHECKLIST_INCOMPLETE',
        'Check all required items before submitting.'
      );
    }

    status.isCompleted = true;
    if (dayCompleteMatch) {
      const dayIds = Object.keys(mockDayContents);
      const nextDayId = dayIds[dayIds.indexOf(dayId) + 1] ?? null;
      const data: CompleteDayResponse = { status, nextDayId };
      return respond(config, 200, data);
    }
    return respond(config, 200, status);
  }

  if (method === 'get' && dayJournalMatch) {
    // No journal row yet is normal for a new trainee: return an empty response, not a 404.
    const journal = mockJournalByDay[dayJournalMatch[1]] ?? { responseText: null };
    return respond(config, 200, journal);
  }

  if (method === 'put' && dayJournalMatch) {
    const dayId = dayJournalMatch[1];
    if (!mockDayContents[dayId]) return errorResponse(config, 404, 'NOT_FOUND', 'Day not found.');

    const body = JSON.parse(config.data as string) as SaveJournalRequest;
    mockJournalByDay[dayId] = { responseText: body.responseText };
    savedJournals[dayId] = body.responseText;
    writeSavedJournals(savedJournals);
    return respond(config, 204, undefined);
  }

  if (method === 'get' && url === '/dashboard') {
    return respond(config, 200, buildDashboard());
  }

  if (method === 'get' && url === '/profile') {
    return respond(config, 200, mockProfile);
  }

  // Mentor endpoints: read-only, and only for the admin role, like requireAdmin on the backend.
  if (url.startsWith('/admin/')) {
    if (currentMockUser().role !== 'admin') {
      return errorResponse(config, 403, 'FORBIDDEN', 'Admin access only.');
    }

    if (method === 'post' && url === '/admin/trainees') {
      const body = JSON.parse(config.data as string) as CreateTraineeRequest;
      const result = addMockTrainee(body);
      if (result.kind === 'domain') {
        return errorResponse(
          config,
          400,
          'DOMAIN_NOT_PERMITTED',
          'Use a company email address ending in @vonnue.com.'
        );
      }
      if (result.kind === 'admin') {
        return errorResponse(
          config,
          409,
          'EMAIL_BELONGS_TO_ADMIN',
          'This email belongs to a mentor account.'
        );
      }
      if (result.kind === 'exists') {
        return errorResponse(
          config,
          409,
          'TRAINEE_EXISTS',
          'A trainee with this email already exists.'
        );
      }
      return respond(config, 201, result.trainee);
    }

    if (method === 'post' && adminApproveMatch) {
      const [, , taskId] = adminApproveMatch;
      const body = config.data ? (JSON.parse(config.data as string) as { feedback?: string }) : {};
      const newReview: TaskReview = {
        id: `rev-${Date.now()}`,
        taskId,
        adminId: currentMockUser().id,
        adminName: currentMockUser().name,
        submissionNo: 1,
        decision: 'approved',
        feedback: body.feedback ?? '',
        reviewedAt: new Date().toISOString(),
      };
      mockReviews.unshift(newReview);
      return respond(config, 201, newReview);
    }

    if (method === 'post' && adminReworkMatch) {
      const [, , taskId] = adminReworkMatch;
      const body = JSON.parse(config.data as string) as { feedback: string };
      if (!body.feedback || !body.feedback.trim()) {
        return errorResponse(config, 400, 'VALIDATION_FAILED', 'Feedback is required.');
      }
      const newReview: TaskReview = {
        id: `rev-${Date.now()}`,
        taskId,
        adminId: currentMockUser().id,
        adminName: currentMockUser().name,
        submissionNo: 1,
        decision: 'rework',
        feedback: body.feedback.trim(),
        reviewedAt: new Date().toISOString(),
      };
      mockReviews.unshift(newReview);
      return respond(config, 201, newReview);
    }

    if (method !== 'get') {
      return errorResponse(config, 404, 'NOT_FOUND', 'Not found.');
    }

    if (url === '/admin/trainees') {
      return respond(config, 200, buildAdminTrainees());
    }

    if (adminTaskReviewsMatch) {
      const [, , taskId] = adminTaskReviewsMatch;
      const reviews = mockReviews.filter((r) => r.taskId === taskId);
      return respond(config, 200, reviews);
    }

    if (adminFeedbackMatch) {
      const feedbacks: AdminFeedbackEntry[] = mockReviews
        .filter((r) => r.feedback)
        .map((r) => ({
          id: r.id,
          taskId: r.taskId,
          taskTitle: 'Day Task',
          dayId: 'html-day-01',
          adminId: r.adminId,
          adminName: r.adminName,
          submissionNo: r.submissionNo,
          decision: r.decision,
          feedback: r.feedback,
          reviewedAt: r.reviewedAt,
        }));
      return respond(config, 200, feedbacks);
    }

    if (adminFlagsMatch) {
      const flags = buildAdminFlags(adminFlagsMatch[1]);
      return flags
        ? respond(config, 200, flags)
        : errorResponse(config, 404, 'NOT_FOUND', 'Trainee not found.');
    }

    if (adminCodeMatch) {
      const result = buildAdminTaskCode(adminCodeMatch[1], adminCodeMatch[2]);
      if (result.kind === 'no-trainee') {
        return errorResponse(config, 404, 'NOT_FOUND', 'Trainee not found.');
      }
      if (result.kind === 'no-task') {
        return errorResponse(config, 404, 'NOT_FOUND', 'Task not found.');
      }
      return respond(config, 200, result.data);
    }

    if (adminTraineeMatch) {
      const detail = buildAdminTraineeDetail(adminTraineeMatch[1]);
      return detail
        ? respond(config, 200, detail)
        : errorResponse(config, 404, 'NOT_FOUND', 'Trainee not found.');
    }
  }

  if (method === 'get' && courseDaysMatch) {
    const days = buildCourseDays(courseDaysMatch[1]);
    if (!days) return errorResponse(config, 404, 'NOT_FOUND', 'Course not found.');
    return respond(config, 200, days);
  }

  if (method === 'get' && courseCertificateMatch) {
    const result = buildCertificate(courseCertificateMatch[1]);
    if (result.kind === 'no-course') {
      return errorResponse(config, 404, 'NOT_FOUND', 'Course not found.');
    }
    if (result.kind === 'locked') {
      return errorResponse(
        config,
        403,
        'FORBIDDEN',
        'Finish every day of this course to get its certificate.'
      );
    }
    return respond(config, 200, result.data);
  }

  if (method === 'get' && url === '/typing-test/results') {
    return respond(config, 200, buildTypingResults());
  }

  if (method === 'post' && url === '/typing-test/results') {
    const body = JSON.parse(config.data as string) as { wpm: number; accuracy: number };
    return respond(config, 201, addTypingResult(body));
  }
  return errorResponse(config, 404, 'NOT_FOUND', 'Not found.');
}

/** Turns on the fake backend for `VITE_USE_MOCKS=true`. Answers from fixtures after a short delay. */
export function installMockAdapter(client: AxiosInstance): void {
  client.defaults.adapter = handle;
}
