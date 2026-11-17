import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AdminFeedbackEntry, TaskResponse, TaskReview, TaskReviewSummary } from '@itp/types';
import type { task_progress } from '../../generated/prisma/client';
import { db } from './helpers/db';
import {
  DAY,
  TASK,
  createAdmin,
  freshTrainees,
  markTaskCompleted,
  seedCurriculum,
  type TestAdmin,
  type TestTrainee,
} from './helpers/fixtures';
import { api, body, expectError, expectIsoDateTime } from './helpers/http';

let a: TestTrainee;
let b: TestTrainee;
let admin: TestAdmin;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a, b } = await freshTrainees());
  admin = await createAdmin('Review Mentor');
});

const submit = (taskId: string, trainee: TestTrainee = a) =>
  api.post(`/api/tasks/${taskId}/submit`, undefined, trainee.cookie);

const reviewUrl = (taskId: string) => `/api/tasks/${taskId}/review`;
const approveUrl = (traineeId: string, taskId: string) =>
  `/api/admin/trainees/${traineeId}/tasks/${taskId}/approve`;
const reworkUrl = (traineeId: string, taskId: string) =>
  `/api/admin/trainees/${traineeId}/tasks/${taskId}/rework`;
const historyUrl = (traineeId: string, taskId: string) =>
  `/api/admin/trainees/${traineeId}/tasks/${taskId}/reviews`;

async function progressRow(traineeId: string, taskId: string): Promise<task_progress | null> {
  return db.task_progress.findUnique({
    where: { trainee_id_task_id: { trainee_id: traineeId, task_id: taskId } },
  });
}

describe('submission review lifecycle', () => {
  it('a submitted task is completed and pending review on the progress row', async () => {
    const res = await submit(TASK.html1Main);
    expect(res.status).toBe(200);
    expect(body<{ reviewStatus: string; submissionCount: number }>(res)).toMatchObject({
      reviewStatus: 'pending',
      submissionCount: 1,
    });

    const row = await progressRow(a.id, TASK.html1Main);
    expect(row?.status).toBe('completed');
    expect(row?.review_status).toBe('pending');
    expect(row?.submission_count).toBe(1);
  });

  it('a legacy submission (never reviewed) can be reviewed for the first time', async () => {
    await markTaskCompleted(a.id, TASK.html1Main); // no review_status set

    const res = await api.post(approveUrl(a.id, TASK.html1Main), {}, admin.cookie);
    expect(res.status).toBe(201);
    expect(await progressRow(a.id, TASK.html1Main)).toMatchObject({ review_status: 'approved' });
  });

  it('an admin approves a waiting submission and the trainee sees it', async () => {
    await submit(TASK.html1Main);

    const res = await api.post(approveUrl(a.id, TASK.html1Main), {}, admin.cookie);
    expect(res.status).toBe(201);
    const review = body<TaskReview>(res);
    expect(review.decision).toBe('approved');
    expect(review.adminName).toBe('Review Mentor');
    expect(review.adminId).toBe(admin.id);
    expect(review.submissionNo).toBe(1);
    expectIsoDateTime(review.reviewedAt);

    const row = await progressRow(a.id, TASK.html1Main);
    expect(row?.review_status).toBe('approved');

    const summary = body<TaskReviewSummary>(await api.get(reviewUrl(TASK.html1Main), a.cookie));
    expect(summary.reviewStatus).toBe('approved');
    expect(summary.submissionCount).toBe(1);
    expect(summary.latestReview?.decision).toBe('approved');
  });

  it('an admin requests rework with feedback, persisted atomically with the status', async () => {
    await submit(TASK.html1Main);

    const res = await api.post(
      reworkUrl(a.id, TASK.html1Main),
      { feedback: 'Fix the missing <title> tag and resubmit.' },
      admin.cookie
    );
    expect(res.status).toBe(201);
    const review = body<TaskReview>(res);
    expect(review.decision).toBe('rework');
    expect(review.feedback).toBe('Fix the missing <title> tag and resubmit.');
    expect(review.submissionNo).toBe(1);

    const row = await progressRow(a.id, TASK.html1Main);
    expect(row?.review_status).toBe('rework');
    expect(row?.status).toBe('completed'); // the task itself stays completed

    const summary = body<TaskReviewSummary>(await api.get(reviewUrl(TASK.html1Main), a.cookie));
    expect(summary.reviewStatus).toBe('rework');
    expect(summary.latestReview?.feedback).toContain('<title>');
  });

  it('rework requires non-empty feedback and then changes nothing', async () => {
    await submit(TASK.html1Main);

    expectError(
      await api.post(reworkUrl(a.id, TASK.html1Main), { feedback: '' }, admin.cookie),
      400,
      'VALIDATION_FAILED'
    );
    expectError(
      await api.post(reworkUrl(a.id, TASK.html1Main), { feedback: '   ' }, admin.cookie),
      400,
      'VALIDATION_FAILED'
    );
    expectError(
      await api.post(reworkUrl(a.id, TASK.html1Main), {}, admin.cookie),
      400,
      'VALIDATION_FAILED'
    );

    const row = await progressRow(a.id, TASK.html1Main);
    expect(row?.review_status).toBe('pending');
    expect(await db.task_review.count()).toBe(0);
  });

  it('an approval note is optional but stored', async () => {
    await submit(TASK.html1Main);
    const res = await api.post(
      approveUrl(a.id, TASK.html1Main),
      { feedback: 'Great work.' },
      admin.cookie
    );
    expect(body<TaskReview>(res).feedback).toBe('Great work.');
  });

  it('a review cannot happen without a submission waiting', async () => {
    expectError(
      await api.post(approveUrl(a.id, TASK.html1Main), {}, admin.cookie),
      409,
      'TASK_NOT_SUBMITTED'
    );
    expectError(
      await api.post(reworkUrl(a.id, TASK.html1Main), { feedback: 'x' }, admin.cookie),
      409,
      'TASK_NOT_SUBMITTED'
    );

    // Saved but not submitted is also not reviewable.
    await api.put(`/api/tasks/${TASK.html1Main}/code`, { files: [] }, a.cookie);
    expectError(
      await api.post(approveUrl(a.id, TASK.html1Main), {}, admin.cookie),
      409,
      'TASK_NOT_SUBMITTED'
    );
  });

  it('a reviewed submission cannot be reviewed again (duplicate requests are safe)', async () => {
    await submit(TASK.html1Main);
    expect((await api.post(approveUrl(a.id, TASK.html1Main), {}, admin.cookie)).status).toBe(201);

    expectError(
      await api.post(approveUrl(a.id, TASK.html1Main), {}, admin.cookie),
      409,
      'ALREADY_REVIEWED'
    );
    expectError(
      await api.post(reworkUrl(a.id, TASK.html1Main), { feedback: 'x' }, admin.cookie),
      409,
      'ALREADY_REVIEWED'
    );
    expect(await db.task_review.count()).toBe(1);
  });

  it('an approved task cannot be resubmitted', async () => {
    await submit(TASK.html1Main);
    await api.post(approveUrl(a.id, TASK.html1Main), {}, admin.cookie);

    expectError(await submit(TASK.html1Main), 409, 'ALREADY_APPROVED');
    expect((await progressRow(a.id, TASK.html1Main))?.submission_count).toBe(1);
  });

  it('a pending task can be submitted again: the new attempt waits for review', async () => {
    await submit(TASK.html1Main);
    await submit(TASK.html1Main);

    const row = await progressRow(a.id, TASK.html1Main);
    expect(row?.review_status).toBe('pending');
    expect(row?.submission_count).toBe(2);
  });
});

describe('multiple review cycles', () => {
  it('keeps every review across rework -> resubmit -> rework -> approve', async () => {
    // Attempt 1 -> rework
    await submit(TASK.html1Main);
    await api.post(
      reworkUrl(a.id, TASK.html1Main),
      { feedback: 'First round: indent your tags.' },
      admin.cookie
    );

    // Attempt 2 (resubmit) -> rework again
    const resubmit = await submit(TASK.html1Main);
    expect(body<{ submissionCount: number }>(resubmit).submissionCount).toBe(2);
    await api.post(
      reworkUrl(a.id, TASK.html1Main),
      { feedback: 'Second round: still missing the head section.' },
      admin.cookie
    );

    // Attempt 3 -> approved
    await submit(TASK.html1Main);
    const approval = await api.post(approveUrl(a.id, TASK.html1Main), {}, admin.cookie);
    expect(body<TaskReview>(approval).submissionNo).toBe(3);

    // Nothing was overwritten: three history rows, newest first.
    const history = body<TaskReview[]>(
      await api.get(historyUrl(a.id, TASK.html1Main), admin.cookie)
    );
    expect(history).toHaveLength(3);
    expect(history.map((review) => review.decision)).toEqual(['approved', 'rework', 'rework']);
    expect(history.map((review) => review.submissionNo)).toEqual([3, 2, 1]);
    expect(history[2].feedback).toBe('First round: indent your tags.');

    const row = await progressRow(a.id, TASK.html1Main);
    expect(row?.review_status).toBe('approved');
    expect(row?.submission_count).toBe(3);
    expect(await db.task_review.count()).toBe(3);
  });

  it('the trainee can read their own review history, newest first', async () => {
    await submit(TASK.html1Main);
    await api.post(reworkUrl(a.id, TASK.html1Main), { feedback: 'Round one.' }, admin.cookie);
    await submit(TASK.html1Main);

    const history = body<TaskReview[]>(
      await api.get(`/api/tasks/${TASK.html1Main}/reviews`, a.cookie)
    );
    expect(history).toHaveLength(1);
    expect(history[0].feedback).toBe('Round one.');
    expect(history[0].adminName).toBe('Review Mentor');

    // Feedback survives the resubmission.
    const summary = body<TaskReviewSummary>(await api.get(reviewUrl(TASK.html1Main), a.cookie));
    expect(summary.reviewStatus).toBe('pending');
    expect(summary.latestReview?.feedback).toBe('Round one.');
  });

  it('the admin feedback list only has feedback-bearing reviews, newest first', async () => {
    await submit(TASK.html1Main);
    await api.post(reworkUrl(a.id, TASK.html1Main), { feedback: 'Please rework.' }, admin.cookie);
    await submit(TASK.html1Main);
    await api.post(approveUrl(a.id, TASK.html1Main), {}, admin.cookie); // no note

    await submit(TASK.html1Stretch);
    await api.post(
      approveUrl(a.id, TASK.html1Stretch),
      { feedback: 'Stretch note.' },
      admin.cookie
    );

    const list = body<AdminFeedbackEntry[]>(
      await api.get(`/api/admin/trainees/${a.id}/feedback`, admin.cookie)
    );
    expect(list).toHaveLength(2); // the noteless approval is not feedback
    expect(list[0]).toMatchObject({
      taskTitle: 'Printable version',
      feedback: 'Stretch note.',
      decision: 'approved',
      adminName: 'Review Mentor',
    });
    expect(list[0].taskId).toBe(TASK.html1Stretch);
    expect(list[1].feedback).toBe('Please rework.');
  });

  it('the empty feedback list for a trainee without reviews is an empty array', async () => {
    const list = await api.get(`/api/admin/trainees/${a.id}/feedback`, admin.cookie);
    expect(list.status).toBe(200);
    expect(body<AdminFeedbackEntry[]>(list)).toEqual([]);
  });
});

describe('review authorization', () => {
  it('unauthenticated users cannot review or read reviews', async () => {
    await submit(TASK.html1Main);
    expectError(
      await api.post(approveUrl(a.id, TASK.html1Main), {}, undefined),
      401,
      'UNAUTHENTICATED'
    );
    expectError(await api.get(reviewUrl(TASK.html1Main), undefined), 401, 'UNAUTHENTICATED');
  });

  it('a trainee cannot approve or send their own submission for rework', async () => {
    await submit(TASK.html1Main);
    expectError(await api.post(approveUrl(a.id, TASK.html1Main), {}, a.cookie), 403, 'FORBIDDEN');
    expectError(
      await api.post(reworkUrl(a.id, TASK.html1Main), { feedback: 'self' }, a.cookie),
      403,
      'FORBIDDEN'
    );
    expect(await db.task_review.count()).toBe(0);
    expect((await progressRow(a.id, TASK.html1Main))?.review_status).toBe('pending');
  });

  it("a trainee cannot read another trainee's reviews or feedback", async () => {
    await submit(TASK.html1Main);
    await api.post(reworkUrl(a.id, TASK.html1Main), { feedback: 'For A only.' }, admin.cookie);

    // b asking for a's task sees their own (absent) review state.
    const summary = body<TaskReviewSummary>(await api.get(reviewUrl(TASK.html1Main), b.cookie));
    expect(summary).toEqual({ reviewStatus: null, submissionCount: 0, latestReview: null });

    expectError(await api.get(`/api/admin/trainees/${a.id}/feedback`, b.cookie), 403, 'FORBIDDEN');
    expectError(await api.get(historyUrl(a.id, TASK.html1Main), b.cookie), 403, 'FORBIDDEN');
  });

  it('an unknown trainee or task id is a 404 or a validation error', async () => {
    await submit(TASK.html1Main);
    expectError(
      await api.post(
        approveUrl('00000000-0000-0000-0000-000000000000', TASK.html1Main),
        {},
        admin.cookie
      ),
      404,
      'NOT_FOUND'
    );
    expectError(
      await api.post(approveUrl(a.id, 'html-day-01-t-99'), {}, admin.cookie),
      404,
      'NOT_FOUND'
    );
    expectError(
      await api.post(reworkUrl('not-a-uuid', TASK.html1Main), { feedback: 'x' }, admin.cookie),
      400,
      'VALIDATION_FAILED'
    );
  });
});

describe('review state in existing payloads', () => {
  it('GET /api/tasks/:taskId includes the review status and attempt count', async () => {
    await submit(TASK.html1Main);
    const task = body<TaskResponse>(await api.get(`/api/tasks/${TASK.html1Main}`, a.cookie));
    expect(task.reviewStatus).toBe('pending');
    expect(task.submissionCount).toBe(1);
  });

  it('GET /api/days/:dayId/tasks includes the review status of completed tasks', async () => {
    await submit(TASK.html1Main);
    await api.post(reworkUrl(a.id, TASK.html1Main), { feedback: 'Rework please.' }, admin.cookie);

    const tasks = body<{ id: string; reviewStatus?: string | null }[]>(
      await api.get(`/api/days/${DAY.html1}/tasks`, a.cookie)
    );
    const main = tasks.find((task) => task.id === TASK.html1Main);
    expect(main?.reviewStatus).toBe('rework');
  });
});
