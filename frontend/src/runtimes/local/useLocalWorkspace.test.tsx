import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { DesktopApi, WorkspaceApi } from '@itp/types';
import { taskCodeFixture } from '../../test/fixtures/task';
import { WorkspaceProvider } from '../../pages/TaskPage/state/WorkspaceContext';
import { WorkspaceSessionProvider } from '../../context/WorkspaceSessionContext';
import { useLocalWorkspace } from './useLocalWorkspace';

let workspaceApi: WorkspaceApi;
let close: ReturnType<typeof vi.fn>;

function renderWorkspace() {
  return renderHook(() => useLocalWorkspace('t1'), {
    wrapper: ({ children }) => (
      <WorkspaceSessionProvider>
        <WorkspaceProvider code={taskCodeFixture}>{children}</WorkspaceProvider>
      </WorkspaceSessionProvider>
    ),
  });
}

beforeEach(() => {
  close = vi.fn(() => Promise.resolve());
  workspaceApi = {
    open: vi.fn(() =>
      Promise.resolve({
        previewUrl: 'http://127.0.0.1:4100',
        nodeVersion: '24.0.0',
        error: null,
      })
    ),
    sync: vi.fn(() => Promise.resolve()),
    reload: vi.fn(() => Promise.resolve({})),
    close: close as unknown as WorkspaceApi['close'],
    getEnvironment: vi.fn(() => Promise.resolve({ nodeVersion: '24.0.0', error: null })),
    onEvent: () => () => undefined,
  };
  window.desktop = { workspace: workspaceApi } as unknown as DesktopApi;
});

afterEach(() => {
  delete (window as { desktop?: DesktopApi }).desktop;
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe('useLocalWorkspace', () => {
  it('opens the host workspace for the task', async () => {
    const { result } = renderWorkspace();

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(workspaceApi.open).toHaveBeenCalledTimes(1);
    expect(vi.mocked(workspaceApi.open).mock.calls[0]?.[0].taskId).toBe('t1');
    expect(result.current.previewUrl).toBe('http://127.0.0.1:4100');
  });

  it('keeps the host workspace open when only the page unmounts', async () => {
    const { result, unmount } = renderWorkspace();

    await waitFor(() => expect(result.current.status).toBe('ready'));
    unmount();

    // Ordinary navigation (Resources, Journal, …) must not remove node_modules.
    expect(close).not.toHaveBeenCalled();
  });
});
