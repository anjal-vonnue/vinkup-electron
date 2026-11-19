// @vitest-environment jsdom

import type { ChangeEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';

import Header from '../components/Header';
import TaskPage from '../pages/TaskPage';
import { ToastProvider } from '../components/Toast';
import { WorkspaceSessionProvider } from '../context/WorkspaceSessionContext';
import { WorkspaceAwareHome } from './WorkspaceAwareHome';
import { getTask, getTaskCode, saveTaskCode, submitTask } from '../api/tasks';
import { ApiError } from '../api/errors';
import {
  nodeTaskCodeFixture,
  nodeTaskFixture,
  taskCodeFixture,
  taskFixture,
} from '../test/fixtures/task';

vi.mock('../api/tasks');
vi.mock('../api/activity', () => ({
  logFlagEvent: vi.fn(),
  postActivityTime: vi.fn(),
  postActivityTimeOnExit: vi.fn(),
}));
vi.mock('../context/Useauth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Test Trainee', email: 'trainee@example.com', role: 'trainee' },
    isLoading: false,
    logout: vi.fn(),
  }),
}));

// The global Monaco stub is uncontrolled; this one reads from workspace state so a
// remounted workspace can be checked for its in-progress (unsaved) file content.
vi.mock('../components/CodeEditor', async () => {
  const { createElement } = await import('react');
  const { useWorkspaceState } = await import('../pages/TaskPage/state/WorkspaceContext');

  function CodeEditorStub({
    path,
    onChange,
  }: {
    path: string;
    onChange: (path: string, content: string) => void;
  }) {
    const state = useWorkspaceState();
    return createElement('textarea', {
      'aria-label': `${path} code editor`,
      value: state.files[path] ?? '',
      onChange: (event: ChangeEvent<HTMLTextAreaElement>) => onChange(path, event.target.value),
    });
  }

  return { default: CodeEditorStub };
});

const DRAFT = '<h1>Unsaved draft</h1>';

function HomeStub() {
  const navigate = useNavigate();
  return (
    <>
      <Header />
      <main data-testid="home-page">
        <h1>Home dashboard</h1>
        <button type="button" onClick={() => void navigate('/tasks/t1')}>
          Open first task
        </button>
        <button type="button" onClick={() => void navigate('/tasks/t2')}>
          Open second task
        </button>
      </main>
    </>
  );
}

function SectionStub({ name }: { name: string }) {
  const navigate = useNavigate();
  return (
    <>
      <Header />
      <main data-testid={`section-${name.toLowerCase().replace(/\s+/g, '-')}`}>
        <h1>{name} section</h1>
        <button type="button" onClick={() => void navigate('/tasks/t2')}>
          Open second task
        </button>
      </main>
    </>
  );
}

/** Mirrors the trainee routes from App.tsx; section pages are stubs so tests stay focused. */
function renderApp() {
  return render(
    <ToastProvider>
      <WorkspaceSessionProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route
              path="/"
              element={
                <WorkspaceAwareHome>
                  <HomeStub />
                </WorkspaceAwareHome>
              }
            />
            <Route path="/tasks/:taskId" element={<TaskPage />} />
            <Route path="/resources" element={<SectionStub name="Resources" />} />
            <Route path="/typing-test" element={<SectionStub name="Typing Test" />} />
            <Route path="/journal" element={<SectionStub name="Journal" />} />
            <Route path="/days/:dayId" element={<SectionStub name="Day overview" />} />
          </Routes>
        </MemoryRouter>
      </WorkspaceSessionProvider>
    </ToastProvider>
  );
}

async function openFirstTask(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Open first task' }));
  await screen.findByRole('button', { name: /back to tasks/i });
}

async function editActiveFile(value: string) {
  const editor = await screen.findByRole('textbox', { name: 'services.html code editor' });
  fireEvent.change(editor, { target: { value } });
}

async function navigateBackHome(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('link', { name: 'Home' }));
}

describe('workspace navigation (trainee)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(getTask).mockImplementation((taskId) =>
      Promise.resolve(
        taskId === 't2' || taskId === nodeTaskFixture.id ? nodeTaskFixture : taskFixture
      )
    );
    vi.mocked(getTaskCode).mockImplementation((taskId) =>
      Promise.resolve(
        taskId === 't2' || taskId === nodeTaskFixture.id ? nodeTaskCodeFixture : taskCodeFixture
      )
    );
    vi.mocked(saveTaskCode).mockResolvedValue(undefined);
    vi.mocked(submitTask).mockResolvedValue({
      status: 'completed',
      submittedAt: new Date(2026, 8, 28, 14, 32).toISOString(),
      reviewStatus: 'pending',
      submissionCount: 1,
    });
  });

  it.each([
    ['Resources', 'section-resources'],
    ['Typing Test', 'section-typing-test'],
    ['Journal', 'section-journal'],
  ])('restores the workspace after visiting %s and returning Home', async (link, sectionTestId) => {
    const user = userEvent.setup();
    renderApp();

    await openFirstTask(user);
    await editActiveFile(DRAFT);

    await user.click(screen.getByRole('link', { name: link }));
    expect(await screen.findByTestId(sectionTestId)).toBeInTheDocument();

    await navigateBackHome(user);

    expect(await screen.findByRole('button', { name: /back to tasks/i })).toBeInTheDocument();
    expect(screen.getByText('Task 7')).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'services.html code editor' })).toHaveValue(
      DRAFT
    );
  });

  it('preserves the workspace through several sections before returning Home', async () => {
    const user = userEvent.setup();
    renderApp();

    await openFirstTask(user);
    await editActiveFile(DRAFT);

    for (const [link, sectionTestId] of [
      ['Resources', 'section-resources'],
      ['Typing Test', 'section-typing-test'],
      ['Journal', 'section-journal'],
    ]) {
      await user.click(screen.getByRole('link', { name: link }));
      await screen.findByTestId(sectionTestId);
    }

    await navigateBackHome(user);

    expect(await screen.findByRole('textbox', { name: 'services.html code editor' })).toHaveValue(
      DRAFT
    );
    expect(screen.getByTestId('sidebar-pane')).toBeInTheDocument();
  });

  it('keeps pane and file-tab state when the workspace is restored', async () => {
    const user = userEvent.setup();
    renderApp();

    await openFirstTask(user);
    await user.click(screen.getByRole('button', { name: /^code$/i }));
    expect(screen.getByTestId('code-pane').className).toMatch(/paneHidden/);

    await user.click(screen.getByRole('link', { name: 'Journal' }));
    await screen.findByTestId('section-journal');
    await navigateBackHome(user);

    expect((await screen.findByTestId('code-pane')).className).toMatch(/paneHidden/);
    expect(screen.getAllByText('services.html').length).toBeGreaterThan(0);
  });

  it('shows the default Home after the workspace Home button, and keeps it on later visits', async () => {
    const user = userEvent.setup();
    renderApp();

    await openFirstTask(user);
    await editActiveFile(DRAFT);
    await navigateBackHome(user);

    expect(await screen.findByTestId('home-page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back to tasks/i })).not.toBeInTheDocument();

    await navigateBackHome(user);
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back to tasks/i })).not.toBeInTheDocument();
  });

  it('opens a new workspace normally after an intentional exit', async () => {
    const user = userEvent.setup();
    renderApp();

    await openFirstTask(user);
    await navigateBackHome(user);
    await screen.findByTestId('home-page');

    await user.click(screen.getByRole('button', { name: 'Open second task' }));
    expect(await screen.findByRole('button', { name: /back to tasks/i })).toBeInTheDocument();
    expect(screen.getByText('Task 1')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Resources' }));
    await screen.findByTestId('section-resources');
    await navigateBackHome(user);

    expect(await screen.findByText('Task 1')).toBeInTheDocument();
    expect(screen.queryByText('Task 7')).not.toBeInTheDocument();
  });

  it('switches the preserved workspace when a different task is opened from a section', async () => {
    const user = userEvent.setup();
    renderApp();

    await openFirstTask(user);
    await user.click(screen.getByRole('link', { name: 'Journal' }));
    await screen.findByTestId('section-journal');

    await user.click(screen.getByRole('button', { name: 'Open second task' }));
    await screen.findByRole('button', { name: /back to tasks/i });
    expect(screen.getByText('Task 1')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Resources' }));
    await screen.findByTestId('section-resources');
    await navigateBackHome(user);

    expect(await screen.findByText('Task 1')).toBeInTheDocument();
    expect(screen.queryByText('Task 7')).not.toBeInTheDocument();
  });

  it('drops a stale session when the preserved task can no longer be opened', async () => {
    const user = userEvent.setup();
    renderApp();

    await openFirstTask(user);
    await user.click(screen.getByRole('link', { name: 'Journal' }));
    await screen.findByTestId('section-journal');
    vi.mocked(getTask).mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'Task not found.'));

    await navigateBackHome(user);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await navigateBackHome(user);
    expect(await screen.findByTestId('home-page')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the preserved workspace on Back to tasks', async () => {
    const user = userEvent.setup();
    renderApp();

    await openFirstTask(user);
    await user.click(screen.getByRole('button', { name: /back to tasks/i }));

    expect(await screen.findByText('Day overview section')).toBeInTheDocument();
    await navigateBackHome(user);

    expect(await screen.findByTestId('home-page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back to tasks/i })).not.toBeInTheDocument();
  });

  it('still submits from a restored workspace', async () => {
    const user = userEvent.setup();
    renderApp();

    await openFirstTask(user);
    await user.click(screen.getByRole('link', { name: 'Typing Test' }));
    await screen.findByTestId('section-typing-test');
    await navigateBackHome(user);
    await screen.findByRole('button', { name: /back to tasks/i });

    await user.click(screen.getByRole('button', { name: /submit task/i }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(submitTask).toHaveBeenCalledWith(taskFixture.id);
    expect(await screen.findByText('Task submitted')).toBeInTheDocument();
  });
});
