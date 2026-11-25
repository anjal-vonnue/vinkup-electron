import type { LeaveReviewerRole } from '@itp/types';
import type { Prisma } from '../../generated/prisma/client';
import { leave_status, staff_role } from '../../generated/prisma/enums';
import { prisma } from '../../lib/prisma';

/** Reviewer scope comes from the authenticated user, never from the request body. */
export type LeaveReviewer = {
  id: string;
  name: string;
  role: LeaveReviewerRole;
};

export type CreateLeaveRequestRecord = {
  traineeId: string;
  subject: string;
  reason: string;
};

export type ReviewLeaveRequestRecord = {
  requestId: string;
  reviewer: LeaveReviewer;
  decision: 'APPROVED' | 'REJECTED';
  feedback: string | null;
};

export type ReviewOutcome =
  { ok: true; request: LeaveRow } | { ok: false; reason: 'not-found' | 'already-reviewed' };

// Declared separately so the generated Prisma types accept a mutable array.
const reviewOrderBy: Prisma.leave_reviewOrderByWithRelationInput[] = [
  { reviewed_at: 'asc' },
  { created_at: 'asc' },
];

const leaveSelect = {
  id: true,
  trainee_id: true,
  subject: true,
  reason: true,
  status: true,
  reviewer_id: true,
  reviewer_role: true,
  reviewer_name: true,
  feedback: true,
  submitted_at: true,
  reviewed_at: true,
  reviews: {
    select: {
      id: true,
      reviewer_id: true,
      reviewer_role: true,
      reviewer_name: true,
      decision: true,
      feedback: true,
      reviewed_at: true,
    },
    orderBy: reviewOrderBy,
  },
  created_at: true,
  updated_at: true,
  trainee: {
    select: {
      id: true,
      name: true,
      mentor: { select: { id: true, name: true, slack_channel_id: true } },
    },
  },
} as const;

/** Mentors are limited to their current trainees; managers have no assignment filter. */
export function leaveScopeFor(reviewer: LeaveReviewer): Prisma.leave_requestWhereInput {
  return reviewer.role === 'MENTOR' ? { trainee: { mentor_id: reviewer.id } } : {};
}

export class LeaveRequestRepository {
  create = (input: CreateLeaveRequestRecord) =>
    prisma.leave_request.create({
      data: {
        trainee_id: input.traineeId,
        subject: input.subject,
        reason: input.reason,
      },
      select: leaveSelect,
    });

  listForTrainee = (traineeId: string) =>
    prisma.leave_request.findMany({
      where: { trainee_id: traineeId },
      orderBy: [{ submitted_at: 'desc' }, { created_at: 'desc' }],
      select: leaveSelect,
    });

  findForTrainee = (traineeId: string, requestId: string) =>
    prisma.leave_request.findFirst({
      where: { id: requestId, trainee_id: traineeId },
      select: leaveSelect,
    });

  listForReviewer = (reviewer: LeaveReviewer) =>
    prisma.leave_request.findMany({
      where: leaveScopeFor(reviewer),
      orderBy: [{ status: 'asc' }, { submitted_at: 'desc' }],
      select: leaveSelect,
    });

  findForReviewer = (reviewer: LeaveReviewer, requestId: string) =>
    prisma.leave_request.findFirst({
      where: { id: requestId, ...leaveScopeFor(reviewer) },
      select: leaveSelect,
    });

  /**
   * One transaction performs the access check, the status re-check, the
   * conditional update and the append-only history write. A competing
   * reviewer's update makes the second updateMany affect zero rows, so only
   * one decision can ever win.
   */
  decide = async (input: ReviewLeaveRequestRecord): Promise<ReviewOutcome> => {
    return prisma.$transaction(async (tx) => {
      const current = await tx.leave_request.findFirst({
        where: { id: input.requestId, ...leaveScopeFor(input.reviewer) },
        select: { status: true, reviewer_role: true },
      });
      if (!current) return { ok: false, reason: 'not-found' } as const;

      const reviewerRole =
        input.reviewer.role === 'MANAGER' ? staff_role.MANAGER : staff_role.MENTOR;
      const decision =
        input.decision === 'APPROVED' ? leave_status.APPROVED : leave_status.REJECTED;

      // Only three writes are legal: a first decision on PENDING, a Manager
      // rejecting a Mentor approval, or a Manager overriding a Mentor rejection
      // (approve or re-reject). In both override cases the row must still be
      // recorded as the Mentor's decision.
      const reviewingPending = current.status === leave_status.PENDING;
      const managerOverridingMentor =
        input.reviewer.role === 'MANAGER' && current.reviewer_role === staff_role.MENTOR;
      const managerRejectingApproval =
        managerOverridingMentor &&
        decision === leave_status.REJECTED &&
        current.status === leave_status.APPROVED;
      const managerReviewingMentorRejection =
        managerOverridingMentor && current.status === leave_status.REJECTED;
      if (!reviewingPending && !managerRejectingApproval && !managerReviewingMentorRejection) {
        return { ok: false, reason: 'already-reviewed' } as const;
      }

      const alreadyReviewedByRole = await tx.leave_review.findUnique({
        where: {
          leave_request_id_reviewer_role: {
            leave_request_id: input.requestId,
            reviewer_role: reviewerRole,
          },
        },
        select: { id: true },
      });
      if (alreadyReviewedByRole) return { ok: false, reason: 'already-reviewed' } as const;

      const reviewedAt = new Date();
      // Re-check the expected current decision in the UPDATE itself, so a
      // competing review that commits after the read above makes this affect
      // zero rows and the loser gets a 409.
      const expectedStatus = managerRejectingApproval
        ? leave_status.APPROVED
        : managerReviewingMentorRejection
          ? leave_status.REJECTED
          : leave_status.PENDING;
      const updated = await tx.leave_request.updateMany({
        where: {
          id: input.requestId,
          status: expectedStatus,
          ...(managerOverridingMentor ? { reviewer_role: staff_role.MENTOR } : {}),
          ...leaveScopeFor(input.reviewer),
        },
        data: {
          status: decision,
          reviewer_id: input.reviewer.id,
          reviewer_role: reviewerRole,
          reviewer_name: input.reviewer.name,
          feedback: input.feedback,
          reviewed_at: reviewedAt,
        },
      });
      if (updated.count === 0) return { ok: false, reason: 'already-reviewed' } as const;

      await tx.leave_review.create({
        data: {
          leave_request_id: input.requestId,
          reviewer_id: input.reviewer.id,
          reviewer_role: reviewerRole,
          reviewer_name: input.reviewer.name,
          decision,
          feedback: input.feedback,
          reviewed_at: reviewedAt,
        },
      });

      const request = await tx.leave_request.findUniqueOrThrow({
        where: { id: input.requestId },
        select: leaveSelect,
      });
      return { ok: true, request } as const;
    });
  };
}

export type LeaveRow = Awaited<ReturnType<typeof LeaveRequestRepository.prototype.create>>;
