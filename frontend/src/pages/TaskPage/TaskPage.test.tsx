import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import TaskPage from './TaskPage';
import { getTask, getTaskCode } from '../../api/tasks';
import { ApiError } from '../../api/errors';
import { taskFixture, taskCodeFixture } from '../../test/fixtures/task';
import { ToastProvider } from '../../components/Toast';

vi.mock('../../context/Useauth', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      name: 'Rahul Sharma',
      email: 'rahul@example.com',
    },
    isLoading: false,
    logout: vi.fn(),
  }),
}));
vi.mock('../../api/tasks');

function renderTaskPage(taskId = 't1') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/tasks/${taskId}`]}>
        <Routes>
          <Route path="/tasks/:taskId" element={<TaskPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
}

describe('TaskPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the task is loading', () => {
    vi.mocked(getTask).mockReturnValue(new Promise(() => {}));
    vi.mocked(getTaskCode).mockReturnValue(new Promise(() => {}));

    renderTaskPage();

    expect(screen.getByRole('status', { name: 'Loading task' })).toBeInTheDocument();
  });

  it('shows a not-found state for a NOT_FOUND error', async () => {
    vi.mocked(getTask).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Task not found.'));
    vi.mocked(getTaskCode).mockResolvedValue(taskCodeFixture);

    renderTaskPage('not-found');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/task not found/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute('href', '/');
  });

  it('shows a generic error state with Retry for an unexpected error', async () => {
    vi.mocked(getTask).mockRejectedValue(
      new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
    );
    vi.mocked(getTaskCode).mockResolvedValue(taskCodeFixture);

    renderTaskPage('error');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('retries loading when Retry is clicked', async () => {
    const user = userEvent.setup();

    vi.mocked(getTask)
      .mockRejectedValueOnce(
        new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
      )
      .mockResolvedValueOnce(taskFixture);

    vi.mocked(getTaskCode).mockResolvedValue(taskCodeFixture);

    renderTaskPage('t1');

    const retryButton = await screen.findByRole('button', { name: /retry/i });
    await user.click(retryButton);

    expect(getTask).toHaveBeenCalledTimes(2);
    expect(getTaskCode).toHaveBeenCalledTimes(2);

    // TaskWorkspace renders on success, so the Back button is the reliable signal.
    expect(await screen.findByRole('button', { name: /back to tasks/i })).toBeInTheDocument();
  });

  it('renders the workspace on successful load', async () => {
    vi.mocked(getTask).mockResolvedValue(taskFixture);
    vi.mocked(getTaskCode).mockResolvedValue(taskCodeFixture);

    renderTaskPage('t1');

    expect(await screen.findByRole('button', { name: /back to tasks/i })).toBeInTheDocument();
    expect(screen.getByText('Est: 50 min')).toBeInTheDocument();
  });

  it('shows a locked state without Retry for a DAY_LOCKED error', async () => {
    vi.mocked(getTask).mockRejectedValue(
      new ApiError(403, 'DAY_LOCKED', 'Finish the previous day first.')
    );
    vi.mocked(getTaskCode).mockResolvedValue(taskCodeFixture);

    renderTaskPage('locked');

    expect(await screen.findByRole('heading', { name: /this day is locked/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('shows the task breadcrumb in the header once loaded', async () => {
    vi.mocked(getTask).mockResolvedValue(taskFixture);
    vi.mocked(getTaskCode).mockResolvedValue(taskCodeFixture);

    renderTaskPage();

    expect(await screen.findByText('Task 7')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });

  it('shows the app name in the header when the task could not load', async () => {
    vi.mocked(getTask).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Task not found.'));
    vi.mocked(getTaskCode).mockResolvedValue(taskCodeFixture);

    renderTaskPage('not-found');

    const brand = await screen.findByText('Vink');
    expect(brand).toHaveTextContent('VinkUp');
  });

  it('sets the browser tab title while the task is open', async () => {
    vi.mocked(getTask).mockResolvedValue(taskFixture);
    vi.mocked(getTaskCode).mockResolvedValue(taskCodeFixture);

    const { unmount } = renderTaskPage();

    await screen.findByRole('button', { name: /back to tasks/i });
    expect(document.title).toBe('Services Grid Layout · Task 7');

    unmount();
    expect(document.title).not.toBe('Services Grid Layout · Task 7');
  });
});
