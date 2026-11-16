import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminTaskRow, AdminTraineeDetail } from '@itp/types';
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

describe('AdminTaskList', () => {
  it('groups completed tasks by day and leaves out days that have no tasks', () => {
    render(
      <AdminTaskList tasks={tasks} courses={courses} selectedTaskId={null} onViewCode={vi.fn()} />
    );

    expect(screen.getByText('Day 1 · Structure')).toBeInTheDocument();
    expect(screen.getByText('Day 2 · Forms')).toBeInTheDocument();
    expect(screen.queryByText('Day 3 · Media')).not.toBeInTheDocument();
  });

  it('shows submission and stretch state for completed tasks', () => {
    render(
      <AdminTaskList tasks={tasks} courses={courses} selectedTaskId={null} onViewCode={vi.fn()} />
    );

    expect(screen.getByText('Submitted 01 Oct 2026, 17:42')).toBeInTheDocument();
    expect(screen.getByText('Submitted 02 Oct 2026, 17:42')).toBeInTheDocument();
    expect(screen.getByText('Stretch')).toBeInTheDocument();
    expect(screen.getAllByText('Completed')).toHaveLength(2);

    expect(screen.queryByText('In progress')).not.toBeInTheDocument();
    expect(screen.queryByText('Not started')).not.toBeInTheDocument();
  });

  it('shows the review state instead of a plain Completed label', () => {
    const reviewedTasks: AdminTaskRow[] = [
      { ...tasks[0], taskId: 'a', title: 'Approved task', reviewStatus: 'approved' },
      { ...tasks[0], taskId: 'p', title: 'Pending task', reviewStatus: 'pending' },
      {
        ...tasks[0],
        taskId: 'r',
        title: 'Rework task',
        reviewStatus: 'rework',
        submissionCount: 2,
      },
    ];

    render(
      <AdminTaskList
        tasks={reviewedTasks}
        courses={courses}
        selectedTaskId={null}
        onViewCode={vi.fn()}
      />
    );

    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Rework')).toBeInTheDocument();
    expect(screen.getByText(/Attempt #2/)).toBeInTheDocument();
  });

  it('leaves finished days closed by default', () => {
    render(
      <AdminTaskList tasks={tasks} courses={courses} selectedTaskId={null} onViewCode={vi.fn()} />
    );

    const day1 = screen.getByText('Day 1 · Structure').closest('details');
    const day2 = screen.getByText('Day 2 · Forms').closest('details');

    expect(day1).not.toHaveAttribute('open');
    expect(day2).not.toHaveAttribute('open');
  });

  it('opens the day containing the selected task', () => {
    render(
      <AdminTaskList tasks={tasks} courses={courses} selectedTaskId="t2" onViewCode={vi.fn()} />
    );

    const selectedDay = screen.getByText('Day 2 · Forms').closest('details');
    const otherDay = screen.getByText('Day 1 · Structure').closest('details');

    expect(selectedDay).toHaveAttribute('open');
    expect(otherDay).not.toHaveAttribute('open');
  });

  it('asks to view code for the task that was clicked', async () => {
    const user = userEvent.setup();
    const onViewCode = vi.fn();

    render(
      <AdminTaskList tasks={tasks} courses={courses} selectedTaskId="t2" onViewCode={onViewCode} />
    );

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

  it('shows no tasks when there are no completed tasks', () => {
    render(
      <AdminTaskList tasks={[]} courses={courses} selectedTaskId={null} onViewCode={vi.fn()} />
    );

    expect(screen.getByText('No completed tasks yet.')).toBeInTheDocument();
  });
});
