import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { DesktopApi, WorkspaceApi } from '@itp/types';
import type { WorkspaceState } from '../types/workspaceTypes';
import { WorkspaceSessionProvider, useWorkspaceSession } from './WorkspaceSessionContext';

let close: ReturnType<typeof vi.fn>;

const state = {} as WorkspaceState;

function renderSession() {
  return renderHook(() => useWorkspaceSession(), { wrapper: WorkspaceSessionProvider });
}

beforeEach(() => {
  close = vi.fn(() => Promise.resolve());
  window.desktop = {
    workspace: { close } as unknown as WorkspaceApi,
  } as unknown as DesktopApi;
});

afterEach(() => {
  delete (window as { desktop?: DesktopApi }).desktop;
  vi.clearAllMocks();
});

describe('WorkspaceSessionContext', () => {
  it('keeps the desktop workspace open while only the snapshot is remembered', () => {
    const { result } = renderSession();

    act(() => result.current.rememberWorkspace('t1', state));

    expect(result.current.activeTaskId).toBe('t1');
    expect(close).not.toHaveBeenCalled();
  });

  it('closes the desktop workspace when the trainee leaves it explicitly', () => {
    const { result } = renderSession();

    act(() => result.current.rememberWorkspace('t1', state));
    act(() => result.current.exitWorkspace());

    expect(result.current.activeTaskId).toBeNull();
    expect(close).toHaveBeenCalledExactlyOnceWith('t1');
  });

  it('closes the previous workspace when a different task takes over', () => {
    const { result } = renderSession();

    act(() => result.current.rememberWorkspace('t1', state));
    act(() => result.current.rememberWorkspace('t2', state));

    expect(result.current.activeTaskId).toBe('t2');
    expect(close).toHaveBeenCalledExactlyOnceWith('t1');
  });

  it('works without the desktop API', () => {
    delete (window as { desktop?: DesktopApi }).desktop;
    const { result } = renderSession();

    act(() => result.current.rememberWorkspace('t1', state));

    expect(() => act(() => result.current.exitWorkspace())).not.toThrow();
  });
});
