import type {
  CreateLeaveRequestInput,
  LeaveDecision,
  LeaveRequest,
  ReviewLeaveRequestInput,
} from '@itp/types';
import { ConflictError, NotFoundError } from '../../errors/AppError';
import {
  LeaveRequestRepository,
  type CreateLeaveRequestRecord,
  type LeaveReviewer,
  type LeaveRow,
} from './leave-request.repository';

const leaveRequestRepository = new LeaveRequestRepository();

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

export class LeaveRequestService {
  // ---------- Trainee actions ----------

  create = async (traineeId: string, input: CreateLeaveRequestInput): Promise<LeaveRequest> => {
    const record: CreateLeaveRequestRecord = {
      traineeId, // always the authenticated trainee, never a body value
      subject: input.subject.trim(),
      reason: input.reason.trim(),
    };
    return toLeaveRequest(await leaveRequestRepository.create(record));
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
   * succeed. A Manager may reject a Mentor-approved request; every other
   * decided request is final.
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
    return toLeaveRequest(outcome.request);
  };
}

export const leaveRequestService = new LeaveRequestService();
