import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmitTaskResponse } from '@itp/types';
import { db } from './helpers/db';
import {
  assignTrainees,
  createAdmin,
  freshTrainees,
  seedCurriculum,
  TASK,
  type TestAdmin,
  type TestTrainee,
} from './helpers/fixtures';
import { api, body } from './helpers/http';
import { SlackNotificationRepository } from '../../module/slack-module/slack-notification.repository';

vi.mock('../../config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/env')>();
  return {
    ...actual,
    env: { ...actual.env, SLACK_ENABLED: true },
  };
});

let trainee: TestTrainee;
let mentor: TestAdmin;
let otherMentor: TestAdmin;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a: trainee } = await freshTrainees());
  mentor = await createAdmin('Slack Mentor');
  otherMentor = await createAdmin('Other Slack Mentor');
  await db.admin.updateMany({
    where: { id: { in: [mentor.id, otherMentor.id] } },
    data: { slack_channel_id: null },
  });
  await assignTrainees(mentor, trainee);
});

const submitUrl = `/api/tasks/${TASK.html1Main}/submit`;
const slackUrl = '/api/admin/slack-channel';

async function configureChannel(channelId: string, cookie = mentor.cookie) {
  const res = await api.put(slackUrl, { channelId }, cookie);
  expect(res.status).toBe(200);
}

async function outboxFor(count: number) {
  return db.slack_notification_outbox.findUnique({
    where: { dedupe_key: `task_submission:${trainee.id}:${TASK.html1Main}:${count}` },
  });
}

describe('Slack task notification queueing', () => {
  it('queues the assigned mentor channel on submission with full notification context', async () => {
    await configureChannel('C0123ABCDEF');

    const res = await api.post(submitUrl, undefined, trainee.cookie);
    expect(res.status).toBe(200);
    const submission = body<SubmitTaskResponse>(res);

    const row = await outboxFor(submission.submissionCount);
    expect(row).not.toBeNull();
    expect(row!.channel_id).toBe('C0123ABCDEF');
    expect(row!.status).toBe('PENDING');
    expect(row!.event_type).toBe('task.submission');
    const payload = row!.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      traineeName: trainee.name,
      dayNumber: 1,
      submissionCount: 1,
      reviewStatus: 'pending',
      submittedAt: submission.submittedAt,
    });
    expect(typeof payload.taskTitle).toBe('string');
    expect(typeof payload.courseTitle).toBe('string');
  });

  it('queues a new notification with the correct submission count for resubmission', async () => {
    await configureChannel('C0123ABCDEF');

    const first = body<SubmitTaskResponse>(await api.post(submitUrl, undefined, trainee.cookie));
    const second = body<SubmitTaskResponse>(await api.post(submitUrl, undefined, trainee.cookie));

    expect(first.submissionCount).toBe(1);
    expect(second.submissionCount).toBe(2);
    expect((await outboxFor(1))?.payload).toMatchObject({ submissionCount: 1 });
    expect((await outboxFor(2))?.payload).toMatchObject({ submissionCount: 2 });
  });

  it('does not queue notifications when the assigned mentor has no channel', async () => {
    const res = await api.post(submitUrl, undefined, trainee.cookie);
    expect(res.status).toBe(200);

    expect(await db.slack_notification_outbox.count()).toBe(0);
  });

  it('uses the mentor assigned at submission time after assignment changes', async () => {
    await configureChannel('C0123ABCDEF', mentor.cookie);
    await configureChannel('C9999UPDATED', otherMentor.cookie);
    await db.trainee.update({ where: { id: trainee.id }, data: { mentor_id: otherMentor.id } });

    const res = await api.post(submitUrl, undefined, trainee.cookie);
    expect(res.status).toBe(200);
    const submission = body<SubmitTaskResponse>(res);

    const row = await outboxFor(submission.submissionCount);
    expect(row?.channel_id).toBe('C9999UPDATED');
  });

  it('keeps queued channel IDs after configuration changes and skips future submissions after delete', async () => {
    await configureChannel('C0123ABCDEF');
    const first = body<SubmitTaskResponse>(await api.post(submitUrl, undefined, trainee.cookie));

    await configureChannel('C9999UPDATED');
    const second = body<SubmitTaskResponse>(await api.post(submitUrl, undefined, trainee.cookie));

    expect((await outboxFor(first.submissionCount))?.channel_id).toBe('C0123ABCDEF');
    expect((await outboxFor(second.submissionCount))?.channel_id).toBe('C9999UPDATED');

    await api.delete(slackUrl, mentor.cookie);
    await api.post(submitUrl, undefined, trainee.cookie);

    expect(await db.slack_notification_outbox.count()).toBe(2);
    expect((await outboxFor(first.submissionCount))?.channel_id).toBe('C0123ABCDEF');
  });
});

describe('Slack notification outbox repository', () => {
  const repo = new SlackNotificationRepository();

  function payload(count: number) {
    return {
      traineeName: 'Asha',
      taskTitle: 'Profile page',
      courseTitle: 'HTML & CSS',
      dayNumber: 1,
      submissionCount: count,
      submittedAt: '2026-11-23T10:00:00.000Z',
      reviewStatus: 'pending',
    };
  }

  it('atomically claims different rows without duplicate processing', async () => {
    await db.slack_notification_outbox.createMany({
      data: [
        {
          event_type: 'task.submission',
          channel_id: 'C1',
          payload: payload(1),
          dedupe_key: 'test-claim-1',
        },
        {
          event_type: 'task.submission',
          channel_id: 'C2',
          payload: payload(2),
          dedupe_key: 'test-claim-2',
        },
      ],
    });

    const [first, second] = await Promise.all([
      repo.claimPendingBatch(1, 60_000),
      repo.claimPendingBatch(1, 60_000),
    ]);

    const ids = [...first, ...second].map((row) => row.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('recovers expired processing records after restart', async () => {
    await db.slack_notification_outbox.create({
      data: {
        event_type: 'task.submission',
        channel_id: 'C1',
        payload: payload(1),
        dedupe_key: 'test-expired',
        status: 'PROCESSING',
        processing_started_at: new Date(Date.now() - 120_000),
        attempt_count: 1,
      },
    });

    const recovered = await repo.recoverExpiredProcessing(60_000);
    expect(recovered).toBe(1);

    const row = await db.slack_notification_outbox.findUnique({
      where: { dedupe_key: 'test-expired' },
    });
    expect(row?.status).toBe('PENDING');
    expect(row?.processing_started_at).toBeNull();
  });

  it('updates retry and sent states', async () => {
    const created = await db.slack_notification_outbox.create({
      data: {
        event_type: 'task.submission',
        channel_id: 'C1',
        payload: payload(1),
        dedupe_key: 'test-states',
      },
    });

    await repo.markRetry(created.id, new Date(Date.now() + 60_000), 'ratelimited');
    const retried = await db.slack_notification_outbox.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(retried.status).toBe('PENDING');
    expect(retried.last_error).toBe('ratelimited');

    await repo.markSent(created.id);
    const sent = await db.slack_notification_outbox.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(sent.status).toBe('SENT');
    expect(sent.sent_at).not.toBeNull();
    expect(sent.last_error).toBeNull();
  });
});
