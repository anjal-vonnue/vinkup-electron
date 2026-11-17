import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DesktopApi, WorkspaceApi, WorkspaceEvent } from '@itp/types';
import { taskCodeFixture, taskFixture } from '../../test/fixtures/task';
import { WorkspaceProvider } from '../../pages/TaskPage/state/WorkspaceContext';
import { RunnerProvider, useRunner } from '../runnerContext';
import LocalBrowserRuntime from './LocalBrowserRuntime';

const PREVIEW_URL = 'http://127.0.0.1:4100';

let listeners: Array<(event: WorkspaceEvent) => void> = [];
let workspaceApi: WorkspaceApi;

function RunnerProbe() {
  const { canRun, label, run } = useRunner();
  return (
    <>
      <output data-testid="runner" data-can-run={String(canRun)} data-label={label} />
      <button type="button" onClick={run}>
        probe run
      </button>
    </>
  );
}

function renderRuntime() {
  return render(
    <WorkspaceProvider code={taskCodeFixture}>
      <RunnerProvider>
        <LocalBrowserRuntime task={taskFixture} isVisible />
        <RunnerProbe />
      </RunnerProvider>
    </WorkspaceProvider>
  );
}

function emit(event: WorkspaceEvent): void {
  act(() => {
    for (const listener of listeners) listener(event);
  });
}

beforeEach(() => {
  window.localStorage.clear();
  listeners = [];
  workspaceApi = {
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
    onEvent: (listener) => {
      listeners.push(listener);
      return () => {
        listeners = listeners.filter((candidate) => candidate !== listener);
      };
    },
  };
  window.desktop = { workspace: workspaceApi } as unknown as DesktopApi;
});

afterEach(() => {
  delete (window as { desktop?: DesktopApi }).desktop;
  vi.clearAllMocks();
});

describe('LocalBrowserRuntime', () => {
  it('opens the workspace with the task files and serves the entry over loopback', async () => {
    renderRuntime();

    await waitFor(() => expect(workspaceApi.open).toHaveBeenCalledTimes(1));
    const openArgs = vi.mocked(workspaceApi.open).mock.calls[0]?.[0];
    expect(openArgs?.taskId).toBe('t1');
    expect(typeof openArgs?.files['services.html']).toBe('string');

    const frame = await screen.findByTitle('Preview of services.html');
    const src = frame.getAttribute('src') ?? '';
    expect(src).toContain(`${PREVIEW_URL}/services.html?`);
    expect(src).toContain('run=');
    expect(src).toContain(`parent=${encodeURIComponent(window.location.origin)}`);
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-modals allow-forms');
    await waitFor(() => expect(screen.getByTestId('runner').dataset.canRun).toBe('true'));
  });

  it('adds console messages and DOM readiness from workspace events', async () => {
    const user = userEvent.setup();
    renderRuntime();

    const frame = await screen.findByTitle('Preview of services.html');
    const runId = new URL(frame.getAttribute('src') ?? '').searchParams.get('run') ?? '';
    expect(runId).not.toBe('');

    emit({ type: 'console', taskId: 't1', runId, level: 'error', args: ['boom'], ts: 1 });
    emit({ type: 'preview-ready', taskId: 't1', runId, url: `${PREVIEW_URL}/services.html` });

    expect(await screen.findByText('DOM Ready')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /console/i }));
    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /console/i })).toHaveTextContent('1');
  });

  it('ignores console output from an older run', async () => {
    const user = userEvent.setup();
    renderRuntime();
    await screen.findByTitle('Preview of services.html');

    emit({
      type: 'console',
      taskId: 't1',
      runId: 'stale-run',
      level: 'error',
      args: ['old'],
      ts: 1,
    });
    await user.click(screen.getByRole('tab', { name: /console/i }));

    expect(screen.queryByText('old')).not.toBeInTheDocument();
  });

  it('writes pending editor files before starting a new run', async () => {
    const user = userEvent.setup();
    renderRuntime();
    const firstFrame = await screen.findByTitle('Preview of services.html');
    const firstSrc = firstFrame.getAttribute('src');

    await waitFor(() => expect(screen.getByTestId('runner').dataset.canRun).toBe('true'));
    vi.mocked(workspaceApi.sync).mockClear();
    await user.click(screen.getByRole('button', { name: 'probe run' }));

    await waitFor(() => expect(workspaceApi.sync).toHaveBeenCalled());
    // Run's flush must carry the editor files. A debounced editor sync may land too,
    // so check the contents rather than an exact call count.
    const synced = vi.mocked(workspaceApi.sync).mock.calls.at(-1)?.[0];
    expect(synced?.taskId).toBe('t1');
    expect(typeof synced?.files['services.html']).toBe('string');
    await waitFor(() => {
      const src = screen.getByTitle('Preview of services.html').getAttribute('src');
      expect(src).not.toBe(firstSrc);
    });
  });
});
