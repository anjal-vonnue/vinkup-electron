import { env } from '../../config/env';
import { postSlackMessage, SlackApiError } from '../../lib/slack';
import {
  SlackNotificationRepository,
  type LeaveRequestSlackPayload,
  type SlackOutboxRow,
  type TaskSubmissionSlackPayload,
} from './slack-notification.repository';

const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 10;
const LEASE_MS = 60_000;
const BASE_RETRY_MS = 15_000;
const MAX_RETRY_MS = 5 * 60_000;

function escapeSlackText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/@(here|channel|everyone)\b/gi, '@\u200b$1');
}

type FormattedSlackMessage = {
  text: string;
  blocks?: unknown[];
};

function asTaskSubmissionPayload(payload: unknown): TaskSubmissionSlackPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (
    typeof p.traineeName !== 'string' ||
    typeof p.taskTitle !== 'string' ||
    typeof p.courseTitle !== 'string' ||
    typeof p.submissionCount !== 'number' ||
    typeof p.submittedAt !== 'string' ||
    typeof p.reviewStatus !== 'string'
  ) {
    return null;
  }
  const dayNumber = typeof p.dayNumber === 'number' ? p.dayNumber : null;
  return {
    traineeName: p.traineeName,
    taskTitle: p.taskTitle,
    courseTitle: p.courseTitle,
    dayNumber,
    submissionCount: p.submissionCount,
    submittedAt: p.submittedAt,
    reviewStatus: p.reviewStatus,
  };
}

function asLeaveRequestPayload(payload: unknown): LeaveRequestSlackPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.traineeName !== 'string' || typeof p.subject !== 'string') {
    return null;
  }
  return { traineeName: p.traineeName, subject: p.subject };
}

function formatSubmissionMessage(payload: TaskSubmissionSlackPayload): FormattedSlackMessage {
  const trainee = escapeSlackText(payload.traineeName || 'Unknown trainee');
  const task = escapeSlackText(payload.taskTitle || 'Unknown task');
  const course = escapeSlackText(payload.courseTitle || 'Unknown course');
  const day = payload.dayNumber == null ? 'N/A' : String(payload.dayNumber);
  const submittedAt = escapeSlackText(payload.submittedAt);
  const status = escapeSlackText(payload.reviewStatus || 'pending');
  const submission = `#${payload.submissionCount}`;

  const text = `New Task Submission: ${payload.traineeName} submitted ${payload.taskTitle} (${submission})`;

  return {
    text,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'New Task Submission', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Trainee:*\n${trainee}` },
          { type: 'mrkdwn', text: `*Task:*\n${task}` },
          { type: 'mrkdwn', text: `*Course:*\n${course}` },
          { type: 'mrkdwn', text: `*Day:*\n${escapeSlackText(day)}` },
          { type: 'mrkdwn', text: `*Submission:*\n${escapeSlackText(submission)}` },
          { type: 'mrkdwn', text: `*Status:*\n${status}` },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `*Submitted:* ${submittedAt}` }],
      },
    ],
  };
}

function formatLeaveRequestMessage(payload: LeaveRequestSlackPayload): FormattedSlackMessage {
  const trainee = escapeSlackText(payload.traineeName);
  const subject = escapeSlackText(payload.subject);

  return {
    text:
      `:calendar: *Leave Request*\n\n*${trainee}* has requested a leave.\n\n` +
      `*Subject:* ${subject}`,
  };
}

function formatMessageForRow(row: SlackOutboxRow): FormattedSlackMessage | null {
  switch (row.event_type) {
    case 'task.submission': {
      const payload = asTaskSubmissionPayload(row.payload);
      return payload ? formatSubmissionMessage(payload) : null;
    }
    case 'leave.request': {
      const payload = asLeaveRequestPayload(row.payload);
      return payload ? formatLeaveRequestMessage(payload) : null;
    }
    default:
      return null;
  }
}

function computeRetryDelayMs(attemptCount: number, retryAfterSeconds?: number): number {
  if (typeof retryAfterSeconds === 'number' && retryAfterSeconds >= 0) {
    return Math.max(retryAfterSeconds * 1000, BASE_RETRY_MS);
  }
  const exp = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** Math.max(0, attemptCount - 1));
  const jitter = Math.floor(Math.random() * 1000);
  return exp + jitter;
}

function isRetryable(error: unknown): {
  retryable: boolean;
  retryAfterSeconds?: number;
  message: string;
} {
  if (error instanceof SlackApiError) {
    const permanent = new Set([
      'invalid_auth',
      'account_inactive',
      'token_revoked',
      'token_expired',
      'missing_scope',
      'channel_not_found',
      'is_archived',
      'invalid_channel',
      'parameter_validation_failed',
    ]);
    if (error.slackError && permanent.has(error.slackError)) {
      return {
        retryable: false,
        retryAfterSeconds: error.retryAfterSeconds,
        message: error.message,
      };
    }
    if (error.status === 429 || error.status >= 500 || error.slackError === 'ratelimited') {
      return {
        retryable: true,
        retryAfterSeconds: error.retryAfterSeconds,
        message: error.message,
      };
    }
    // Other Slack errors: retry up to max attempts; they may be transient or fixable.
    return { retryable: true, retryAfterSeconds: error.retryAfterSeconds, message: error.message };
  }
  if (error instanceof Error) {
    return { retryable: true, message: error.message };
  }
  return { retryable: true, message: 'Unknown Slack delivery error' };
}

export class SlackNotificationWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inFlight: Promise<void> | null = null;

  constructor(private readonly repo = new SlackNotificationRepository()) {}

  start(): void {
    if (this.timer) return;
    if (!env.SLACK_ENABLED) {
      console.info('[slack-worker] SLACK_ENABLED=false; worker not started');
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
    // Don't block startup; recover and kick off first tick.
    void this.recoverAndTick();
    console.info('[slack-worker] started');
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.inFlight) {
      await this.inFlight;
    }
    console.info('[slack-worker] stopped');
  }

  private async recoverAndTick(): Promise<void> {
    try {
      const recovered = await this.repo.recoverExpiredProcessing(LEASE_MS);
      if (recovered > 0)
        console.info(`[slack-worker] recovered ${recovered} expired notifications`);
    } catch (error) {
      console.error('[slack-worker] recovery failed', error);
    }
    await this.tick();
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    if (!env.SLACK_ENABLED) return;
    this.running = true;
    this.inFlight = (async () => {
      try {
        const batch = await this.repo.claimPendingBatch(BATCH_SIZE, LEASE_MS);
        for (const row of batch) {
          await this.processRow(row);
        }
      } catch (error) {
        console.error('[slack-worker] tick failed', error);
      } finally {
        this.running = false;
        this.inFlight = null;
      }
    })();
    await this.inFlight;
  }

  async processRow(row: SlackOutboxRow): Promise<void> {
    const message = formatMessageForRow(row);
    if (!message) {
      await this.repo.markFailed(row.id, 'Invalid notification payload');
      return;
    }

    try {
      await postSlackMessage({
        channel: row.channel_id,
        text: message.text,
        ...(message.blocks ? { blocks: message.blocks } : {}),
      });
      await this.repo.markSent(row.id);
    } catch (error) {
      const verdict = isRetryable(error);
      const attemptCount = row.attempt_count; // already incremented by claim
      const canRetry = verdict.retryable && attemptCount < row.max_attempts;
      const logContext = {
        id: row.id,
        channelId: row.channel_id,
        attemptCount,
        maxAttempts: row.max_attempts,
        slackError: error instanceof SlackApiError ? error.slackError : undefined,
      };

      if (canRetry) {
        const delayMs = computeRetryDelayMs(attemptCount, verdict.retryAfterSeconds);
        const nextRetryAt = new Date(Date.now() + delayMs);
        await this.repo.markRetry(row.id, nextRetryAt, verdict.message);
        console.warn('[slack-worker] delivery failed; will retry', { ...logContext, nextRetryAt });
        return;
      }

      await this.repo.markFailed(row.id, verdict.message);
      console.error('[slack-worker] delivery failed permanently', logContext);
    }
  }
}

export const slackNotificationWorker = new SlackNotificationWorker();
