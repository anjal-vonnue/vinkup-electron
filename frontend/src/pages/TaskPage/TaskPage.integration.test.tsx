import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import TaskPage from './TaskPage';
import { getTask, getTaskCode, saveTaskCode, submitTask } from '../../api/tasks';
import { taskFixture, taskCodeFixture } from '../../test/fixtures/task';
import { ToastProvider } from '../../components/Toast';

// Only the API layer is faked; the page, autosave, toolbar and dialog are real.
vi.mock('../../api/tasks');
vi.mock('../../api/activity');
// Header needs a logged-in user  this is context, not an API call.
vi.mock('../../context/Useauth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Rahul Sharma', email: 'rahul@example.com' },
    isLoading: false,
    logout: vi.fn(),
  }),
}));

const SAVE_TAKES_MS = 500;

function renderTaskPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/tasks/t1']}>
        <Routes>
          <Route path="/tasks/:taskId" element={<TaskPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
}

describe('TaskPage (integration): edit, autosave, submit', () => {
  const events: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    events.length = 0;
    vi.mocked(getTask).mockResolvedValue(taskFixture);
    vi.mocked(getTaskCode).mockResolvedValue(taskCodeFixture);
    vi.mocked(saveTaskCode).mockImplementation(() => {
      events.push('save started');
      return new Promise((resolve) =>
        setTimeout(() => {
          events.push('save settled');
          resolve();
        }, SAVE_TAKES_MS)
      );
    });
    vi.mocked(submitTask).mockImplementation((taskId) => {
      events.push(`submit ${taskId}`);
      return Promise.resolve({
        status: 'completed',
        submittedAt: new Date().toISOString(),
        reviewStatus: 'pending',
        submissionCount: 1,
      });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves the edit before submitting, then shows the Submitted pill', async () => {
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    renderTaskPage();

    const editor = await screen.findByRole('textbox', { name: 'services.html code editor' });
    fireEvent.change(editor, { target: { value: '<h1>Edited</h1>' } });

    // Autosave waits 2 s after the last keystroke.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(saveTaskCode).toHaveBeenCalledTimes(1);
    const [taskId, body] = vi.mocked(saveTaskCode).mock.calls[0];
    expect(taskId).toBe('t1');
    expect(body.files.find((file) => file.path === 'services.html')?.content).toBe(
      '<h1>Edited</h1>'
    );

    // Submit while that save is still in flight: submit must wait for it.
    await user.click(screen.getByRole('button', { name: /submit task/i }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_TAKES_MS * 3);
    });

    // Every save that started has settled before submitTask is called. (flush() currently
    const submitIndex = events.indexOf('submit t1');
    expect(submitIndex).toBeGreaterThan(0);
    const beforeSubmit = events.slice(0, submitIndex);
    expect(beforeSubmit.filter((e) => e === 'save started').length).toBe(
      beforeSubmit.filter((e) => e === 'save settled').length
    );
    expect(events.slice(submitIndex + 1)).toEqual([]);
    for (const [, sent] of vi.mocked(saveTaskCode).mock.calls) {
      expect(sent.files.find((file) => file.path === 'services.html')?.content).toBe(
        '<h1>Edited</h1>'
      );
    }
    expect(await screen.findByText(/^Submitted \d\d:\d\d$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resubmit/i })).toBeInTheDocument();
  });
});
