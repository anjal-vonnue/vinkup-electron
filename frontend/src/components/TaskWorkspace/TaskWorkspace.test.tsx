// @vitest-environment jsdom

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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
import { RealtimeProvider } from '../../context/RealtimeProvider';
import { installFakeEventSource } from '../../test/fakeEventSource';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };

  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };

  Element.prototype.scrollIntoView = vi.fn();
});

vi.mock('../../api/tasks');

vi.mock('../../lib/monacoSetup', () => ({
  applyRuntimeSettings: vi.fn(),
}));

vi.mock('../../pages/TaskPage/hooks/useMonacoModels', () => ({
  useMonacoModels: vi.fn(),
}));

vi.mock('../CodeEditor', () => ({
  default: ({
    path,
    onChange,
  }: {
    path: string;
    onChange: (path: string, content: string) => void;
  }) => (
    <textarea
      aria-label={`${path} code editor`}
      defaultValue=""
      onChange={(event) => onChange(path, event.target.value)}
    />
  ),
}));

const PREVIEW_URL = 'http://127.0.0.1:4100';

const navigateMock = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');

  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

/**
 * Installs the desktop workspace API exposed by Electron preload.
 */
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
    getEnvironment: vi.fn(() =>
      Promise.resolve({
        nodeVersion: '24.0.0',
        error: null,
      })
    ),
    onEvent: () => () => {},
  };

  window.desktop = {
    workspace: api,
  } as unknown as DesktopApi;

  return api;
}

/**
 * Renders TaskWorkspace with all required providers.
 */
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
    vi.mocked(submitTask).mockReset();

    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();

    delete (window as { desktop?: DesktopApi }).desktop;
  });

  it('renders sidebar and code panes by default, with the result pane mounted but hidden', () => {
    renderWorkspace();

    expect(screen.getByTestId('sidebar-pane')).toBeInTheDocument();
    expect(screen.getByTestId('code-pane')).toBeInTheDocument();

    expect(screen.getByTestId('result-pane').className).toMatch(/paneHidden/);
  });

  it('shows the result pane when Run is clicked', async () => {
    const user = userEvent.setup();

    installWorkspaceApi();
    renderWorkspace();

    const runButton = screen.getByRole('button', {
      name: /^run$/i,
    });

    await waitFor(() => {
      expect(runButton).toBeEnabled();
    });

    await user.click(runButton);

    expect(screen.getByTestId('result-pane').className).not.toMatch(/paneHidden/);
  });

  it('opens the host workspace and shows the preview when Run is clicked', async () => {
    const user = userEvent.setup();
    const api = installWorkspaceApi();

    renderWorkspace();

    await waitFor(() => {
      expect(api.open).toHaveBeenCalledTimes(1);
    });

    const openArgs = vi.mocked(api.open).mock.calls[0]?.[0];

    expect(openArgs?.taskId).toBe(taskFixture.id);

    const runButton = screen.getByRole('button', {
      name: /^run$/i,
    });

    await waitFor(() => {
      expect(runButton).toBeEnabled();
    });

    await user.click(runButton);

    // RuntimeHost is not mocked, so this checks the actual preview integration.
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

    await user.click(
      screen.getByRole('button', {
        name: /^code$/i,
      })
    );

    expect(screen.getByTestId('code-pane').className).toMatch(/paneHidden/);

    expect(
      screen.getByRole('textbox', {
        name: /code editor$/i,
      })
    ).toBeInTheDocument();
  });

  it('flushes and navigates to the day page on Back', async () => {
    const user = userEvent.setup();

    renderWorkspace();

    await user.click(
      screen.getByRole('button', {
        name: /back to tasks/i,
      })
    );

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(`/days/${taskFixture.day.id}`);
    });
  });

  it('shows the leave-anyway confirm dialog when flush fails on Back, and does not navigate', async () => {
    const user = userEvent.setup();

    vi.mocked(saveTaskCode).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Boom'));

    renderWorkspace();

    await user.type(
      screen.getByRole('textbox', {
        name: /code editor$/i,
      }),
      'x'
    );

    await user.click(
      screen.getByRole('button', {
        name: /back to tasks/i,
      })
    );

    expect(
      await screen.findByRole('heading', {
        name: /latest changes aren.t saved/i,
      })
    ).toBeInTheDocument();

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('calls flush (saves) on Ctrl+S', async () => {
    const user = userEvent.setup();

    vi.mocked(saveTaskCode).mockResolvedValue(undefined);

    renderWorkspace();

    await user.type(
      screen.getByRole('textbox', {
        name: /code editor$/i,
      }),
      'x'
    );

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

    await user.click(
      screen.getByRole('button', {
        name: /submit task/i,
      })
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Submit',
      })
    );

    expect(submitTask).toHaveBeenCalledWith(taskFixture.id);

    expect(await screen.findByText('Task submitted')).toBeInTheDocument();

    expect(screen.getByText('Submitted 14:32')).toBeInTheDocument();

    expect(
      screen.getByRole('button', {
        name: /resubmit/i,
      })
    ).toBeEnabled();
  });

  it('shows Submitted and Resubmit from the start for a completed task', () => {
    renderWorkspace({
      ...taskFixture,
      status: 'completed',
    });

    expect(screen.getByText('Submitted')).toBeInTheDocument();

    expect(
      screen.getByRole('button', {
        name: /resubmit/i,
      })
    ).toBeInTheDocument();
  });

  it('shows Approved without a reload when the mentor approves over the realtime stream', async () => {
    const fake = installFakeEventSource();
    const pendingTask = {
      ...taskFixture,
      status: 'completed' as const,
      reviewStatus: 'pending' as const,
    };

    render(
      <MemoryRouter>
        <RealtimeProvider enabled>
          <ToastProvider>
            <WorkspaceProvider code={taskCodeFixture}>
              <EditorProvider>
                <RunnerProvider>
                  <TaskWorkspace task={pendingTask} />
                </RunnerProvider>
              </EditorProvider>
            </WorkspaceProvider>
          </ToastProvider>
        </RealtimeProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Submitted')).toBeInTheDocument();

    act(() =>
      fake.source?.emit({
        type: 'task.reviewed',
        taskId: taskFixture.id,
        taskTitle: taskFixture.title,
        decision: 'approved',
        reviewStatus: 'approved',
        submissionNo: 1,
        feedback: '',
        mentorName: 'Mentor Maya',
        reviewedAt: '2026-11-18T10:00:00.000Z',
      })
    );

    // The page updates from the event; the app-wide toast is covered by
    // RealtimeNotifications.test.tsx.
    // The toolbar button turns into the disabled "Approved" state once the task is approved.
    expect(await screen.findByRole('button', { name: /^approved$/i })).toBeDisabled();
  });
});
