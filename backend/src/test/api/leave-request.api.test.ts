import { beforeEach, describe, expect, it } from 'vitest';
import type { LeaveRequest } from '@itp/types';
import { db } from './helpers/db';
import {
  assignTrainees,
  createAdmin,
  createManager,
  freshTrainees,
  type TestAdmin,
  type TestTrainee,
} from './helpers/fixtures';
import { api, body, expectError, expectIsoDateTime } from './helpers/http';

let traineeA: TestTrainee;
let traineeB: TestTrainee;
let mentor: TestAdmin;
let otherMentor: TestAdmin;
let manager: TestAdmin;

beforeEach(async () => {
  ({ a: traineeA, b: traineeB } = await freshTrainees());
  mentor = await createAdmin('Leave Mentor');
  otherMentor = await createAdmin('Other Leave Mentor');
  manager = await createManager('Leave Manager');
  await assignTrainees(mentor, traineeA);
  await assignTrainees(otherMentor, traineeB);
});

const createUrl = '/api/leave-requests';
const traineeDetailUrl = (id: string) => `/api/leave-requests/${id}`;
const adminListUrl = '/api/admin/leave-requests';
const managerListUrl = '/api/manager/leave-requests';
const adminReviewUrl = (id: string) => `${adminListUrl}/${id}/review`;
const managerReviewUrl = (id: string) => `${managerListUrl}/${id}/review`;

async function createAs(trainee: TestTrainee, subject = 'Medical appointment') {
  const res = await api.post(
    createUrl,
    { subject, reason: 'A hospital appointment during lab hours.' },
    trainee.cookie
  );
  expect(res.status).toBe(201);
  return body<LeaveRequest>(res);
}

describe('leave request authorization', () => {
  it('rejects unauthenticated access to every leave endpoint', async () => {
    expectError(await api.get(createUrl), 401, 'UNAUTHENTICATED');
    expectError(await api.post(createUrl, { subject: 'x', reason: 'y' }), 401, 'UNAUTHENTICATED');
    expectError(await api.get(adminListUrl), 401, 'UNAUTHENTICATED');
    expectError(await api.get(managerListUrl), 401, 'UNAUTHENTICATED');
  });

  it('keeps staff out of trainee routes and trainees out of staff routes', async () => {
    const request = await createAs(traineeA);

    expectError(await api.get(createUrl, mentor.cookie), 403, 'FORBIDDEN');
    expectError(await api.get(createUrl, manager.cookie), 403, 'FORBIDDEN');
    expectError(await api.get(traineeDetailUrl(request.id), mentor.cookie), 403, 'FORBIDDEN');
    expectError(await api.get(adminListUrl, traineeA.cookie), 403, 'FORBIDDEN');
    expectError(await api.get(managerListUrl, traineeA.cookie), 403, 'FORBIDDEN');
    expectError(
      await api.patch(adminReviewUrl(request.id), { decision: 'APPROVED' }, traineeA.cookie),
      403,
      'FORBIDDEN'
    );
  });

  it('does not let a manager use the mentor route or a mentor use the manager route', async () => {
    expectError(await api.get(adminListUrl, manager.cookie), 403, 'FORBIDDEN');
    expectError(await api.get(managerListUrl, mentor.cookie), 403, 'FORBIDDEN');
  });
});

describe('trainee leave requests', () => {
  it('creates a request for the signed-in trainee only', async () => {
    const request = await createAs(traineeA);

    expect(request).toMatchObject({
      traineeId: traineeA.id,
      traineeName: traineeA.name,
      subject: 'Medical appointment',
      reason: 'A hospital appointment during lab hours.',
      status: 'PENDING',
      reviewerId: null,
      reviewerName: null,
      reviewerRole: null,
      feedback: null,
      reviewedAt: null,
    });
    expectIsoDateTime(request.submittedAt);

    const row = await db.leave_request.findUniqueOrThrow({ where: { id: request.id } });
    expect(row.trainee_id).toBe(traineeA.id);
    expect(row.status).toBe('PENDING');
    expect(row.reviewer_id).toBeNull();
  });

  it('trims text and validates required fields and length limits', async () => {
    const res = await api.post(
      createUrl,
      { subject: '  Conference  ', reason: '  Offsite training.  ' },
      traineeA.cookie
    );
    expect(body<LeaveRequest>(res)).toMatchObject({
      subject: 'Conference',
      reason: 'Offsite training.',
    });

    expectError(
      await api.post(createUrl, { subject: '', reason: 'x' }, traineeA.cookie),
      400,
      'VALIDATION_FAILED'
    );
    expectError(
      await api.post(createUrl, { subject: 'x', reason: '   ' }, traineeA.cookie),
      400,
      'VALIDATION_FAILED'
    );
    expectError(
      await api.post(createUrl, { subject: 'x'.repeat(201), reason: 'x' }, traineeA.cookie),
      400,
      'VALIDATION_FAILED'
    );
  });

  it('lists and opens only the authenticated trainee requests', async () => {
    const mine = await createAs(traineeA);
    const theirs = await createAs(traineeB, 'Another trainee request');

    const list = body<LeaveRequest[]>(await api.get(createUrl, traineeA.cookie));
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(mine.id);

    expect((await api.get(traineeDetailUrl(mine.id), traineeA.cookie)).status).toBe(200);
    expectError(await api.get(traineeDetailUrl(theirs.id), traineeA.cookie), 404, 'NOT_FOUND');
  });
});

describe('mentor leave review', () => {
  it('sees only requests from assigned trainees', async () => {
    const mine = await createAs(traineeA);
    const theirs = await createAs(traineeB, 'Unassigned trainee request');

    const list = body<LeaveRequest[]>(await api.get(adminListUrl, mentor.cookie));
    expect(list.map((request) => request.id)).toEqual([mine.id]);
    expect(list[0]?.assignedMentor).toEqual({ id: mentor.id, name: mentor.name });
    expectError(
      await api.get(`/api/admin/leave-requests/${theirs.id}`, mentor.cookie),
      404,
      'NOT_FOUND'
    );
    expectError(
      await api.patch(adminReviewUrl(theirs.id), { decision: 'APPROVED' }, mentor.cookie),
      404,
      'NOT_FOUND'
    );
  });

  it('approves a pending request and the trainee sees the recorded decision', async () => {
    const request = await createAs(traineeA);
    const res = await api.patch(
      adminReviewUrl(request.id),
      { decision: 'APPROVED', feedback: 'Enjoy the time off.' },
      mentor.cookie
    );
    expect(res.status).toBe(200);
    const reviewed = body<LeaveRequest>(res);
    expect(reviewed).toMatchObject({
      status: 'APPROVED',
      reviewerId: mentor.id,
      reviewerName: mentor.name,
      reviewerRole: 'MENTOR',
      feedback: 'Enjoy the time off.',
    });
    expectIsoDateTime(reviewed.reviewedAt);

    const traineeView = body<LeaveRequest>(
      await api.get(traineeDetailUrl(request.id), traineeA.cookie)
    );
    expect(traineeView.status).toBe('APPROVED');
    expect(traineeView.reviewerRole).toBe('MENTOR');
    expect(traineeView.feedback).toBe('Enjoy the time off.');

    const row = await db.leave_request.findUniqueOrThrow({ where: { id: request.id } });
    expect(row.reviewer_id).toBe(mentor.id);
    expect(row.reviewer_role).toBe('MENTOR');
    expect(row.reviewed_at).not.toBeNull();
  });

  it('requires feedback to reject and stores it', async () => {
    const request = await createAs(traineeA);

    expectError(
      await api.patch(
        adminReviewUrl(request.id),
        { decision: 'REJECTED', feedback: '  ' },
        mentor.cookie
      ),
      400,
      'VALIDATION_FAILED'
    );
    expect((await db.leave_request.findUniqueOrThrow({ where: { id: request.id } })).status).toBe(
      'PENDING'
    );

    const res = await api.patch(
      adminReviewUrl(request.id),
      { decision: 'REJECTED', feedback: 'Please choose another date.' },
      mentor.cookie
    );
    expect(body<LeaveRequest>(res)).toMatchObject({
      status: 'REJECTED',
      feedback: 'Please choose another date.',
      reviewerId: mentor.id,
    });
  });

  it('cannot change an already reviewed request', async () => {
    const request = await createAs(traineeA);
    expect(
      (await api.patch(adminReviewUrl(request.id), { decision: 'APPROVED' }, mentor.cookie)).status
    ).toBe(200);

    expectError(
      await api.patch(
        adminReviewUrl(request.id),
        { decision: 'REJECTED', feedback: 'no' },
        mentor.cookie
      ),
      409,
      'ALREADY_REVIEWED'
    );
    expect(await db.leave_request.count({ where: { id: request.id } })).toBe(1);
  });
});

describe('manager leave review', () => {
  it('sees every request with its assigned Mentor', async () => {
    await createAs(traineeA);
    await createAs(traineeB, 'Unassigned trainee request');

    const list = body<LeaveRequest[]>(await api.get(managerListUrl, manager.cookie));
    expect(list).toHaveLength(2);
    expect(list.map((request) => request.assignedMentor?.id).sort()).toEqual(
      [mentor.id, otherMentor.id].sort()
    );
  });

  it('reviews a request regardless of the trainee mentor assignment', async () => {
    const request = await createAs(traineeB, 'Unassigned trainee request');

    const res = await api.patch(
      managerReviewUrl(request.id),
      { decision: 'REJECTED', feedback: 'Reschedule after the release.' },
      manager.cookie
    );
    expect(res.status).toBe(200);
    expect(body<LeaveRequest>(res)).toMatchObject({
      status: 'REJECTED',
      reviewerId: manager.id,
      reviewerName: manager.name,
      reviewerRole: 'MANAGER',
      feedback: 'Reschedule after the release.',
    });

    const detail = body<LeaveRequest>(
      await api.get(`/api/manager/leave-requests/${request.id}`, manager.cookie)
    );
    expect(detail.assignedMentor?.id).toBe(otherMentor.id);
  });
});

describe('leave review conflicts', () => {
  it('allows only one of two simultaneous mentor and manager decisions', async () => {
    const request = await createAs(traineeA);

    const results = await Promise.allSettled([
      api.patch(adminReviewUrl(request.id), { decision: 'APPROVED' }, mentor.cookie),
      api.patch(
        managerReviewUrl(request.id),
        { decision: 'REJECTED', feedback: 'Conflict test rejection.' },
        manager.cookie
      ),
    ]);

    const successes = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof api.patch>>> =>
        result.status === 'fulfilled' && result.value.status === 200
    );
    const conflicts = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof api.patch>>> =>
        result.status === 'fulfilled' && result.value.status === 409
    );
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expectError(conflicts[0]?.value, 409, 'ALREADY_REVIEWED');

    const row = await db.leave_request.findUniqueOrThrow({ where: { id: request.id } });
    expect(['APPROVED', 'REJECTED']).toContain(row.status);
    expect([mentor.id, manager.id]).toContain(row.reviewer_id);
    expect(row.reviewed_at).not.toBeNull();
  });

  it('preserves the first decision when the other role tries again', async () => {
    const request = await createAs(traineeA);
    const first = body<LeaveRequest>(
      await api.patch(adminReviewUrl(request.id), { decision: 'APPROVED' }, mentor.cookie)
    );

    expectError(
      await api.patch(
        managerReviewUrl(request.id),
        { decision: 'REJECTED', feedback: 'Too late.' },
        manager.cookie
      ),
      409,
      'ALREADY_REVIEWED'
    );

    const row = await db.leave_request.findUniqueOrThrow({ where: { id: request.id } });
    expect(row.status).toBe('APPROVED');
    expect(row.reviewer_id).toBe(first.reviewerId);
    expect(row.reviewer_role).toBe('MENTOR');
  });
});
