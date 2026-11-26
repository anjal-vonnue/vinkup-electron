import type {
  CreateLeaveRequestInput,
  LeaveDecision,
  LeaveRequest,
  ReviewLeaveRequestInput,
} from '@itp/types';
import { env } from '../../config/env';
import { ConflictError, NotFoundError } from '../../errors/AppError';
import { realtimeBroker } from '../realtime-module/realtime.broker';
import type { RealtimeEvent } from '@itp/types';
import { SlackNotificationRepository } from '../slack-module/slack-notification.repository';
import {
  LeaveRequestRepository,
  type CreateLeaveRequestRecord,
  type LeaveReviewer,
  type LeaveRow,
} from './leave-request.repository';

const leaveRequestRepository = new LeaveRequestRepository();
const slackNotificationRepository = new SlackNotificationRepository();

function toLeaveRequest(row: LeaveRow): LeaveRequest {
  return {
    id: row.id,
    traineeId: row.trainee_id,
    traineeName: row.trainee.name,
    assignedMentor: row.trainee.mentor
      ? { id: row.trainee.mentor.id, name: row.trainee.mentor.name }
      : null,
    subject: row.subject,
    reason: row.reason,
    status: row.status,
    submittedAt: row.submitted_at.toISOString(),
    reviewerId: row.reviewer_id,
    reviewerName: row.reviewer_name,
    reviewerRole: row.reviewer_role,
    feedback: row.feedback,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    reviews: row.reviews.map((review) => ({
      id: review.id,
      reviewerId: review.reviewer_id,
      reviewerName: review.reviewer_name,
      reviewerRole: review.reviewer_role,
      decision: review.decision as LeaveDecision,
      feedback: review.feedback,
      reviewedAt: review.reviewed_at.toISOString(),
    })),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function isDuplicateNotification(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

async function queueSlackNotification(row: LeaveRow): Promise<void> {
  if (!env.SLACK_ENABLED) return;
  const channelId = row.trainee.mentor?.slack_channel_id;
  if (!channelId) return;

  try {
    await slackNotificationRepository.create({
      eventType: 'leave.request',
      channelId,
      payload: { traineeName: row.trainee.name, subject: row.subject },
      dedupeKey: `leave_request:${row.id}`,
    });
  } catch (error) {
    if (!isDuplicateNotification(error)) {
      console.error('[leave] failed to queue Slack notification', {
        leaveRequestId: row.id,
        error,
      });
    }
  }
}

/**
 * Fire-and-forget realtime publish. A badge that lags a second is fine;
 * failing the request because the SSE broker hiccupped is not.
 */
function publishBadgeUpdate(userId: string | null | undefined, event: RealtimeEvent): void {
  if (!userId) return;
  try {
    realtimeBroker.publish(userId, event);
  } catch (error) {
    console.error('[leave] failed to publish badge update', { userId, event, error });
  }
}

export class LeaveRequestService {
  // ---------- Trainee actions ----------

  create = async (traineeId: string, input: CreateLeaveRequestInput): Promise<LeaveRequest> => {
    const record: CreateLeaveRequestRecord = {
      traineeId,
      subject: input.subject.trim(),
      reason: input.reason.trim(),
    };
    const row = await leaveRequestRepository.create(record);
    await queueSlackNotification(row);

    // Mentor's pending badge ticks up.
    publishBadgeUpdate(row.trainee.mentor?.id, {
      type: 'leave.submitted',
      traineeId: row.trainee_id,
      traineeName: row.trainee.name,
      requestId: row.id,
      subject: row.subject,
    });

    return toLeaveRequest(row);
  };

  listMine = async (traineeId: string): Promise<LeaveRequest[]> => {
    const rows = await leaveRequestRepository.listForTrainee(traineeId);
    return rows.map(toLeaveRequest);
  };

  getMine = async (traineeId: string, requestId: string): Promise<LeaveRequest> => {
    const row = await leaveRequestRepository.findForTrainee(traineeId, requestId);
    if (!row) throw new NotFoundError('Leave request not found.');
    return toLeaveRequest(row);
  };

  // ---------- Shared mentor/manager actions ----------

  listForReviewer = async (reviewer: LeaveReviewer): Promise<LeaveRequest[]> => {
    const rows = await leaveRequestRepository.listForReviewer(reviewer);
    return rows.map(toLeaveRequest);
  };

  getForReviewer = async (reviewer: LeaveReviewer, requestId: string): Promise<LeaveRequest> => {
    const row = await leaveRequestRepository.findForReviewer(reviewer, requestId);
    if (!row) throw new NotFoundError('Leave request not found.');
    return toLeaveRequest(row);
  };

  /**
   * Both roles call this exact method. Its repository transaction re-checks
   * scope and status before writing, so two simultaneous decisions cannot both
   * succeed. A Manager may reject a Mentor-approved request or override a
   * Mentor rejection (approve or re-reject); every other decided request is final.
   */
  review = async (
    reviewer: LeaveReviewer,
    requestId: string,
    input: ReviewLeaveRequestInput
  ): Promise<LeaveRequest> => {
    const outcome = await leaveRequestRepository.decide({
      requestId,
      reviewer,
      decision: input.decision,
      feedback: input.feedback?.trim() || null,
    });
    if (!outcome.ok) {
      if (outcome.reason === 'not-found') throw new NotFoundError('Leave request not found.');
      throw new ConflictError(
        'ALREADY_REVIEWED',
        'This leave request was already reviewed while you were writing yours.'
      );
    }

    const event: RealtimeEvent = {
      type: 'leave.reviewed',
      traineeId: outcome.request.trainee_id,
      requestId: outcome.request.id,
      decision: outcome.request.status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
    };

    // Trainee — their Leave badge reflects "decision is ready to read".
    publishBadgeUpdate(outcome.request.trainee_id, event);

    // Reviewer — their own pending badge should drop by one.
    publishBadgeUpdate(reviewer.id, event);

    // Trainee's assigned mentor — when a manager overrides, the mentor's badge
    // should also drop. Skip if it's the same person (already covered above).
    const mentorId = outcome.request.trainee.mentor?.id;
    if (mentorId && mentorId !== reviewer.id) {
      publishBadgeUpdate(mentorId, event);
    }

    return toLeaveRequest(outcome.request);
  };

  // ---------- Header badge counts ----------

  async countDecidedSince(traineeId: string, since: Date | null): Promise<number> {
    return leaveRequestRepository.countDecidedSince(traineeId, since);
  }

  async countPendingForReviewer(reviewer: LeaveReviewer): Promise<number> {
    return leaveRequestRepository.countPendingForReviewer(reviewer);
  }
}

export const leaveRequestService = new LeaveRequestService();
