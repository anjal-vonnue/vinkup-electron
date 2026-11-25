import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminTaskRow, AdminTraineeDetail } from '@itp/types';
import type { TaskReviewFilter } from '../../lib/taskReview';
import AdminTaskList from './AdminTaskList';
import { getAdminTaskCode } from '../../api/admin';
import { createTasksZip, downloadBlob } from '../../lib/adminTaskZip';

vi.mock('../../api/admin', () => ({ getAdminTaskCode: vi.fn() }));
vi.mock('../../lib/adminTaskZip', () => ({
  createTasksZip: vi.fn(() => new Blob(['zip'])),
  downloadBlob: vi.fn(),
  safeZipName: (value: string) => value,
}));

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
    sequenceOrder: 1,
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
    sequenceOrder: 2,
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
  traineeId?: string;
  traineeName?: string;
};

/** Renders the list with sensible defaults, so each test only sets what it checks. */
function renderList({
  taskList = tasks,
  selectedTaskId = null,
  onViewCode = vi.fn(),
  filter = 'all',
  onFilterChange = vi.fn(),
  traineeId = 'trainee-1',
  traineeName = 'Asha Rao',
}: Options = {}) {
  render(
    <AdminTaskList
      tasks={taskList}
      courses={courses}
      selectedTaskId={selectedTaskId}
      onViewCode={onViewCode}
      filter={filter}
      onFilterChange={onFilterChange}
      traineeId={traineeId}
      traineeName={traineeName}
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

beforeEach(() => {
  vi.clearAllMocks();
});

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

  it('offers View draft, not View code, for an in-progress task', async () => {
    const user = userEvent.setup();
    const onViewCode = vi.fn();
    renderList({ taskList: mixedTasks, filter: 'in_progress', onViewCode });

    expect(screen.getByText('Not submitted yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'View code for Unfinished task' })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View draft for Unfinished task' }));

    expect(onViewCode).toHaveBeenCalledWith('i');
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
    expect(screen.getByText(/Approved task/)).toBeInTheDocument();
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

  it('offers scope and multi-select review statuses in the download dialog', async () => {
    const user = userEvent.setup();
    renderList({ taskList: mixedTasks });

    await user.click(screen.getByRole('button', { name: /Download tasks/ }));

    expect(screen.getByRole('dialog', { name: 'Download task code' })).toBeInTheDocument();
    expect(screen.getByLabelText('Scope')).toHaveValue('all');
    expect(screen.getByText('Review statuses')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'All statuses' })).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'All statuses' }));
    await user.click(screen.getByRole('checkbox', { name: 'Pending review' }));
    await user.click(screen.getByRole('checkbox', { name: 'Rework' }));

    expect(screen.getByRole('checkbox', { name: 'Pending review' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Rework' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Download ZIP (2)' })).toBeEnabled();
  });

  it('limits a single-task download to the selected task and status', async () => {
    const user = userEvent.setup();
    vi.mocked(getAdminTaskCode).mockResolvedValue({
      taskId: 'r',
      title: 'Rework task',
      sequenceOrder: 1,
      instructionsMarkdown: 'Complete the form task.',
      status: 'completed',
      isStarterCode: false,
      reviewStatus: 'rework',
      submissionCount: 2,
      files: [{ path: 'src/main.ts', content: 'saved code' }],
      codeUpdatedAt: '2026-10-02T12:12:00.000Z',
      lastSubmittedAt: '2026-10-02T12:12:00.000Z',
      timeSpentSeconds: 0,
    });
    renderList({ taskList: mixedTasks });

    await user.click(screen.getByRole('button', { name: /Download tasks/ }));
    await user.selectOptions(screen.getByLabelText('Scope'), 'task');
    await user.selectOptions(screen.getByLabelText('Course'), 'html');
    await user.selectOptions(screen.getByLabelText('Day'), 'html-2');
    await user.click(screen.getByRole('checkbox', { name: 'All statuses' }));
    await user.click(screen.getByRole('checkbox', { name: 'Rework' }));
    expect(screen.getByRole('option', { name: 'Task 2 · Rework task' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Profile page/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Task'), 'r');

    expect(screen.getByRole('button', { name: 'Download ZIP (1)' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Download ZIP (1)' }));

    expect(getAdminTaskCode).toHaveBeenCalledTimes(1);
    expect(getAdminTaskCode).toHaveBeenCalledWith('trainee-1', 'r');
    expect(createTasksZip).toHaveBeenCalledWith([
      expect.objectContaining({ path: 'HTML/Day 2 - Forms/Task 1 - Rework task' }),
    ]);
    expect(downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'Asha Rao-Task 1 - Rework task.zip'
    );
  });

  it('downloads all eligible tasks in the selected course matching multiple statuses', async () => {
    const user = userEvent.setup();
    vi.mocked(getAdminTaskCode).mockImplementation((_traineeId, taskId) =>
      Promise.resolve({
        taskId,
        title: taskId,
        sequenceOrder: taskId === 'r' || taskId === 'i' ? 2 : 1,
        instructionsMarkdown: 'Task instructions.',
        status: 'completed',
        isStarterCode: false,
        reviewStatus: null,
        submissionCount: 1,
        timeSpentSeconds: 0,
        files: [{ path: 'index.html', content: taskId }],
        codeUpdatedAt: '2026-10-01T12:12:00.000Z',
        lastSubmittedAt: '2026-10-01T12:12:00.000Z',
      })
    );
    renderList({ taskList: mixedTasks });

    await user.click(screen.getByRole('button', { name: /Download tasks/ }));
    await user.selectOptions(screen.getByLabelText('Scope'), 'course');
    await user.click(screen.getByRole('checkbox', { name: 'All statuses' }));
    await user.click(screen.getByRole('checkbox', { name: 'Pending review' }));
    await user.click(screen.getByRole('checkbox', { name: 'Rework' }));

    expect(screen.getByRole('button', { name: 'Download ZIP (2)' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Download ZIP (2)' }));

    expect(getAdminTaskCode).toHaveBeenCalledTimes(2);
    expect(getAdminTaskCode).toHaveBeenCalledWith('trainee-1', 'p');
    expect(getAdminTaskCode).toHaveBeenCalledWith('trainee-1', 'r');
  });

  it('includes submitted tasks even if the endpoint labels their files as starter code', async () => {
    const user = userEvent.setup();
    vi.mocked(getAdminTaskCode).mockImplementation((_traineeId, taskId) =>
      Promise.resolve({
        taskId,
        title: taskId,
        sequenceOrder: taskId === 'r' || taskId === 'i' ? 2 : 1,
        instructionsMarkdown: 'Task instructions.',
        status: 'completed',
        isStarterCode: taskId === 'p',
        reviewStatus: null,
        submissionCount: 1,
        files: [{ path: 'index.html', content: taskId }],
        codeUpdatedAt: '2026-10-01T12:12:00.000Z',
        lastSubmittedAt: '2026-10-01T12:12:00.000Z',
        timeSpentSeconds: 0,
      })
    );
    renderList({ taskList: mixedTasks });

    await user.click(screen.getByRole('button', { name: /Download tasks/ }));
    await user.selectOptions(screen.getByLabelText('Scope'), 'day');
    await user.selectOptions(screen.getByLabelText('Day'), 'html-1');
    await user.click(screen.getByRole('checkbox', { name: 'All statuses' }));
    await user.click(screen.getByRole('checkbox', { name: 'Pending review' }));
    await user.click(screen.getByRole('checkbox', { name: 'Approved' }));

    expect(screen.getByRole('button', { name: 'Download ZIP (2)' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Download ZIP (2)' }));

    expect(getAdminTaskCode).toHaveBeenCalledTimes(2);
    expect(getAdminTaskCode).toHaveBeenCalledWith('trainee-1', 'p');
    expect(getAdminTaskCode).toHaveBeenCalledWith('trainee-1', 'a');
    expect(createTasksZip).toHaveBeenCalledWith([
      expect.objectContaining({ path: 'HTML/Day 1 - Structure/Task 1 - Approved task' }),
      expect.objectContaining({ path: 'HTML/Day 1 - Structure/Task 1 - Pending task' }),
    ]);
  });

  it('keeps the download disabled if the selected day and statuses have no matching tasks', async () => {
    const user = userEvent.setup();
    renderList({ taskList: mixedTasks });

    await user.click(screen.getByRole('button', { name: /Download tasks/ }));
    await user.selectOptions(screen.getByLabelText('Scope'), 'day');
    await user.selectOptions(screen.getByLabelText('Day'), 'html-1');
    await user.click(screen.getByRole('checkbox', { name: 'All statuses' }));
    await user.click(screen.getByRole('checkbox', { name: 'Rework' }));

    expect(screen.getByRole('button', { name: 'Download ZIP (0)' })).toBeDisabled();
  });

  it('shows an error and leaves the dialog open when fetching code fails', async () => {
    const user = userEvent.setup();
    vi.mocked(getAdminTaskCode).mockRejectedValue(new Error('Code request failed'));
    renderList({ taskList: [tasks[0]] });

    await user.click(screen.getByRole('button', { name: /Download tasks/ }));
    await user.click(screen.getByRole('button', { name: 'Download ZIP (1)' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Code request failed');
    expect(screen.getByRole('dialog', { name: 'Download task code' })).toBeInTheDocument();
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
