import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LeaveRequest } from '@itp/types';

import StaffLeaveRequestsPage from './StaffLeaveRequestsPage';
import { getLeaveRequestsForReviewer, reviewLeaveRequest } from '../../api/leave';
import { ApiError } from '../../api/errors';
import { ToastProvider } from '../../components/Toast';

vi.mock('../../api/leave', () => ({
  getLeaveRequestsForReviewer: vi.fn(),
  reviewLeaveRequest: vi.fn(),
}));

vi.mock('../../components/AdminHeader', () => ({
  default: ({ navItems }: { navItems: { to: string; label: string }[] }) => (
    <header>
      <nav aria-label="Staff navigation">
        {navItems.map((item) => (
          <a key={item.to} href={item.to}>
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  ),
}));

const submittedAt = '2026-11-21T10:00:00.000Z';
const pending: LeaveRequest = {
  id: 'request-1',
  traineeId: 'trainee-1',
  traineeName: 'Assigned Trainee',
  assignedMentor: { id: 'mentor-1', name: 'Mock Mentor' },
  subject: 'Medical appointment',
  reason: 'A hospital appointment during lab hours.',
  status: 'PENDING',
  submittedAt,
  reviewerId: null,
  reviewerName: null,
  reviewerRole: null,
  feedback: null,
  reviewedAt: null,
  createdAt: submittedAt,
  updatedAt: submittedAt,
};
const otherMentorPending: LeaveRequest = {
  ...pending,
  id: 'request-2',
  traineeId: 'trainee-2',
  traineeName: 'Other Trainee',
  assignedMentor: { id: 'mentor-2', name: 'Other Mentor' },
  subject: 'Conference',
  reason: 'Industry conference.',
};
const decided: LeaveRequest = {
  ...pending,
  id: 'request-3',
  traineeId: 'trainee-3',
  traineeName: 'Reviewed Trainee',
  subject: 'Moving house',
  reason: 'Changing address.',
  status: 'APPROVED',
  reviewerId: 'mentor-1',
  reviewerName: 'Mock Mentor',
  reviewerRole: 'MENTOR',
  feedback: 'All the best with the move.',
  reviewedAt: '2026-11-21T12:00:00.000Z',
};

function renderPage(area: 'admin' | 'manager' = 'admin') {
  return render(
    <ToastProvider>
      <StaffLeaveRequestsPage area={area} />
    </ToastProvider>
  );
}

describe('StaffLeaveRequestsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The server returns only the rows in scope for the signed-in reviewer.
    vi.mocked(getLeaveRequestsForReviewer).mockResolvedValue([pending, decided]);
    vi.mocked(reviewLeaveRequest).mockResolvedValue({
      ...pending,
      status: 'REJECTED',
      reviewerName: 'Mock Mentor',
      reviewerRole: 'MENTOR',
      feedback: 'Please choose another date.',
      reviewedAt: '2026-11-21T13:00:00.000Z',
    });
  });

  it.each([
    ['admin', '/admin/verify-certificate'],
    ['manager', '/manager/verify-certificate'],
  ] as const)('shows the certificate verification link for %s reviewers', async (area, path) => {
    renderPage(area);

    expect(await screen.findByRole('link', { name: 'Verify certificate' })).toHaveAttribute(
      'href',
      path
    );
  });

  it('lists scoped requests with status filters', async () => {
    renderPage();

    expect(await screen.findByText('Assigned Trainee')).toBeTruthy();
    expect(screen.getByText('Reviewed Trainee')).toBeTruthy();
    expect(screen.queryByText('Other Trainee')).toBeNull();
    expect(screen.getByRole('button', { name: /Pending 1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Approved 1/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Approved 1/ }));
    expect(screen.queryByText('Assigned Trainee')).toBeNull();
    expect(screen.getByText('Reviewed Trainee')).toBeTruthy();
  });

  it('shows the full request and recorded reviewer in the detail dialog', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'View' }));
    expect(screen.getByText('Changing address.')).toBeTruthy();
    expect(screen.getByText(/Mock Mentor \(mentor\)/)).toBeTruthy();
    expect(screen.getByText('All the best with the move.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('requires feedback when rejecting a pending request', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(await screen.findByText('Add feedback before rejecting the request.')).toBeTruthy();
    expect(reviewLeaveRequest).not.toHaveBeenCalled();
  });

  it('rejects a request with feedback and shows a confirmation', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    fireEvent.change(screen.getByLabelText('Feedback / note'), {
      target: { value: 'Please choose another date.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    await waitFor(() =>
      expect(reviewLeaveRequest).toHaveBeenCalledWith('admin', 'request-1', {
        decision: 'REJECTED',
        feedback: 'Please choose another date.',
      })
    );
    expect(await screen.findByText('Leave request rejected.')).toBeTruthy();
  });

  it('approves a request without feedback', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(reviewLeaveRequest).toHaveBeenCalledWith('admin', 'request-1', {
        decision: 'APPROVED',
      })
    );
    expect(await screen.findByText('Leave request approved.')).toBeTruthy();
  });

  it('explains a conflicting review and refreshes the list', async () => {
    vi.mocked(reviewLeaveRequest).mockRejectedValue(
      new ApiError(409, 'ALREADY_REVIEWED', 'Another reviewer already decided this request.')
    );
    const refreshed: LeaveRequest = { ...pending, status: 'APPROVED', reviewerName: 'Manager' };
    vi.mocked(getLeaveRequestsForReviewer)
      .mockResolvedValueOnce([pending, decided])
      .mockResolvedValueOnce([refreshed, decided]);

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('Another reviewer already decided this request.')).toBeTruthy();
    await waitFor(() => expect(getLeaveRequestsForReviewer).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('Manager')).toBeTruthy());
  });

  it('shows the assigned Mentor column in the manager area', async () => {
    vi.mocked(getLeaveRequestsForReviewer).mockResolvedValue([pending, otherMentorPending]);
    renderPage('manager');

    expect(await screen.findByText('Mock Mentor')).toBeTruthy();
    expect(screen.getByText('Other Mentor')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Review' })).toHaveLength(2);
  });

  it('shows a load error with a retry action', async () => {
    vi.mocked(getLeaveRequestsForReviewer).mockRejectedValue(new Error('Could not load requests.'));
    renderPage();

    expect(await screen.findByText('Could not load requests.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
