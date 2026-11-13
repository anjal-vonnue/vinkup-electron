import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TaskFeedbackModal from './TaskFeedbackModal';
import { getTaskReview } from '../../api/tasks';
import type { TaskReview } from '@itp/types';

vi.mock('../../api/tasks', () => ({
  getTaskReview: vi.fn(),
}));

const mockReview: TaskReview = {
  id: 'rev-1',
  taskId: 'task-101',
  adminId: 'admin-1',
  adminName: 'Mentor Jane',
  submissionNo: 2,
  decision: 'rework',
  feedback: 'Please fix the spacing and tags.',
  reviewedAt: '2026-11-12T10:00:00.000Z',
};

describe('TaskFeedbackModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    render(
      <TaskFeedbackModal
        isOpen={false}
        onClose={vi.fn()}
        taskId="task-101"
        taskTitle="HTML Basics"
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders provided initialReview directly without fetching', () => {
    render(
      <TaskFeedbackModal
        isOpen={true}
        onClose={vi.fn()}
        taskId="task-101"
        taskTitle="HTML Basics"
        initialReview={mockReview}
      />
    );

    expect(getTaskReview).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('HTML Basics')).toBeInTheDocument();
    expect(screen.getByText('Reviewed by Mentor Jane')).toBeInTheDocument();
    expect(screen.getByText('Please fix the spacing and tags.')).toBeInTheDocument();
    expect(screen.getByText('Submission attempt #2')).toBeInTheDocument();
    expect(screen.getByText('Rework')).toBeInTheDocument();
  });

  it('fetches review if initialReview is not provided', async () => {
    vi.mocked(getTaskReview).mockResolvedValueOnce({
      reviewStatus: 'rework',
      submissionCount: 2,
      latestReview: mockReview,
    });

    render(
      <TaskFeedbackModal
        isOpen={true}
        onClose={vi.fn()}
        taskId="task-101"
        taskTitle="HTML Basics"
      />
    );

    expect(screen.getByText('Loading review details…')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Please fix the spacing and tags.')).toBeInTheDocument();
    });

    expect(getTaskReview).toHaveBeenCalledWith('task-101');
  });

  it('shows error state if fetching review fails', async () => {
    vi.mocked(getTaskReview).mockRejectedValueOnce(new Error('Network error'));

    render(
      <TaskFeedbackModal
        isOpen={true}
        onClose={vi.fn()}
        taskId="task-101"
        taskTitle="HTML Basics"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(
      <TaskFeedbackModal
        isOpen={true}
        onClose={handleClose}
        taskId="task-101"
        taskTitle="HTML Basics"
        initialReview={mockReview}
      />
    );

    await user.click(screen.getByLabelText('Close review feedback'));
    expect(handleClose).toHaveBeenCalled();
  });

  it('calls onOpenEditor and onClose when Go to Editor button is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    const handleOpenEditor = vi.fn();

    render(
      <TaskFeedbackModal
        isOpen={true}
        onClose={handleClose}
        taskId="task-101"
        taskTitle="HTML Basics"
        initialReview={mockReview}
        onOpenEditor={handleOpenEditor}
      />
    );

    await user.click(screen.getByRole('button', { name: /Go to Editor/i }));
    expect(handleClose).toHaveBeenCalled();
    expect(handleOpenEditor).toHaveBeenCalled();
  });

  it('closes on Escape key press', () => {
    const handleClose = vi.fn();

    render(
      <TaskFeedbackModal
        isOpen={true}
        onClose={handleClose}
        taskId="task-101"
        taskTitle="HTML Basics"
        initialReview={mockReview}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalled();
  });
});
