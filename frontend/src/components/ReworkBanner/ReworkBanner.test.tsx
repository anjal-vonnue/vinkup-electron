import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReworkTaskSummary } from '@itp/types';
import ReworkBanner from './ReworkBanner';

const mockTasks: ReworkTaskSummary[] = [
  {
    taskId: 'html-day-01-t-1',
    taskTitle: 'Structure a Personal Portfolio',
    sequenceOrder: 1,
    dayId: 'html-day-01',
    dayNumber: 1,
    courseId: 'html',
    courseTitle: 'HTML & Semantic Web',
    submissionCount: 2,
    latestReview: {
      id: 'rev-1',
      adminId: 'admin-1',
      adminName: 'Mentor Hawas',
      decision: 'rework',
      feedback: 'Please check your heading hierarchy.',
      reviewedAt: '2026-10-01T10:00:00.000Z',
    },
  },
  {
    taskId: 'js-day-03-t-2',
    taskTitle: 'Pure Function Utilities',
    sequenceOrder: 2,
    dayId: 'js-day-03',
    dayNumber: 3,
    courseId: 'js',
    courseTitle: 'JavaScript Core',
    submissionCount: 1,
    latestReview: {
      id: 'rev-2',
      adminId: 'admin-2',
      adminName: 'Mentor Ameesha',
      decision: 'rework',
      feedback: 'Avoid mutating input arrays directly.',
      reviewedAt: '2026-10-02T11:00:00.000Z',
    },
  },
];

describe('ReworkBanner', () => {
  it('renders nothing when tasks array is empty', () => {
    const { container } = render(
      <ReworkBanner tasks={[]} onOpenFeedback={vi.fn()} onOpenTask={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('is collapsed initially and shows summary header with task count', () => {
    render(<ReworkBanner tasks={mockTasks} onOpenFeedback={vi.fn()} onOpenTask={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Rework Requested' })).toBeInTheDocument();
    expect(screen.getByText('2 tasks')).toBeInTheDocument();
    expect(screen.getByText(/click to view details/i)).toBeInTheDocument();

    // Tasks should be hidden when collapsed
    expect(screen.queryByText('Structure a Personal Portfolio')).not.toBeInTheDocument();
    expect(screen.queryByText('Pure Function Utilities')).not.toBeInTheDocument();
  });

  it('expands when clicked and collapses when clicked again', () => {
    render(<ReworkBanner tasks={mockTasks} onOpenFeedback={vi.fn()} onOpenTask={vi.fn()} />);

    const toggleButton = screen.getByRole('button', { name: /rework requested/i });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    // Click to expand
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Structure a Personal Portfolio')).toBeInTheDocument();
    expect(screen.getByText('Pure Function Utilities')).toBeInTheDocument();
    expect(screen.getByText(/hide details/i)).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Structure a Personal Portfolio')).not.toBeInTheDocument();
  });

  it('calls onOpenFeedback when View Feedback is clicked in expanded state', () => {
    const onOpenFeedback = vi.fn();
    render(
      <ReworkBanner
        tasks={mockTasks}
        onOpenFeedback={onOpenFeedback}
        onOpenTask={vi.fn()}
        initialExpanded={true}
      />
    );

    const feedbackButtons = screen.getAllByRole('button', { name: /view feedback/i });
    fireEvent.click(feedbackButtons[0]);

    expect(onOpenFeedback).toHaveBeenCalledTimes(1);
    expect(onOpenFeedback).toHaveBeenCalledWith(mockTasks[0]);
  });

  it('renders Markdown feedback in the banner preview', () => {
    render(
      <ReworkBanner
        tasks={[
          {
            ...mockTasks[0],
            latestReview: {
              ...mockTasks[0].latestReview!,
              feedback: '## Required changes\n\n- Fix the heading\n- Add spacing',
            },
          },
        ]}
        onOpenFeedback={vi.fn()}
        onOpenTask={vi.fn()}
        initialExpanded
      />
    );

    expect(screen.getByRole('heading', { name: 'Required changes' })).toBeInTheDocument();
    expect(screen.getByRole('list').querySelectorAll('li')).toHaveLength(2);
  });

  it('calls onOpenTask when Go to Task is clicked in expanded state', () => {
    const onOpenTask = vi.fn();
    render(
      <ReworkBanner
        tasks={mockTasks}
        onOpenFeedback={vi.fn()}
        onOpenTask={onOpenTask}
        initialExpanded={true}
      />
    );

    const taskButtons = screen.getAllByRole('button', { name: /go to task/i });
    fireEvent.click(taskButtons[1]);

    expect(onOpenTask).toHaveBeenCalledTimes(1);
    expect(onOpenTask).toHaveBeenCalledWith('js-day-03-t-2');
  });
});
