import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  leave_request: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
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
  });

  it('does not write when the current status is final', async () => {
    tx.leave_request.findFirst.mockResolvedValue({ status: 'APPROVED' });

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
