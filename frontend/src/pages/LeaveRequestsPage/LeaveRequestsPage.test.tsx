import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LeaveRequest } from '@itp/types';

import LeaveRequestsPage from './LeaveRequestsPage';
import { createLeaveRequest, getMyLeaveRequests } from '../../api/leave';

vi.mock('../../api/leave', () => ({
  createLeaveRequest: vi.fn(),
  getMyLeaveRequests: vi.fn(),
}));

vi.mock('../../components/Header', () => ({ default: () => <header>Header</header> }));
vi.mock('../../components/HelpButton', () => ({ default: () => <button>Help</button> }));

const submittedAt = '2026-11-21T10:00:00.000Z';
const existing: LeaveRequest = {
  id: 'request-1',
  traineeId: 'trainee-1',
  traineeName: 'Test Trainee',
  assignedMentor: { id: 'mentor-1', name: 'Test Mentor' },
  subject: 'Conference',
  reason: 'Attending a two-day conference.',
  status: 'REJECTED',
  submittedAt,
  reviewerId: 'mentor-1',
  reviewerName: 'Test Mentor',
  reviewerRole: 'MENTOR',
  feedback: 'Please request earlier next time.',
  reviewedAt: '2026-11-21T12:00:00.000Z',
  createdAt: submittedAt,
  updatedAt: '2026-11-21T12:00:00.000Z',
};

const created: LeaveRequest = {
  ...existing,
  id: 'request-2',
  subject: 'Medical appointment',
  reason: 'Hospital visit in the afternoon.',
  status: 'PENDING',
  reviewerId: null,
  reviewerName: null,
  reviewerRole: null,
  feedback: null,
  reviewedAt: null,
};

describe('LeaveRequestsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMyLeaveRequests).mockResolvedValue([existing]);
    vi.mocked(createLeaveRequest).mockResolvedValue(created);
  });

  it('shows the trainee history including the decision and feedback', async () => {
    render(<LeaveRequestsPage />);

    expect(await screen.findByText('Conference')).toBeTruthy();
    expect(screen.getByText('Attending a two-day conference.')).toBeTruthy();
    expect(screen.getByText('rejected')).toBeTruthy();
    expect(screen.getByText(/Test Mentor \(mentor\)/)).toBeTruthy();
    expect(screen.getByText(/Please request earlier next time./)).toBeTruthy();
  });

  it('shows an empty state when the trainee has no requests', async () => {
    vi.mocked(getMyLeaveRequests).mockResolvedValue([]);

    render(<LeaveRequestsPage />);

    expect(await screen.findByText(/You have not submitted any leave requests yet/)).toBeTruthy();
  });

  it('validates required fields before calling the API', async () => {
    render(<LeaveRequestsPage />);
    await screen.findByText('Conference');

    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }));

    expect(await screen.findByText('Enter a subject for your leave request.')).toBeTruthy();
    expect(screen.getByText('Explain why you need leave.')).toBeTruthy();
    expect(createLeaveRequest).not.toHaveBeenCalled();
  });

  it('submits a request and shows a confirmation', async () => {
    render(<LeaveRequestsPage />);
    await screen.findByText('Conference');

    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: created.subject },
    });
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: created.reason },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }));

    expect(await screen.findByText(/was submitted/)).toBeTruthy();
    expect(createLeaveRequest).toHaveBeenCalledWith({
      subject: created.subject,
      reason: created.reason,
    });
    await waitFor(() => expect(screen.getAllByText(created.subject)).toHaveLength(1));
  });

  it('shows a load error with a retry action', async () => {
    vi.mocked(getMyLeaveRequests).mockRejectedValue(new Error('Could not load requests.'));

    render(<LeaveRequestsPage />);

    expect(await screen.findByText('Could not load requests.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});
