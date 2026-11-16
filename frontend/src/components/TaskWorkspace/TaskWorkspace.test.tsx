import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { DesktopApi, WorkspaceApi } from '@itp/types';
import TaskWorkspace from './TaskWorkspace';
import { WorkspaceProvider } from '../../pages/TaskPage/state/WorkspaceContext';
import { EditorProvider } from '../../pages/TaskPage/state/EditorContext';
import { RunnerProvider } from '../../runtimes/runnerContext';
import { ToastProvider } from '../../components/Toast';
import { taskFixture, taskCodeFixture } from '../../test/fixtures/task';
import { saveTaskCode, submitTask } from '../../api/tasks';
import { ApiError } from '../../api/errors';

vi.mock('../../api/tasks');

const PREVIEW_URL = 'http://127.0.0.1:4100';

/** The host workspace API the desktop preload exposes; the Run button needs it to enable. */
function installWorkspaceApi(): WorkspaceApi {
  const api: WorkspaceApi = {
    open: vi.fn(() =>
      Promise.resolve({
        previewUrl: PREVIEW_URL,
        nodeVersion: '24.0.0',
        error: null,
      })
    ),
    sync: vi.fn(() => Promise.resolve()),
    reload: vi.fn(() => Promise.resolve({})),
    close: vi.fn(() => Promise.resolve()),
    getEnvironment: vi.fn(() => Promise.resolve({ nodeVersion: '24.0.0', error: null })),
    onEvent: () => () => {},
  };
  window.desktop = { workspace: api } as unknown as DesktopApi;
  return api;
}

const navigateMock = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => navigateMock };
});

function renderWorkspace(task = taskFixture) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <WorkspaceProvider code={taskCodeFixture}>
          <EditorProvider>
            <RunnerProvider>
              <TaskWorkspace task={task} />
            </RunnerProvider>
          </EditorProvider>
        </WorkspaceProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('TaskWorkspace', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    vi.mocked(saveTaskCode).mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    delete (window as { desktop?: DesktopApi }).desktop;
  });

  it('renders sidebar and code panes by default, with the result pane mounted but hidden', () => {
    renderWorkspace();
    expect(screen.getByTestId('sidebar-pane')).toBeInTheDocument();
    expect(screen.getByTestId('code-pane')).toBeInTheDocument();
    // Always mounted (so the node runtime's terminal/server survive being
    // hidden) — jsdom here doesn't load real CSS, so assert the hiding class.
    expect(screen.getByTestId('result-pane').className).toMatch(/paneHidden/);
  });

  it('shows the result pane when Run is clicked', async () => {
    const user = userEvent.setup();
    installWorkspaceApi();
    renderWorkspace();
    const run = screen.getByRole('button', { name: /run/i });
    await waitFor(() => expect(run).toBeEnabled());
    await user.click(run);
    expect(screen.getByTestId('result-pane').className).not.toMatch(/paneHidden/);
  });

  it('opens the host workspace and shows the preview when Run is clicked', async () => {
    const user = userEvent.setup();
    const api = installWorkspaceApi();
    renderWorkspace();

    await waitFor(() => expect(api.open).toHaveBeenCalledTimes(1));
    const openArgs = vi.mocked(api.open).mock.calls[0]?.[0];
    expect(openArgs?.taskId).toBe(taskFixture.id);

    const run = screen.getByRole('button', { name: /run/i });
    await waitFor(() => expect(run).toBeEnabled());
    // The preview only starts when the Result pane is shown.
    expect(screen.queryByTitle('Preview of services.html')).not.toBeInTheDocument();

    await user.click(run);
    expect(await screen.findByTitle('Preview of services.html')).toBeInTheDocument();
  });

  it('Ctrl+Enter runs, even outside the editor', async () => {
    const user = userEvent.setup();
    installWorkspaceApi();
    renderWorkspace();

    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(screen.getByTestId('result-pane').className).not.toMatch(/paneHidden/);
    expect(await screen.findByTitle('Preview of services.html')).toBeInTheDocument();
  });

  it('keeps the editor mounted but hidden when Code is toggled off', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getByRole('button', { name: /^code$/i }));
    // jsdom in this test setup doesn't load real CSS, so `toBeVisible()` can't see
    // the display:none rule — assert the hiding class was applied instead, and that
    // the pane (with the editor inside it) is still mounted, not unmounted.
    expect(screen.getByTestId('code-pane').className).toMatch(/paneHidden/);
    expect(screen.getByLabelText('services.html code editor')).toBeInTheDocument();
  });

  it('flushes and navigates to the day page on Back', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getByRole('button', { name: /back to tasks/i }));
    expect(navigateMock).toHaveBeenCalledWith(`/days/${taskFixture.day.id}`);
  });

  it('shows the leave-anyway confirm dialog when flush fails on Back, and does not navigate', async () => {
    const user = userEvent.setup();
    vi.mocked(saveTaskCode).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Boom'));
    renderWorkspace();

    await user.type(screen.getByLabelText('services.html code editor'), 'x');
    await user.click(screen.getByRole('button', { name: /back to tasks/i }));

    expect(
      await screen.findByRole('heading', { name: /latest changes aren.t saved/i })
    ).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('calls flush (saves) on Ctrl+S', async () => {
    const user = userEvent.setup();
    vi.mocked(saveTaskCode).mockResolvedValue(undefined);
    renderWorkspace();

    await user.type(screen.getByLabelText('services.html code editor'), 'x');
    await user.keyboard('{Control>}s{/Control}');

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(saveTaskCode).toHaveBeenCalled();
  });

  it('submits: shows the toast and the Submitted pill, and the button reads Resubmit', async () => {
    const user = userEvent.setup();
    vi.mocked(submitTask).mockResolvedValue({
      status: 'completed',
      submittedAt: new Date(2026, 8, 28, 14, 32).toISOString(),
      reviewStatus: 'pending',
      submissionCount: 1,
    });
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: /submit task/i }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(submitTask).toHaveBeenCalledWith(taskFixture.id);
    expect(await screen.findByText('Task submitted')).toBeInTheDocument();
    expect(screen.getByText('Submitted 14:32')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resubmit/i })).toBeEnabled();
  });

  it('shows Submitted and Resubmit from the start for a completed task', () => {
    renderWorkspace({ ...taskFixture, status: 'completed' });

    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resubmit/i })).toBeInTheDocument();
  });
});
