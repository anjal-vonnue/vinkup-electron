import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  leave_request: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  leave_review: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}));

const prisma = vi.hoisted(() => ({
  leave_request: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
}));

vi.mock('../../lib/prisma', () => ({ prisma }));

import { LeaveRequestRepository } from './leave-request.repository';

const REQUEST_ID = 'a1b2c3d4-1111-4222-8333-444444444444';
const TRAINEE_ID = '3f2c9c0e-5b1d-4c53-9a7e-0d6f2f1a9b11';
const MENTOR_ID = '9b1e4c2a-7d3f-4e8b-a1c5-2f6d8e0b4a77';

const mentor = { id: MENTOR_ID, name: 'Test Mentor', role: 'MENTOR' as const };
const manager = {
  id: 'c6a0d6e2-3b55-4a5e-9b2f-7a3d0e8c4f66',
  name: 'Test Manager',
  role: 'MANAGER' as const,
};

const submittedAt = new Date('2026-11-21T10:00:00.000Z');
const row = {
  id: REQUEST_ID,
  trainee_id: TRAINEE_ID,
  subject: 'Medical appointment',
  reason: 'A hospital appointment during lab hours.',
  status: 'PENDING' as const,
  reviewer_id: null,
  reviewer_role: null,
  reviewer_name: null,
  feedback: null,
  submitted_at: submittedAt,
  reviewed_at: null,
  reviews: [],
  created_at: submittedAt,
  updated_at: submittedAt,
  trainee: {
    id: TRAINEE_ID,
    name: 'Test Trainee',
    mentor: { id: MENTOR_ID, name: 'Test Mentor' },
  },
};

let repository: LeaveRequestRepository;

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
    callback(tx)
  );
  repository = new LeaveRequestRepository();
});

describe('LeaveRequestRepository scopes', () => {
  it('lists only the authenticated trainee requests, newest first', async () => {
    prisma.leave_request.findMany.mockResolvedValue([row]);

    await expect(repository.listForTrainee(TRAINEE_ID)).resolves.toEqual([row]);
    expect(prisma.leave_request.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { trainee_id: TRAINEE_ID },
        orderBy: [{ submitted_at: 'desc' }, { created_at: 'desc' }],
      })
    );
  });

  it('limits mentors to their assigned trainees and leaves managers unrestricted', async () => {
    prisma.leave_request.findMany.mockResolvedValue([]);

    await repository.listForReviewer(mentor);
    expect(prisma.leave_request.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { trainee: { mentor_id: MENTOR_ID } } })
    );

    await repository.listForReviewer(manager);
    expect(prisma.leave_request.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} })
    );
  });

  it('lets a manager open any detail without an assignment filter', async () => {
    prisma.leave_request.findFirst.mockResolvedValue(row);

    await expect(repository.findForReviewer(manager, REQUEST_ID)).resolves.toEqual(row);
    expect(prisma.leave_request.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: REQUEST_ID } })
    );

    await repository.findForReviewer(mentor, REQUEST_ID);
    expect(prisma.leave_request.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: REQUEST_ID, trainee: { mentor_id: MENTOR_ID } },
      })
    );
  });
});

describe('LeaveRequestRepository.decide', () => {
  it('writes one decision with reviewer identity from the authenticated user', async () => {
    tx.leave_request.findFirst.mockResolvedValue({ status: 'PENDING' });
    tx.leave_request.updateMany.mockResolvedValue({ count: 1 });
    tx.leave_request.findUniqueOrThrow.mockResolvedValue({ ...row, status: 'REJECTED' });

    const outcome = await repository.decide({
      requestId: REQUEST_ID,
      reviewer: mentor,
      decision: 'REJECTED',
      feedback: 'Please choose another date.',
    });

    expect(outcome.ok).toBe(true);
    expect(tx.leave_request.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REQUEST_ID, trainee: { mentor_id: MENTOR_ID } },
      })
    );
    expect(tx.leave_request.updateMany).toHaveBeenCalledTimes(1);
    const updateCall = tx.leave_request.updateMany.mock.calls[0]?.[0] as {
      where: unknown;
      data: Record<string, unknown>;
    };
    expect(updateCall.where).toEqual({
      id: REQUEST_ID,
      status: 'PENDING',
      trainee: { mentor_id: MENTOR_ID },
    });
    expect(updateCall.data).toEqual(
      expect.objectContaining({
        status: 'REJECTED',
        reviewer_id: MENTOR_ID,
        reviewer_role: 'MENTOR',
        reviewer_name: 'Test Mentor',
        feedback: 'Please choose another date.',
      })
    );
    expect(tx.leave_review.create).toHaveBeenCalledWith({
      data: {
        leave_request_id: REQUEST_ID,
        reviewer_id: MENTOR_ID,
        reviewer_role: 'MENTOR',
        reviewer_name: 'Test Mentor',
        decision: 'REJECTED',
        feedback: 'Please choose another date.',
        reviewed_at: expect.any(Date) as Date,
      },
    });
  });

  it('records a manager decision with the MANAGER role and a review timestamp', async () => {
    tx.leave_request.findFirst.mockResolvedValue({ status: 'PENDING' });
    tx.leave_request.updateMany.mockResolvedValue({ count: 1 });
    const approved = {
      ...row,
      status: 'APPROVED' as const,
      reviewer_id: manager.id,
      reviewer_role: 'MANAGER' as const,
      reviewer_name: manager.name,
      reviewed_at: new Date('2026-11-21T11:00:00.000Z'),
    };
    tx.leave_request.findUniqueOrThrow.mockResolvedValue(approved);

    const outcome = await repository.decide({
      requestId: REQUEST_ID,
      reviewer: manager,
      decision: 'APPROVED',
      feedback: null,
    });

    expect(outcome.ok).toBe(true);
    expect(tx.leave_request.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: REQUEST_ID } })
    );
    expect(tx.leave_request.updateMany).toHaveBeenCalledTimes(1);
    const updateCall = tx.leave_request.updateMany.mock.calls[0]?.[0] as {
      where: unknown;
      data: Record<string, unknown>;
    };
    expect(updateCall.where).toEqual({ id: REQUEST_ID, status: 'PENDING' });
    expect(updateCall.data).toEqual(
      expect.objectContaining({
        status: 'APPROVED',
        reviewer_id: manager.id,
        reviewer_role: 'MANAGER',
        reviewer_name: manager.name,
        feedback: null,
      })
    );
    expect(updateCall.data.reviewed_at).toBeInstanceOf(Date);
    expect(tx.leave_review.create).toHaveBeenCalledWith({
      data: {
        leave_request_id: REQUEST_ID,
        reviewer_id: manager.id,
        reviewer_role: 'MANAGER',
        reviewer_name: manager.name,
        decision: 'APPROVED',
        feedback: null,
        reviewed_at: expect.any(Date) as Date,
      },
    });
  });

  it('appends a Manager rejection without overwriting the Mentor approval', async () => {
    tx.leave_request.findFirst.mockResolvedValue({
      status: 'APPROVED',
      reviewer_role: 'MENTOR',
    });
    tx.leave_review.findUnique.mockResolvedValue(null);
    tx.leave_request.updateMany.mockResolvedValue({ count: 1 });
    tx.leave_request.findUniqueOrThrow.mockResolvedValue({
      ...row,
      status: 'REJECTED',
      reviewer_id: manager.id,
      reviewer_role: 'MANAGER',
      feedback: 'Dates changed.',
      reviews: [
        { id: 'review-1', reviewer_role: 'MENTOR', decision: 'APPROVED' },
        { id: 'review-2', reviewer_role: 'MANAGER', decision: 'REJECTED' },
      ],
    });

    const outcome = await repository.decide({
      requestId: REQUEST_ID,
      reviewer: manager,
      decision: 'REJECTED',
      feedback: 'Dates changed.',
    });

    expect(outcome).toMatchObject({
      ok: true,
      request: { status: 'REJECTED', reviews: [{ id: 'review-1' }, { id: 'review-2' }] },
    });
    const updateCall = tx.leave_request.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(updateCall.where).toEqual({
      id: REQUEST_ID,
      status: 'APPROVED',
      reviewer_role: 'MENTOR',
    });
    expect(updateCall.data).toMatchObject({
      status: 'REJECTED',
      reviewer_id: manager.id,
      reviewer_role: 'MANAGER',
      reviewer_name: manager.name,
      feedback: 'Dates changed.',
    });
    expect(tx.leave_review.create).toHaveBeenCalledWith({
      data: {
        leave_request_id: REQUEST_ID,
        reviewer_id: manager.id,
        reviewer_role: 'MANAGER',
        reviewer_name: manager.name,
        decision: 'REJECTED',
        feedback: 'Dates changed.',
        reviewed_at: expect.any(Date) as Date,
      },
    });
  });

  it('does not let a Manager approve a request a Mentor already approved', async () => {
    tx.leave_request.findFirst.mockResolvedValue({
      status: 'APPROVED',
      reviewer_role: 'MENTOR',
    });

    await expect(
      repository.decide({
        requestId: REQUEST_ID,
        reviewer: manager,
        decision: 'APPROVED',
        feedback: null,
      })
    ).resolves.toEqual({ ok: false, reason: 'already-reviewed' });
    expect(tx.leave_request.updateMany).not.toHaveBeenCalled();
    expect(tx.leave_review.create).not.toHaveBeenCalled();
  });

  it('does not let a Manager change a decision that was already theirs', async () => {
    tx.leave_request.findFirst.mockResolvedValue({
      status: 'APPROVED',
      reviewer_role: 'MANAGER',
    });

    await expect(
      repository.decide({
        requestId: REQUEST_ID,
        reviewer: manager,
        decision: 'REJECTED',
        feedback: 'Too late.',
      })
    ).resolves.toEqual({ ok: false, reason: 'already-reviewed' });
    expect(tx.leave_request.updateMany).not.toHaveBeenCalled();
  });

  it('does not let a Mentor modify an approved or rejected request', async () => {
    tx.leave_request.findFirst.mockResolvedValue({
      status: 'APPROVED',
      reviewer_role: 'MENTOR',
    });

    await expect(
      repository.decide({
        requestId: REQUEST_ID,
        reviewer: mentor,
        decision: 'REJECTED',
        feedback: 'Changed my mind.',
      })
    ).resolves.toEqual({ ok: false, reason: 'already-reviewed' });
    expect(tx.leave_request.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a second review by the same role', async () => {
    tx.leave_request.findFirst.mockResolvedValue({
      status: 'APPROVED',
      reviewer_role: 'MENTOR',
    });
    tx.leave_review.findUnique.mockResolvedValue({ id: 'review-2' });

    await expect(
      repository.decide({
        requestId: REQUEST_ID,
        reviewer: manager,
        decision: 'REJECTED',
        feedback: 'Duplicate.',
      })
    ).resolves.toEqual({ ok: false, reason: 'already-reviewed' });
    expect(tx.leave_request.updateMany).not.toHaveBeenCalled();
    expect(tx.leave_review.create).not.toHaveBeenCalled();
  });

  it('reports a conflict when a competing reviewer wins the conditional update', async () => {
    tx.leave_request.findFirst.mockResolvedValue({ status: 'PENDING' });
    tx.leave_request.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.decide({
        requestId: REQUEST_ID,
        reviewer: manager,
        decision: 'APPROVED',
        feedback: null,
      })
    ).resolves.toEqual({ ok: false, reason: 'already-reviewed' });
    expect(tx.leave_request.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.leave_review.create).not.toHaveBeenCalled();
  });

  it('does not expose a request the reviewer cannot access', async () => {
    tx.leave_request.findFirst.mockResolvedValue(null);

    await expect(
      repository.decide({
        requestId: REQUEST_ID,
        reviewer: mentor,
        decision: 'APPROVED',
        feedback: null,
      })
    ).resolves.toEqual({ ok: false, reason: 'not-found' });
    expect(tx.leave_request.updateMany).not.toHaveBeenCalled();
  });
});
