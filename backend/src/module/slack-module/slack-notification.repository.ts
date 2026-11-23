import { Prisma, slack_notification_status } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';

export type SlackNotificationPayload = {
  traineeName: string;
  taskTitle: string;
  courseTitle: string;
  dayNumber: number | null;
  submissionCount: number;
  submittedAt: string;
  reviewStatus: string;
};

export type CreateSlackNotificationInput = {
  eventType: string;
  channelId: string;
  payload: SlackNotificationPayload;
  dedupeKey: string;
  maxAttempts?: number;
};

export type SlackOutboxRow = {
  id: string;
  event_type: string;
  channel_id: string;
  payload: Prisma.JsonValue;
  status: slack_notification_status;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: Date;
  processing_started_at: Date | null;
  sent_at: Date | null;
  last_error: string | null;
  dedupe_key: string;
  created_at: Date;
  updated_at: Date;
};

export class SlackNotificationRepository {
  createInTx = async (
    tx: Prisma.TransactionClient,
    input: CreateSlackNotificationInput
  ) => {
    return tx.slack_notification_outbox.create({
      data: {
        event_type: input.eventType,
        channel_id: input.channelId,
        payload: input.payload as Prisma.InputJsonValue,
        dedupe_key: input.dedupeKey,
        max_attempts: input.maxAttempts ?? 5,
        status: slack_notification_status.PENDING,
        next_retry_at: new Date(),
      },
    });
  };

  claimPendingBatch = async (limit: number, leaseMs: number): Promise<SlackOutboxRow[]> => {
    const now = new Date();
    const leaseCutoff = new Date(now.getTime() - leaseMs);

    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<SlackOutboxRow[]>`
        WITH candidates AS (
          SELECT id
          FROM "slack_notification_outbox"
          WHERE (
            (status = 'PENDING'::"slack_notification_status" AND next_retry_at <= ${now})
            OR
            (
              status = 'PROCESSING'::"slack_notification_status"
              AND processing_started_at IS NOT NULL
              AND processing_started_at <= ${leaseCutoff}
            )
          )
          ORDER BY next_retry_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        )
        UPDATE "slack_notification_outbox" o
        SET
          status = 'PROCESSING'::"slack_notification_status",
          processing_started_at = ${now},
          attempt_count = o.attempt_count + 1,
          updated_at = ${now}
        FROM candidates
        WHERE o.id = candidates.id
        RETURNING
          o.id,
          o.event_type,
          o.channel_id,
          o.payload,
          o.status,
          o.attempt_count,
          o.max_attempts,
          o.next_retry_at,
          o.processing_started_at,
          o.sent_at,
          o.last_error,
          o.dedupe_key,
          o.created_at,
          o.updated_at
      `;
      return rows;
    });
  };

  markSent = async (id: string) => {
    return prisma.slack_notification_outbox.update({
      where: { id },
      data: {
        status: slack_notification_status.SENT,
        sent_at: new Date(),
        processing_started_at: null,
        last_error: null,
      },
    });
  };

  markRetry = async (id: string, nextRetryAt: Date, lastError: string) => {
    return prisma.slack_notification_outbox.update({
      where: { id },
      data: {
        status: slack_notification_status.PENDING,
        next_retry_at: nextRetryAt,
        processing_started_at: null,
        last_error: lastError.slice(0, 2000),
      },
    });
  };

  markFailed = async (id: string, lastError: string) => {
    return prisma.slack_notification_outbox.update({
      where: { id },
      data: {
        status: slack_notification_status.FAILED,
        processing_started_at: null,
        last_error: lastError.slice(0, 2000),
      },
    });
  };

  recoverExpiredProcessing = async (leaseMs: number) => {
    const cutoff = new Date(Date.now() - leaseMs);
    const result = await prisma.slack_notification_outbox.updateMany({
      where: {
        status: slack_notification_status.PROCESSING,
        processing_started_at: { lte: cutoff },
      },
      data: {
        status: slack_notification_status.PENDING,
        processing_started_at: null,
        last_error: 'Processing lease expired; recovered for retry',
      },
    });
    return result.count;
  };
}
