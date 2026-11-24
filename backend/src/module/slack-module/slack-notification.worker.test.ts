import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SlackNotificationWorker } from './slack-notification.worker';
import type { SlackOutboxRow } from './slack-notification.repository';

const envMock = vi.hoisted(() => ({ SLACK_ENABLED: true }));
const slackMock = vi.hoisted(() => {
  class SlackApiError extends Error {
    readonly status: number;
    readonly slackError?: string;
    readonly retryAfterSeconds?: number;

    constructor(
      message: string,
      opts: { status: number; slackError?: string; retryAfterSeconds?: number }
    ) {
      super(message);
      this.name = 'SlackApiError';
      this.status = opts.status;
      this.slackError = opts.slackError;
      this.retryAfterSeconds = opts.retryAfterSeconds;
    }
  }
  return { SlackApiError, postSlackMessage: vi.fn() };
});
const repoMock = vi.hoisted(() => ({
  claimPendingBatch: vi.fn(),
  markSent: vi.fn(),
  markRetry: vi.fn(),
  markFailed: vi.fn(),
  recoverExpiredProcessing: vi.fn(),
}));

vi.mock('../../config/env', () => ({ env: envMock }));
vi.mock('../../lib/slack', () => ({
  postSlackMessage: slackMock.postSlackMessage,
  SlackApiError: slackMock.SlackApiError,
}));
vi.mock('./slack-notification.repository', () => ({
  SlackNotificationRepository: class {
    claimPendingBatch = repoMock.claimPendingBatch;
    markSent = repoMock.markSent;
    markRetry = repoMock.markRetry;
    markFailed = repoMock.markFailed;
    recoverExpiredProcessing = repoMock.recoverExpiredProcessing;
  },
}));

function row(overrides: Partial<SlackOutboxRow> = {}): SlackOutboxRow {
  return {
    id: 'notification-1',
    event_type: 'task.submission',
    channel_id: 'C0123ABCDEF',
    payload: {
      traineeName: 'Asha',
      taskTitle: 'Profile page',
      courseTitle: 'HTML & CSS',
      dayNumber: 1,
      submissionCount: 2,
      submittedAt: '2026-11-23T10:00:00.000Z',
      reviewStatus: 'pending',
    },
    status: 'PROCESSING',
    attempt_count: 1,
    max_attempts: 5,
    next_retry_at: new Date(),
    processing_started_at: new Date(),
    sent_at: null,
    last_error: null,
    dedupe_key: 'task_submission:trainee:task:2',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function leaveRow(overrides: Partial<SlackOutboxRow> = {}): SlackOutboxRow {
  return row({
    event_type: 'leave.request',
    payload: { traineeName: 'John Doe', subject: 'Personal Leave' },
    dedupe_key: 'leave_request:request-1',
    ...overrides,
  });
}

describe('SlackNotificationWorker', () => {
  let worker: SlackNotificationWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    envMock.SLACK_ENABLED = true;
    repoMock.recoverExpiredProcessing.mockResolvedValue(0);
    slackMock.postSlackMessage.mockResolvedValue({
      ok: true,
      ts: '123.456',
      channel: 'C0123ABCDEF',
    });
    worker = new SlackNotificationWorker();
  });

  it('marks a successfully delivered notification SENT', async () => {
    await worker.processRow(row());

    expect(slackMock.postSlackMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'C0123ABCDEF' })
    );
    const sentMessage = slackMock.postSlackMessage.mock.calls[0][0] as {
      text: string;
      blocks: unknown[];
    };
    expect(sentMessage.text).toContain('Asha');
    expect(sentMessage.text).toContain('Profile page');
    expect(JSON.stringify(sentMessage.blocks)).toContain('*Submission:*');
    expect(repoMock.markSent).toHaveBeenCalledWith('notification-1');
    expect(repoMock.markRetry).not.toHaveBeenCalled();
    expect(repoMock.markFailed).not.toHaveBeenCalled();
  });

  it('sends only the trainee name and subject for a leave request', async () => {
    await worker.processRow(leaveRow());

    expect(slackMock.postSlackMessage).toHaveBeenCalledTimes(1);
    expect(slackMock.postSlackMessage).toHaveBeenCalledWith({
      channel: 'C0123ABCDEF',
      text:
        ':calendar: *Leave Request*\n\n*John Doe* has requested a leave.\n\n' +
        '*Subject:* Personal Leave',
    });
    expect(repoMock.markSent).toHaveBeenCalledWith('notification-1');
    expect(repoMock.markRetry).not.toHaveBeenCalled();
    expect(repoMock.markFailed).not.toHaveBeenCalled();
  });

  it('uses the shared retry path for rate-limited leave notifications', async () => {
    slackMock.postSlackMessage.mockRejectedValue(
      new slackMock.SlackApiError('ratelimited', {
        status: 429,
        slackError: 'ratelimited',
        retryAfterSeconds: 30,
      })
    );

    await worker.processRow(leaveRow({ attempt_count: 2 }));

    expect(repoMock.markRetry).toHaveBeenCalledWith(
      'notification-1',
      expect.any(Date),
      'ratelimited'
    );
    const nextRetryAt = repoMock.markRetry.mock.calls[0][1] as Date;
    expect(nextRetryAt.getTime()).toBeGreaterThan(Date.now() + 25_000);
    expect(repoMock.markFailed).not.toHaveBeenCalled();
  });

  it('permanently fails an invalid-auth leave notification without retry', async () => {
    slackMock.postSlackMessage.mockRejectedValue(
      new slackMock.SlackApiError('invalid_auth', { status: 200, slackError: 'invalid_auth' })
    );

    await worker.processRow(leaveRow());

    expect(repoMock.markFailed).toHaveBeenCalledWith('notification-1', 'invalid_auth');
    expect(repoMock.markRetry).not.toHaveBeenCalled();
  });

  it('schedules a retry for rate-limited delivery using Retry-After', async () => {
    slackMock.postSlackMessage.mockRejectedValue(
      new slackMock.SlackApiError('ratelimited', {
        status: 429,
        slackError: 'ratelimited',
        retryAfterSeconds: 30,
      })
    );

    await worker.processRow(row());

    expect(repoMock.markRetry).toHaveBeenCalledWith(
      'notification-1',
      expect.any(Date),
      'ratelimited'
    );
    const nextRetryAt = repoMock.markRetry.mock.calls[0][1] as Date;
    expect(nextRetryAt.getTime()).toBeGreaterThan(Date.now() + 25_000);
    expect(repoMock.markFailed).not.toHaveBeenCalled();
  });

  it('retries network errors with exponential backoff', async () => {
    slackMock.postSlackMessage.mockRejectedValue(new Error('network down'));

    await worker.processRow(row({ attempt_count: 2 }));

    expect(repoMock.markRetry).toHaveBeenCalledWith(
      'notification-1',
      expect.any(Date),
      'network down'
    );
    const nextRetryAt = repoMock.markRetry.mock.calls[0][1] as Date;
    expect(nextRetryAt.getTime()).toBeGreaterThan(Date.now() + 25_000);
  });

  it('permanently fails invalid auth without retry', async () => {
    slackMock.postSlackMessage.mockRejectedValue(
      new slackMock.SlackApiError('invalid_auth', { status: 200, slackError: 'invalid_auth' })
    );

    await worker.processRow(row());

    expect(repoMock.markFailed).toHaveBeenCalledWith('notification-1', 'invalid_auth');
    expect(repoMock.markRetry).not.toHaveBeenCalled();
  });

  it('stops retrying after max attempts', async () => {
    slackMock.postSlackMessage.mockRejectedValue(new Error('network down'));

    await worker.processRow(row({ attempt_count: 5, max_attempts: 5 }));

    expect(repoMock.markFailed).toHaveBeenCalledWith('notification-1', 'network down');
    expect(repoMock.markRetry).not.toHaveBeenCalled();
  });

  it('does not start or process when Slack is disabled', async () => {
    envMock.SLACK_ENABLED = false;
    repoMock.claimPendingBatch.mockResolvedValue([]);

    worker.start();
    await worker.stop();

    expect(repoMock.recoverExpiredProcessing).not.toHaveBeenCalled();
    expect(repoMock.claimPendingBatch).not.toHaveBeenCalled();
  });

  it('recovers expired processing records and processes claimed rows', async () => {
    repoMock.recoverExpiredProcessing.mockResolvedValue(3);
    repoMock.claimPendingBatch.mockResolvedValue([row()]);

    worker.start();
    await new Promise((resolve) => setImmediate(resolve));
    await worker.stop();

    expect(repoMock.recoverExpiredProcessing).toHaveBeenCalled();
    expect(repoMock.claimPendingBatch).toHaveBeenCalled();
    expect(repoMock.markSent).toHaveBeenCalledWith('notification-1');
  });
});
