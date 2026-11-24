import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { api, body } from './helpers/http';

vi.mock('../../config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/env')>();
  return {
    ...actual,
    env: { ...actual.env, SLACK_ENABLED: true },
  };
});

const createUrl = '/api/leave-requests';
const slackUrl = '/api/admin/slack-channel';

let trainee: TestTrainee;
let unassignedTrainee: TestTrainee;
let mentor: TestAdmin;
let otherMentor: TestAdmin;
let manager: TestAdmin;

beforeEach(async () => {
  ({ a: trainee, b: unassignedTrainee } = await freshTrainees());
  mentor = await createAdmin('Slack Leave Mentor');
  otherMentor = await createAdmin('Other Slack Leave Mentor');
  manager = await createManager('Slack Leave Manager');
  await db.admin.updateMany({
    where: { id: { in: [mentor.id, otherMentor.id] } },
    data: { slack_channel_id: null },
  });
  await assignTrainees(mentor, trainee);
});

async function configureChannel(channelId: string, cookie = mentor.cookie): Promise<void> {
  const res = await api.put(slackUrl, { channelId }, cookie);
  expect(res.status).toBe(200);
}

async function createLeave(
  traineeToUse: TestTrainee,
  subject = 'Personal Leave',
  reason = 'Private family matter on 2026-12-01 for 3 days.'
): Promise<LeaveRequest> {
  const res = await api.post(createUrl, { subject, reason }, traineeToUse.cookie);
  expect(res.status).toBe(201);
  return body<LeaveRequest>(res);
}

function outboxFor(request: LeaveRequest) {
  return db.slack_notification_outbox.findUnique({
    where: { dedupe_key: `leave_request:${request.id}` },
  });
}

describe('Slack leave request notification queueing', () => {
  it('queues only the trainee name and subject for the mentor channel on creation', async () => {
    await configureChannel('C0123ABCDEF');

    const request = await createLeave(trainee);
    const row = await outboxFor(request);

    expect(row).toMatchObject({
      event_type: 'leave.request',
      channel_id: 'C0123ABCDEF',
      status: 'PENDING',
    });
    expect(row?.payload).toEqual({
      traineeName: trainee.name,
      subject: 'Personal Leave',
    });

    const encodedPayload = JSON.stringify(row?.payload);
    for (const detail of ['Private family matter', '2026-12-01', '3 days', 'hospital']) {
      expect(encodedPayload).not.toContain(detail);
    }
  });

  it('uses the mentor assigned when the leave request is created', async () => {
    await configureChannel('C0123ABCDEF', mentor.cookie);
    await configureChannel('C9999UPDATED', otherMentor.cookie);
    await db.trainee.update({
      where: { id: trainee.id },
      data: { mentor_id: otherMentor.id },
    });

    const request = await createLeave(trainee);

    expect((await outboxFor(request))?.channel_id).toBe('C9999UPDATED');
  });

  it('does not queue notifications without a mentor or a configured channel', async () => {
    expect((await createLeave(trainee)).assignedMentor).not.toBeNull();
    expect(await db.slack_notification_outbox.count()).toBe(0);

    expect((await createLeave(unassignedTrainee)).assignedMentor).toBeNull();
    expect(await db.slack_notification_outbox.count()).toBe(0);
  });

  it('does not queue notifications when a mentor or manager reviews a request', async () => {
    await configureChannel('C0123ABCDEF');
    const approved = await createLeave(trainee, 'Approved leave');
    const rejected = await createLeave(trainee, 'Rejected leave');
    expect(await db.slack_notification_outbox.count()).toBe(2);

    expect(
      (
        await api.patch(
          `/api/admin/leave-requests/${approved.id}/review`,
          { decision: 'APPROVED' },
          mentor.cookie
        )
      ).status
    ).toBe(200);
    expect(
      (
        await api.patch(
          `/api/manager/leave-requests/${rejected.id}/review`,
          { decision: 'REJECTED', feedback: 'Please reschedule.' },
          manager.cookie
        )
      ).status
    ).toBe(200);

    expect(await db.slack_notification_outbox.count()).toBe(2);
    expect((await outboxFor(approved))?.event_type).toBe('leave.request');
    expect((await outboxFor(rejected))?.event_type).toBe('leave.request');
  });

  it('uses the leave request ID as the duplicate notification key', async () => {
    await configureChannel('C0123ABCDEF');
    const request = await createLeave(trainee);

    await expect(
      db.slack_notification_outbox.create({
        data: {
          event_type: 'leave.request',
          channel_id: 'C0123ABCDEF',
          payload: { traineeName: trainee.name, subject: request.subject },
          dedupe_key: `leave_request:${request.id}`,
        },
      })
    ).rejects.toMatchObject({ code: 'P2002' });

    expect(await db.slack_notification_outbox.count()).toBe(1);
  });
});
