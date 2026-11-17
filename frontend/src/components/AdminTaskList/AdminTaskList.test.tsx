import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminTaskRow, AdminTraineeDetail } from '@itp/types';
import type { TaskReviewFilter } from '../../lib/taskReview';
import AdminTaskList from './AdminTaskList';

const courses: AdminTraineeDetail['courses'] = [
  {
    id: 'html',
    title: 'HTML',
    days: [
      { id: 'html-1', dayNumber: 1, title: 'Structure', status: 'COMPLETED', completedAt: null },
      { id: 'html-2', dayNumber: 2, title: 'Forms', status: 'UNLOCKED', completedAt: null },
      { id: 'html-3', dayNumber: 3, title: 'Media', status: 'LOCKED', completedAt: null },
    ],
  },
];

const tasks: AdminTaskRow[] = [
  {
    taskId: 't1',
    title: 'Profile page',
    dayId: 'html-1',
    isStretchGoal: false,
    status: 'completed',
    reviewStatus: null,
    submissionCount: 1,
    codeUpdatedAt: '2026-10-01T12:12:00.000Z',
    lastSubmittedAt: '2026-10-01T12:12:00.000Z',
  },
  {
    taskId: 't2',
    title: 'Semantic article',
    dayId: 'html-2',
    isStretchGoal: true,
    status: 'completed',
    reviewStatus: null,
    submissionCount: 1,
    codeUpdatedAt: '2026-10-02T12:12:00.000Z',
    lastSubmittedAt: '2026-10-02T12:12:00.000Z',
  },
];

type Options = {
  taskList?: AdminTaskRow[];
  selectedTaskId?: string | null;
  onViewCode?: (taskId: string) => void;
  filter?: TaskReviewFilter;
  onFilterChange?: (filter: TaskReviewFilter) => void;
};

/** Renders the list with sensible defaults, so each test only sets what it checks. */
function renderList({
  taskList = tasks,
  selectedTaskId = null,
  onViewCode = vi.fn(),
  filter = 'all',
  onFilterChange = vi.fn(),
}: Options = {}) {
  render(
    <AdminTaskList
      tasks={taskList}
      courses={courses}
      selectedTaskId={selectedTaskId}
      onViewCode={onViewCode}
      filter={filter}
      onFilterChange={onFilterChange}
    />
  );
}

/** One task of each state, spread over two days. */
const mixedTasks: AdminTaskRow[] = [
  { ...tasks[0], taskId: 'a', title: 'Approved task', reviewStatus: 'approved' },
  { ...tasks[0], taskId: 'p', title: 'Pending task', reviewStatus: 'pending' },
  {
    ...tasks[1],
    taskId: 'r',
    title: 'Rework task',
    reviewStatus: 'rework',
    submissionCount: 2,
  },
  {
    ...tasks[1],
    taskId: 'i',
    title: 'Unfinished task',
    status: 'in_progress',
    lastSubmittedAt: null,
  },
];

// The filter buttons use the same words, so badge checks look only at <span> elements.
const badge = { selector: 'span' };

describe('AdminTaskList', () => {
  it('groups tasks by day and leaves out days that have no tasks', () => {
    renderList();

    expect(screen.getByText('Day 1 · Structure')).toBeInTheDocument();
    expect(screen.getByText('Day 2 · Forms')).toBeInTheDocument();
    expect(screen.queryByText('Day 3 · Media')).not.toBeInTheDocument();
  });

  it('shows submission and stretch state, and old submissions as pending review', () => {
    renderList();

    expect(screen.getByText('Submitted 01 Oct 2026, 17:42')).toBeInTheDocument();
    expect(screen.getByText('Submitted 02 Oct 2026, 17:42')).toBeInTheDocument();
    expect(screen.getByText('Stretch')).toBeInTheDocument();
    // Both tasks are submitted with no review yet.
    expect(screen.getAllByText('Pending review', badge)).toHaveLength(2);
    expect(screen.queryByText('Completed', badge)).not.toBeInTheDocument();
  });

  it('shows a badge for each review state', () => {
    renderList({ taskList: mixedTasks });

    expect(screen.getByText('Approved', badge)).toBeInTheDocument();
    expect(screen.getByText('Pending review', badge)).toBeInTheDocument();
    expect(screen.getByText('Rework', badge)).toBeInTheDocument();
    expect(screen.getByText('In progress', badge)).toBeInTheDocument();
    expect(screen.getByText(/Attempt #2/)).toBeInTheDocument();
    expect(screen.getByText('Not submitted yet')).toBeInTheDocument();
  });

  it('shows a filter button with a count for each review state', () => {
    renderList({ taskList: mixedTasks });

    expect(screen.getByRole('button', { name: 'All (4)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Pending review (1)' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Approved (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rework (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In progress (1)' })).toBeInTheDocument();
  });

  it('asks to change the filter when a filter button is clicked', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    renderList({ taskList: mixedTasks, onFilterChange });

    await user.click(screen.getByRole('button', { name: 'Rework (1)' }));

    expect(onFilterChange).toHaveBeenCalledWith('rework');
  });

  it('shows only the matching tasks, with their days open', () => {
    renderList({ taskList: mixedTasks, filter: 'approved' });

    expect(screen.getByRole('button', { name: 'Approved (1)' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('Approved task')).toBeInTheDocument();
    expect(screen.queryByText('Pending task')).not.toBeInTheDocument();
    expect(screen.queryByText('Rework task')).not.toBeInTheDocument();
    // Day 2 has no approved task, so it is left out.
    expect(screen.queryByText('Day 2 · Forms')).not.toBeInTheDocument();
    expect(screen.getByText('Day 1 · Structure').closest('details')).toHaveAttribute('open');
  });

  it('shows a message when a filter has no tasks', () => {
    renderList({ filter: 'rework' });

    expect(screen.getByText('No tasks sent back for rework.')).toBeInTheDocument();
    // The buttons stay, so the mentor can pick another filter.
    expect(screen.getByRole('button', { name: 'All (2)' })).toBeInTheDocument();
  });

  it('leaves days closed by default when showing all tasks', () => {
    renderList();

    expect(screen.getByText('Day 1 · Structure').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('Day 2 · Forms').closest('details')).not.toHaveAttribute('open');
  });

  it('opens the day containing the selected task', () => {
    renderList({ selectedTaskId: 't2' });

    expect(screen.getByText('Day 2 · Forms').closest('details')).toHaveAttribute('open');
    expect(screen.getByText('Day 1 · Structure').closest('details')).not.toHaveAttribute('open');
  });

  it('asks to view code for the task that was clicked', async () => {
    const user = userEvent.setup();
    const onViewCode = vi.fn();
    renderList({ selectedTaskId: 't2', onViewCode });

    await user.click(screen.getByRole('button', { name: 'View code for Profile page' }));

    expect(onViewCode).toHaveBeenCalledWith('t1');
    expect(screen.getByRole('button', { name: 'View code for Semantic article' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'View code for Profile page' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('shows a message and no filters when there are no tasks', () => {
    renderList({ taskList: [] });

    expect(screen.getByText('No completed tasks yet.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filter tasks by review status' })).toBeNull();
  });
});
