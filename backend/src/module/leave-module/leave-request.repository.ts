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
  created_at: true,
  updated_at: true,
  trainee: {
    select: {
      id: true,
      name: true,
      mentor: { select: { id: true, name: true } },
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
   * One transaction performs the access check, the PENDING re-check and the
   * conditional update. A competing reviewer's update makes the second
   * updateMany affect zero rows, so only one decision can ever be written.
   */
  decide = async (input: ReviewLeaveRequestRecord): Promise<ReviewOutcome> => {
    return prisma.$transaction(async (tx) => {
      const current = await tx.leave_request.findFirst({
        where: { id: input.requestId, ...leaveScopeFor(input.reviewer) },
        select: { status: true },
      });
      if (!current) return { ok: false, reason: 'not-found' } as const;
      if (current.status !== leave_status.PENDING) {
        return { ok: false, reason: 'already-reviewed' } as const;
      }

      const updated = await tx.leave_request.updateMany({
        where: {
          id: input.requestId,
          status: leave_status.PENDING,
          ...leaveScopeFor(input.reviewer),
        },
        data: {
          status: input.decision === 'APPROVED' ? leave_status.APPROVED : leave_status.REJECTED,
          reviewer_id: input.reviewer.id,
          reviewer_role: input.reviewer.role === 'MANAGER' ? staff_role.MANAGER : staff_role.MENTOR,
          reviewer_name: input.reviewer.name,
          feedback: input.feedback,
          reviewed_at: new Date(),
        },
      });
      if (updated.count === 0) return { ok: false, reason: 'already-reviewed' } as const;

      const request = await tx.leave_request.findUniqueOrThrow({
        where: { id: input.requestId },
        select: leaveSelect,
      });
      return { ok: true, request } as const;
    });
  };
}

export type LeaveRow = Awaited<ReturnType<typeof LeaveRequestRepository.prototype.create>>;
