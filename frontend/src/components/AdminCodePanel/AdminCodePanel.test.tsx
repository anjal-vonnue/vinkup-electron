import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminTaskCode } from '@itp/types';
import { approveTask, getAdminTaskReviews, requestRework } from '../../api/admin';
import { ApiError } from '../../api/errors';
import AdminCodePanel from './AdminCodePanel';

vi.mock('../../api/admin', () => ({
  approveTask: vi.fn(),
  requestRework: vi.fn(),
  getAdminTaskReviews: vi.fn().mockResolvedValue([]),
}));

const code: AdminTaskCode = {
  taskId: 't1',
  title: 'Profile page',
  sequenceOrder: 1,
  instructionsMarkdown: 'Build a profile page.',
  status: 'in_progress',
  reviewStatus: null,
  submissionCount: 0,
  isStarterCode: false,
  files: [
    { path: 'index.html', content: '<h1>Hi</h1>' },
    { path: 'style.css', content: 'h1 { color: red; }' },
  ],
  codeUpdatedAt: '2026-10-02T12:12:00.000Z',
  lastSubmittedAt: null,
};

function renderPanel(overrides: Partial<Parameters<typeof AdminCodePanel>[0]> = {}) {
  const props = {
    traineeId: 'trainee-1',
    taskTitle: 'Profile page',
    code,
    isLoading: false,
    error: null,
    onRetry: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<AdminCodePanel {...props} />);
  return props;
}

describe('AdminCodePanel', () => {
  it('shows the task, its state and a read-only viewer with every file', async () => {
    renderPanel();

    expect(screen.getByRole('heading', { name: 'Profile page' })).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Saved 02 Oct 2026, 17:42')).toBeInTheDocument();
    expect(await screen.findByLabelText('index.html (read-only)')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /index\.html/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /style\.css/ })).toBeInTheDocument();
    expect(screen.getByText('Read only')).toBeInTheDocument();
  });

  it('switches between files', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('tab', { name: /style\.css/ }));

    expect(screen.getByLabelText('style.css (read-only)')).toBeInTheDocument();
  });

  it('offers no way to edit, run, save or submit', async () => {
    renderPanel();
    await screen.findByLabelText('index.html (read-only)');

    expect(
      screen.queryByRole('button', { name: /run|save|reset|submit/i })
    ).not.toBeInTheDocument();
  });

  it('says when the code is starter code', () => {
    renderPanel({ code: { ...code, isStarterCode: true, codeUpdatedAt: null } });

    expect(screen.getByRole('note')).toHaveTextContent(/hasn.t saved any work/);
  });

  it('says when the code is an unsubmitted draft, and offers no review buttons', () => {
    renderPanel();

    expect(screen.getByRole('note')).toHaveTextContent(/hasn.t submitted this task yet/);
    expect(screen.queryByRole('button', { name: /approve|rework/i })).not.toBeInTheDocument();
  });

  it('shows no draft note for a submitted task', () => {
    renderPanel({
      code: { ...code, status: 'completed', reviewStatus: 'pending', submissionCount: 1 },
    });

    expect(screen.queryByText(/hasn.t submitted this task yet/)).not.toBeInTheDocument();
  });

  it('shows a loader while loading', () => {
    renderPanel({ code: null, isLoading: true });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the error and retries', async () => {
    const user = userEvent.setup();
    const props = renderPanel({
      code: null,
      error: new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.'),
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load code');
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it('has no retry for a task that does not exist', () => {
    renderPanel({ code: null, error: new ApiError(404, 'NOT_FOUND', 'Task not found.') });

    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('closes', async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByRole('button', { name: 'Close code viewer' }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  describe('review actions', () => {
    const completedCode: AdminTaskCode = {
      ...code,
      status: 'completed',
      lastSubmittedAt: '2026-10-02T14:00:00.000Z',
      submissionCount: 1,
      reviewStatus: 'pending',
    };

    it('shows Approve, Rework and History buttons for completed tasks awaiting review', () => {
      renderPanel({ code: completedCode });

      expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Rework' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /History/i })).toBeInTheDocument();
    });

    it('approves a task when Approve is clicked', async () => {
      vi.mocked(approveTask).mockResolvedValue({
        id: 'rev-app-1',
        taskId: 't1',
        adminId: 'a1',
        adminName: 'Admin',
        submissionNo: 1,
        decision: 'approved',
        feedback: '',
        reviewedAt: '2026-10-02T15:00:00.000Z',
      });

      const onReviewSuccess = vi.fn();
      const user = userEvent.setup();
      renderPanel({ code: completedCode, onReviewSuccess });

      await user.click(screen.getByRole('button', { name: 'Approve' }));

      expect(approveTask).toHaveBeenCalledWith('trainee-1', 't1');
      expect(screen.getByText('Approved')).toBeInTheDocument();
      expect(onReviewSuccess).toHaveBeenCalledWith('t1', 'approved');
    });

    it('opens rework modal, validates feedback, and submits rework request', async () => {
      vi.mocked(requestRework).mockResolvedValue({
        id: 'rev-rew-1',
        taskId: 't1',
        adminId: 'a1',
        adminName: 'Admin',
        submissionNo: 1,
        decision: 'rework',
        feedback: 'Fix heading hierarchy',
        reviewedAt: '2026-10-02T15:00:00.000Z',
      });

      const onReviewSuccess = vi.fn();
      const user = userEvent.setup();
      renderPanel({ code: completedCode, onReviewSuccess });

      await user.click(screen.getByRole('button', { name: 'Rework' }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Request Rework/i)).toBeInTheDocument();

      // Submit with empty feedback
      await user.click(screen.getByRole('button', { name: 'Submit Review' }));
      expect(
        screen.getByText('Meaningful feedback is required before requesting rework.')
      ).toBeInTheDocument();
      expect(requestRework).not.toHaveBeenCalled();

      // Type meaningful feedback
      await user.type(screen.getByPlaceholderText(/Please fix/i), 'Fix heading hierarchy');
      await user.click(screen.getByRole('button', { name: 'Submit Review' }));

      expect(requestRework).toHaveBeenCalledWith('trainee-1', 't1', 'Fix heading hierarchy');
      expect(screen.getByText('Rework requested')).toBeInTheDocument();
      expect(onReviewSuccess).toHaveBeenCalledWith('t1', 'rework');
    });

    it('submits the contents of a selected Markdown file as feedback', async () => {
      vi.mocked(requestRework).mockResolvedValue({
        id: 'rev-rew-md-1',
        taskId: 't1',
        adminId: 'a1',
        adminName: 'Admin',
        submissionNo: 1,
        decision: 'rework',
        feedback: '## Rework\n- Fix heading hierarchy',
        reviewedAt: '2026-10-02T15:00:00.000Z',
      });
      const user = userEvent.setup();
      renderPanel({ code: completedCode });

      await user.click(screen.getByRole('button', { name: 'Rework' }));
      await user.upload(
        screen.getByLabelText('Upload Markdown feedback file'),
        new File(['## Rework\n- Fix heading hierarchy'], 'review.md', { type: 'text/markdown' })
      );

      expect(screen.getByText('Selected: review.md')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/Please fix/i)).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Submit Review' }));

      expect(requestRework).toHaveBeenCalledWith(
        'trainee-1',
        't1',
        '## Rework\n- Fix heading hierarchy'
      );
    });

    it('clears the selected file when switching back to text feedback', async () => {
      const user = userEvent.setup();
      renderPanel({ code: completedCode });

      await user.click(screen.getByRole('button', { name: 'Rework' }));
      await user.upload(
        screen.getByLabelText('Upload Markdown feedback file'),
        new File(['File feedback'], 'review.md', { type: 'text/markdown' })
      );
      await user.click(screen.getByRole('radio', { name: 'Write feedback' }));

      expect(screen.queryByText('Selected: review.md')).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Please fix/i)).toHaveValue('');
    });

    it('renders Markdown in review history and keeps plain feedback readable', async () => {
      vi.mocked(getAdminTaskReviews).mockResolvedValue([
        {
          id: 'rev-md',
          taskId: 't1',
          adminId: 'a1',
          adminName: 'Admin',
          submissionNo: 1,
          decision: 'rework',
          feedback: '## Fixes\n\n- Fix the heading\n- Add spacing',
          reviewedAt: '2026-10-02T15:00:00.000Z',
        },
        {
          id: 'rev-text',
          taskId: 't1',
          adminId: 'a1',
          adminName: 'Admin',
          submissionNo: 2,
          decision: 'approved',
          feedback: 'Looks good now.',
          reviewedAt: '2026-10-03T15:00:00.000Z',
        },
      ]);
      const user = userEvent.setup();
      renderPanel({ code: completedCode });

      await user.click(screen.getByRole('button', { name: /History/i }));

      expect(await screen.findByRole('heading', { name: 'Fixes' })).toBeInTheDocument();
      expect(screen.getByRole('list').querySelectorAll('li')).toHaveLength(2);
      expect(screen.getByText('Looks good now.').tagName).toBe('P');
      expect(screen.queryByRole('button', { name: 'Show more feedback' })).not.toBeInTheDocument();
    });

    it('rejects files that do not have a Markdown extension', async () => {
      const user = userEvent.setup();
      renderPanel({ code: completedCode });

      await user.click(screen.getByRole('button', { name: 'Rework' }));
      await user.upload(
        screen.getByLabelText('Upload Markdown feedback file'),
        new File(['not markdown'], 'review.txt', { type: 'text/plain' })
      );

      expect(screen.getByText('Choose a Markdown file with a .md extension.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Submit Review' }));
      expect(requestRework).not.toHaveBeenCalled();
    });

    it('rejects Markdown files with 10,000 or more characters', async () => {
      const user = userEvent.setup();
      renderPanel({ code: completedCode });

      await user.click(screen.getByRole('button', { name: 'Rework' }));
      await user.upload(
        screen.getByLabelText('Upload Markdown feedback file'),
        new File(['x'.repeat(10_000)], 'review.md', { type: 'text/markdown' })
      );

      expect(
        screen.getByText('Markdown feedback must be under 10,000 characters.')
      ).toBeInTheDocument();
      expect(screen.queryByText('Selected: review.md')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Submit Review' }));
      expect(requestRework).not.toHaveBeenCalled();
    });

    it('shows Approved badge and no review buttons when task is already approved', () => {
      renderPanel({ code: { ...completedCode, reviewStatus: 'approved' } });

      expect(screen.getByText('Approved')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Rework' })).not.toBeInTheDocument();
    });

    it('shows Rework requested badge and no review buttons when task is currently in rework', () => {
      renderPanel({ code: { ...completedCode, reviewStatus: 'rework' } });

      expect(screen.getByText('Rework requested')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Rework' })).not.toBeInTheDocument();
    });
  });
});
