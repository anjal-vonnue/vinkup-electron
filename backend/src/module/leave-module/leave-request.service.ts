import type {
  CreateLeaveRequestInput,
  LeaveDecision,
  LeaveRequest,
  ReviewLeaveRequestInput,
} from '@itp/types';
import { env } from '../../config/env';
import { ConflictError, NotFoundError } from '../../errors/AppError';
import { realtimeBroker } from '../realtime-module/realtime.broker';
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
      // The leave_review decision_is_final CHECK excludes PENDING.
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

export class LeaveRequestService {
  // ---------- Trainee actions ----------

  create = async (traineeId: string, input: CreateLeaveRequestInput): Promise<LeaveRequest> => {
    const record: CreateLeaveRequestRecord = {
      traineeId, // always the authenticated trainee, never a body value
      subject: input.subject.trim(),
      reason: input.reason.trim(),
    };
    const row = await leaveRequestRepository.create(record);
    await queueSlackNotification(row);

    // Live badge update: the mentor's pending-count should tick up without a reload.
    const mentorId = row.trainee.mentor?.id;
    if (mentorId) {
      try {
        realtimeBroker.publish(mentorId, {
          type: 'leave.submitted',
          traineeId: row.trainee_id,
          traineeName: row.trainee.name,
          requestId: row.id,
          subject: row.subject,
        });
      } catch (error) {
        // Badge latency is not worth failing the request over.
        console.error('[leave] failed to publish leave.submitted', error);
      }
    }

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

    // Live badge update: the trainee's unread-count should tick up without a reload.
    // A manager override also re-badges the trainee, because `reviewed_at` moves.
    try {
      realtimeBroker.publish(outcome.request.trainee_id, {
        type: 'leave.reviewed',
        traineeId: outcome.request.trainee_id,
        requestId: outcome.request.id,
        decision: outcome.request.status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
      });
    } catch (error) {
      console.error('[leave] failed to publish leave.reviewed', error);
    }

    return toLeaveRequest(outcome.request);
  };

  // ---------- Header badge counts ----------

  /** APPROVED or REJECTED after `since` (null = all time). Trainee badge. */
  async countDecidedSince(traineeId: string, since: Date | null): Promise<number> {
    return leaveRequestRepository.countDecidedSince(traineeId, since);
  }

  /** PENDING requests in the reviewer's scope. Mentor/manager badge. */
  async countPendingForReviewer(reviewer: LeaveReviewer): Promise<number> {
    return leaveRequestRepository.countPendingForReviewer(reviewer);
  }
}

export const leaveRequestService = new LeaveRequestService();
