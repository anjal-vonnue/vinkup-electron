import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  create: vi.fn(),
  listForTrainee: vi.fn(),
  findForTrainee: vi.fn(),
  listForReviewer: vi.fn(),
  findForReviewer: vi.fn(),
  decide: vi.fn(),
}));

vi.mock('./leave-request.repository', () => ({
  LeaveRequestRepository: class {
    create = repository.create;
    listForTrainee = repository.listForTrainee;
    findForTrainee = repository.findForTrainee;
    listForReviewer = repository.listForReviewer;
    findForReviewer = repository.findForReviewer;
    decide = repository.decide;
  },
}));

import { LeaveRequestService } from './leave-request.service';

const TRAINEE_ID = '3f2c9c0e-5b1d-4c53-9a7e-0d6f2f1a9b11';
const REQUEST_ID = 'a1b2c3d4-1111-4222-8333-444444444444';
const reviewer = {
  id: '9b1e4c2a-7d3f-4e8b-a1c5-2f6d8e0b4a77',
  name: 'Test Mentor',
  role: 'MENTOR' as const,
};

const submittedAt = new Date('2026-11-21T10:00:00.000Z');
const row = {
  id: REQUEST_ID,
  trainee_id: TRAINEE_ID,
  subject: 'Family event',
  reason: 'A family celebration needs travel.',
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
    mentor: { id: reviewer.id, name: reviewer.name },
  },
};

let service: LeaveRequestService;

beforeEach(() => {
  vi.clearAllMocks();
  service = new LeaveRequestService();
});

describe('LeaveRequestService trainee actions', () => {
  it('creates a request for the authenticated trainee with trimmed text', async () => {
    repository.create.mockResolvedValue(row);

    await expect(
      service.create(TRAINEE_ID, {
        subject: '  Family event  ',
        reason: '  A family celebration needs travel.  ',
      })
    ).resolves.toMatchObject({
      id: REQUEST_ID,
      traineeId: TRAINEE_ID,
      status: 'PENDING',
      submittedAt: submittedAt.toISOString(),
    });
    expect(repository.create).toHaveBeenCalledWith({
      traineeId: TRAINEE_ID,
      subject: 'Family event',
      reason: 'A family celebration needs travel.',
    });
  });

  it('lists and reads only the authenticated trainee requests', async () => {
    repository.listForTrainee.mockResolvedValue([row]);
    repository.findForTrainee.mockResolvedValue(row);

    await expect(service.listMine(TRAINEE_ID)).resolves.toHaveLength(1);
    await expect(service.getMine(TRAINEE_ID, REQUEST_ID)).resolves.toMatchObject({
      assignedMentor: { id: reviewer.id, name: reviewer.name },
    });
    expect(repository.listForTrainee).toHaveBeenCalledWith(TRAINEE_ID);
    expect(repository.findForTrainee).toHaveBeenCalledWith(TRAINEE_ID, REQUEST_ID);
  });

  it('hides a request that does not belong to the trainee', async () => {
    repository.findForTrainee.mockResolvedValue(null);

    await expect(service.getMine(TRAINEE_ID, REQUEST_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});

describe('LeaveRequestService review mapping', () => {
  it('includes the complete decision history with ISO timestamps', async () => {
    const reviewed = {
      ...row,
      status: 'REJECTED' as const,
      reviews: [
        {
          id: 'review-1',
          reviewer_id: reviewer.id,
          reviewer_name: reviewer.name,
          reviewer_role: 'MENTOR' as const,
          decision: 'APPROVED' as const,
          feedback: 'Enjoy the time off.',
          reviewed_at: submittedAt,
        },
        {
          id: 'review-2',
          reviewer_id: 'manager-1',
          reviewer_name: 'Test Manager',
          reviewer_role: 'MANAGER' as const,
          decision: 'REJECTED' as const,
          feedback: 'The dates changed.',
          reviewed_at: new Date('2026-11-21T11:00:00.000Z'),
        },
      ],
    };
    repository.listForTrainee.mockResolvedValue([reviewed]);

    const [mapped] = await service.listMine(TRAINEE_ID);
    expect(mapped?.reviews).toEqual([
      {
        id: 'review-1',
        reviewerId: reviewer.id,
        reviewerName: reviewer.name,
        reviewerRole: 'MENTOR',
        decision: 'APPROVED',
        feedback: 'Enjoy the time off.',
        reviewedAt: submittedAt.toISOString(),
      },
      {
        id: 'review-2',
        reviewerId: 'manager-1',
        reviewerName: 'Test Manager',
        reviewerRole: 'MANAGER',
        decision: 'REJECTED',
        feedback: 'The dates changed.',
        reviewedAt: '2026-11-21T11:00:00.000Z',
      },
    ]);
  });

  it('maps a competing decision to a conflict', async () => {
    repository.decide.mockResolvedValue({ ok: false, reason: 'already-reviewed' });

    await expect(
      service.review(reviewer, REQUEST_ID, { decision: 'APPROVED' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'ALREADY_REVIEWED' });
  });

  it('maps an inaccessible request to not found', async () => {
    repository.decide.mockResolvedValue({ ok: false, reason: 'not-found' });

    await expect(
      service.review(reviewer, REQUEST_ID, { decision: 'REJECTED', feedback: 'No.' })
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('returns the updated request after a successful decision', async () => {
    const reviewed = {
      ...row,
      status: 'REJECTED' as const,
      reviewer_id: reviewer.id,
      reviewer_role: 'MENTOR' as const,
      reviewer_name: reviewer.name,
      feedback: 'Please choose another date.',
      reviewed_at: submittedAt,
    };
    repository.decide.mockResolvedValue({ ok: true, request: reviewed });

    await expect(
      service.review(reviewer, REQUEST_ID, {
        decision: 'REJECTED',
        feedback: 'Please choose another date.',
      })
    ).resolves.toMatchObject({
      status: 'REJECTED',
      reviewerRole: 'MENTOR',
      feedback: 'Please choose another date.',
      reviewedAt: submittedAt.toISOString(),
    });
  });
});

describe('LeaveRequestService mentor review actions', () => {
  it('lists and reads requests using the authenticated mentor scope', async () => {
    repository.listForReviewer.mockResolvedValue([row]);
    repository.findForReviewer.mockResolvedValue(row);

    await expect(service.listForReviewer(reviewer)).resolves.toHaveLength(1);
    await expect(service.getForReviewer(reviewer, REQUEST_ID)).resolves.toMatchObject({
      id: REQUEST_ID,
      assignedMentor: { id: reviewer.id },
    });
    expect(repository.listForReviewer).toHaveBeenCalledWith(reviewer);
    expect(repository.findForReviewer).toHaveBeenCalledWith(reviewer, REQUEST_ID);
  });

  it('does not reveal a request outside the mentor assignment', async () => {
    repository.findForReviewer.mockResolvedValue(null);

    await expect(service.getForReviewer(reviewer, REQUEST_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('approves a pending request with an optional note', async () => {
    const approved = {
      ...row,
      status: 'APPROVED' as const,
      reviewer_id: reviewer.id,
      reviewer_role: 'MENTOR' as const,
      reviewer_name: reviewer.name,
      feedback: 'Enjoy the time off.',
      reviewed_at: submittedAt,
    };
    repository.decide.mockResolvedValue({ ok: true, request: approved });

    await expect(
      service.review(reviewer, REQUEST_ID, {
        decision: 'APPROVED',
        feedback: '  Enjoy the time off.  ',
      })
    ).resolves.toMatchObject({ status: 'APPROVED', reviewerRole: 'MENTOR' });
    expect(repository.decide).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      reviewer,
      decision: 'APPROVED',
      feedback: 'Enjoy the time off.',
    });
  });
});

describe('LeaveRequestService manager review actions', () => {
  const manager = {
    id: 'c6a0d6e2-3b55-4a5e-9b2f-7a3d0e8c4f66',
    name: 'Test Manager',
    role: 'MANAGER' as const,
  };

  it('uses the same listing and detail methods with a platform-wide reviewer', async () => {
    repository.listForReviewer.mockResolvedValue([row]);
    repository.findForReviewer.mockResolvedValue(row);

    await expect(service.listForReviewer(manager)).resolves.toHaveLength(1);
    await expect(service.getForReviewer(manager, REQUEST_ID)).resolves.toMatchObject({
      id: REQUEST_ID,
    });
    expect(repository.listForReviewer).toHaveBeenCalledWith(manager);
    expect(repository.findForReviewer).toHaveBeenCalledWith(manager, REQUEST_ID);
  });

  it('reports a Manager rejection of a Mentor approval with both reviews', async () => {
    const rejected = {
      ...row,
      status: 'REJECTED' as const,
      reviewer_id: manager.id,
      reviewer_role: 'MANAGER' as const,
      reviewer_name: manager.name,
      feedback: 'The dates changed.',
      reviewed_at: submittedAt,
      reviews: [
        {
          id: 'review-1',
          reviewer_id: reviewer.id,
          reviewer_name: reviewer.name,
          reviewer_role: 'MENTOR' as const,
          decision: 'APPROVED' as const,
          feedback: null,
          reviewed_at: submittedAt,
        },
        {
          id: 'review-2',
          reviewer_id: manager.id,
          reviewer_name: manager.name,
          reviewer_role: 'MANAGER' as const,
          decision: 'REJECTED' as const,
          feedback: 'The dates changed.',
          reviewed_at: submittedAt,
        },
      ],
    };
    repository.decide.mockResolvedValue({ ok: true, request: rejected });

    await expect(
      service.review(manager, REQUEST_ID, { decision: 'REJECTED', feedback: 'The dates changed.' })
    ).resolves.toMatchObject({
      status: 'REJECTED',
      reviewerRole: 'MANAGER',
      reviews: [
        { reviewerRole: 'MENTOR', decision: 'APPROVED' },
        { reviewerRole: 'MANAGER', decision: 'REJECTED', feedback: 'The dates changed.' },
      ],
    });
    expect(repository.decide).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      reviewer: manager,
      decision: 'REJECTED',
      feedback: 'The dates changed.',
    });
  });

  it('rejects any pending request and records the manager as reviewer', async () => {
    const rejected = {
      ...row,
      status: 'REJECTED' as const,
      reviewer_id: manager.id,
      reviewer_role: 'MANAGER' as const,
      reviewer_name: manager.name,
      feedback: 'Reschedule after the release.',
      reviewed_at: submittedAt,
    };
    repository.decide.mockResolvedValue({ ok: true, request: rejected });

    await expect(
      service.review(manager, REQUEST_ID, {
        decision: 'REJECTED',
        feedback: 'Reschedule after the release.',
      })
    ).resolves.toMatchObject({
      status: 'REJECTED',
      reviewerId: manager.id,
      reviewerName: manager.name,
      reviewerRole: 'MANAGER',
      feedback: 'Reschedule after the release.',
    });
  });
});
