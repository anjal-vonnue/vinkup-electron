import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DayTask } from '@itp/types';
import { getTaskReview } from '../../api/tasks';
import TaskModal from './TaskModal';

vi.mock('../../api/tasks', () => ({ getTaskReview: vi.fn() }));

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

// Only the fields the modal reads. Cast because DayTask may carry more fields.
function makeTask(overrides: Partial<DayTask> = {}): DayTask {
  return {
    id: 'task-1',
    title: 'Personal Profile Page',
    sequenceOrder: 1,
    status: 'not_started',
    isStretchGoal: false,
    ...overrides,
  };
}

const requiredTask = makeTask({
  id: 'task-1',
  title: 'Personal Profile Page',
  sequenceOrder: 1,
  status: 'completed',
});
const inProgressTask = makeTask({
  id: 'task-2',
  title: 'Recipe Card',
  sequenceOrder: 2,
  status: 'in_progress',
});
const stretchTask = makeTask({
  id: 'task-3',
  title: 'Accessible Navigation',
  sequenceOrder: 3,
  status: 'not_started',
  isStretchGoal: true,
});

function renderModal(overrides: Partial<React.ComponentProps<typeof TaskModal>> = {}) {
  const onClose = vi.fn();
  const onSelectTask = vi.fn();

  const props = {
    courseTitle: 'HTML',
    isOpen: true,
    dayNumber: 3,
    tasks: [requiredTask, inProgressTask, stretchTask],
    onClose,
    onSelectTask,
    ...overrides,
  };

  const view = render(<TaskModal {...props} />);
  return { ...view, props, onClose, onSelectTask };
}

describe('TaskModal: visibility', () => {
  it('renders nothing when it is closed', () => {
    renderModal({ isOpen: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders an accessible dialog when it is open', () => {
    renderModal();

    const dialog = screen.getByRole('dialog', { name: 'Day Tasks' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('shows the course and zero-padded day number', () => {
    renderModal({ courseTitle: 'CSS', dayNumber: 3 });

    expect(screen.getByText('CSS-DAY 03')).toBeInTheDocument();
  });

  it('shows the instruction text', () => {
    renderModal();

    expect(screen.getByText('Select a task to open its workspace.')).toBeInTheDocument();
  });
});

describe('TaskModal: task list', () => {
  it('lists every task with its zero-padded number and title', () => {
    renderModal();

    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('Personal Profile Page')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
    expect(screen.getByText('Recipe Card')).toBeInTheDocument();
    expect(screen.getByText('03')).toBeInTheDocument();
    expect(screen.getByText('Accessible Navigation')).toBeInTheDocument();
  });

  it('shows the right status label for each status', () => {
    renderModal();

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });

  it('shows review status tags for approved, pending and rework submissions', () => {
    renderModal({
      tasks: [
        makeTask({
          id: 'approved',
          title: 'Approved task',
          status: 'completed',
          reviewStatus: 'approved',
        }),
        makeTask({
          id: 'pending',
          title: 'Pending task',
          status: 'completed',
          reviewStatus: 'pending',
        }),
        makeTask({
          id: 'rework',
          title: 'Rework task',
          status: 'completed',
          reviewStatus: 'rework',
        }),
      ],
    });

    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Rework')).toBeInTheDocument();
  });

  it('opens the feedback modal from the Rework tag without selecting the task', async () => {
    const reworkTask = makeTask({
      id: 'rework',
      title: 'Rework task',
      status: 'completed',
      reviewStatus: 'rework',
    });
    vi.mocked(getTaskReview).mockResolvedValue({
      reviewStatus: 'rework',
      submissionCount: 2,
      latestReview: {
        id: 'rev-1',
        taskId: 'rework',
        adminId: 'admin-1',
        adminName: 'Mentor Jane',
        submissionNo: 2,
        decision: 'rework',
        feedback: 'Tighten the spacing.',
        reviewedAt: '2026-11-12T10:00:00.000Z',
      },
    });
    const { onSelectTask } = renderModal({ tasks: [reworkTask] });

    fireEvent.click(screen.getByText('Rework'));

    expect(await screen.findByRole('dialog', { name: /Rework task/ })).toBeInTheDocument();
    expect(await screen.findByText('Tighten the spacing.')).toBeInTheDocument();
    expect(onSelectTask).not.toHaveBeenCalled();
  });

  it('shows the stretch badge only on stretch goals', () => {
    renderModal();

    expect(screen.getAllByText('Stretch goal')).toHaveLength(1);

    const stretchButton = screen.getByRole('button', { name: /Accessible Navigation/ });
    expect(stretchButton).toHaveTextContent('Stretch goal');

    const requiredButton = screen.getByRole('button', { name: /Personal Profile Page/ });
    expect(requiredButton).not.toHaveTextContent('Stretch goal');
  });

  it('keeps the tasks in the order they are given', () => {
    renderModal();

    const titles = screen
      .getAllByRole('button', { name: /Personal Profile Page|Recipe Card|Accessible Navigation/ })
      .map((button) => button.textContent ?? '');

    expect(titles[0]).toContain('Personal Profile Page');
    expect(titles[1]).toContain('Recipe Card');
    expect(titles[2]).toContain('Accessible Navigation');
  });

  it('shows an empty message and a zero count when there are no tasks', () => {
    renderModal({ tasks: [] });

    expect(screen.getByText('No tasks are available for this day.')).toBeInTheDocument();
    expect(screen.getByText('0 tasks')).toBeInTheDocument();
  });

  it('uses the singular "task" for exactly one task', () => {
    renderModal({ tasks: [requiredTask] });

    expect(screen.getByText('1 task')).toBeInTheDocument();
  });

  it('uses the plural "tasks" for several tasks', () => {
    renderModal();

    expect(screen.getByText('3 tasks')).toBeInTheDocument();
  });
});

describe('TaskModal: selecting a task', () => {
  it('calls onSelectTask with the task that was clicked', () => {
    const { onSelectTask } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Recipe Card/ }));

    expect(onSelectTask).toHaveBeenCalledTimes(1);
    expect(onSelectTask).toHaveBeenCalledWith(inProgressTask);
  });

  it('does not close the modal by itself when a task is selected', () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Recipe Card/ }));

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('TaskModal: closing', () => {
  it('calls onClose when the close button is clicked', () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Close tasks modal' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', () => {
    const { onClose } = renderModal();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys', () => {
    const { onClose } = renderModal();

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not listen for Escape while it is closed', () => {
    const { onClose } = renderModal({ isOpen: false });

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('stops listening for Escape after it is unmounted', () => {
    const { onClose, unmount } = renderModal();

    unmount();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when the backdrop is pressed', () => {
    const { onClose } = renderModal();

    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when the press happens inside the dialog', () => {
    const { onClose } = renderModal();

    fireEvent.mouseDown(screen.getByRole('dialog'));
    fireEvent.mouseDown(screen.getByText('Day Tasks'));

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('TaskModal: page scroll lock', () => {
  it('locks page scrolling while open', () => {
    renderModal();

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('does not lock page scrolling while closed', () => {
    renderModal({ isOpen: false });

    expect(document.body.style.overflow).toBe('');
  });

  it('unlocks page scrolling when it closes', () => {
    const { rerender, props } = renderModal();

    rerender(<TaskModal {...props} isOpen={false} />);

    expect(document.body.style.overflow).toBe('');
  });

  it('unlocks page scrolling when it is unmounted while open', () => {
    const { unmount } = renderModal();

    unmount();

    expect(document.body.style.overflow).toBe('');
  });
});
