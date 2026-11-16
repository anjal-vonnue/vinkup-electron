import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { DesktopApi, TerminalApi, WorkspaceApi, WorkspaceEvent } from '@itp/types';
import type { Terminal as XTerminal } from '@xterm/xterm';
import { useLocalNodeSession } from './useLocalNodeSession';

let listeners: Array<(event: WorkspaceEvent) => void> = [];
let dataListeners: Array<(event: { terminalId: string; data: string }) => void> = [];
let inputListeners: Array<(data: string) => void> = [];
let terminalApi: TerminalApi;
let workspaceApi: WorkspaceApi;
let install: ReturnType<typeof vi.fn>;
let dev: ReturnType<typeof vi.fn>;
let openTerminal = vi.fn(() => Promise.resolve({ terminalId: 'term-1' }));

const terminalWrite = vi.fn();
const terminal = {
  cols: 80,
  rows: 24,
  write: terminalWrite,
  onData: (listener: (data: string) => void) => {
    inputListeners.push(listener);
    return {
      dispose: () => {
        inputListeners = inputListeners.filter((candidate) => candidate !== listener);
      },
    };
  },
} as unknown as XTerminal;

function emit(event: WorkspaceEvent): void {
  act(() => {
    for (const listener of listeners) listener(event);
  });
}

function type(data: string): void {
  act(() => {
    for (const listener of inputListeners) listener(data);
  });
}

beforeEach(() => {
  listeners = [];
  dataListeners = [];
  inputListeners = [];
  install = vi.fn(() => Promise.resolve());
  dev = vi.fn(() => Promise.resolve());
  openTerminal = vi.fn(() => Promise.resolve({ terminalId: 'term-1' }));

  terminalApi = {
    open: openTerminal,
    write: vi.fn(() => Promise.resolve()),
    resize: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    onData: (listener) => {
      dataListeners.push(listener);
      return () => {
        dataListeners = dataListeners.filter((candidate) => candidate !== listener);
      };
    },
    onExit: () => () => undefined,
  };

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
    close: vi.fn(() => Promise.resolve()),
    getEnvironment: vi.fn(() => Promise.resolve({ nodeVersion: '24.0.0', error: null })),
    onEvent: (listener) => {
      listeners.push(listener);
      return () => {
        listeners = listeners.filter((candidate) => candidate !== listener);
      };
    },
  };

  window.desktop = {
    terminal: terminalApi,
    workspace: workspaceApi,
    run: { install, dev, stop: vi.fn(() => Promise.resolve()) },
  } as unknown as DesktopApi;
});

afterEach(() => {
  delete (window as { desktop?: DesktopApi }).desktop;
  vi.clearAllMocks();
});

const files = {
  'package.json': '{"dependencies":{"express":"1.0.0"}}',
  'index.js': 'console.log("hi")',
};

describe('useLocalNodeSession', () => {
  it('opens a shell, installs dependencies and reports readiness', async () => {
    const { result } = renderHook(() =>
      useLocalNodeSession({
        taskId: 't1',
        enabled: true,
        terminal,
        files,
        blockedError: null,
      })
    );

    await waitFor(() => expect(terminalApi.open).toHaveBeenCalled());
    await waitFor(() => expect(install).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(result.current.status).toBe('installing'));

    act(() => {
      for (const listener of dataListeners) listener({ terminalId: 'term-1', data: 'hello\r\n' });
    });
    expect(terminalWrite).toHaveBeenCalledWith('hello\r\n');

    emit({ type: 'run-output', taskId: 't1', kind: 'install', stream: 'stdout', data: 'added 1' });
    expect(terminalWrite).toHaveBeenCalledWith('added 1');

    emit({ type: 'run-exited', taskId: 't1', kind: 'install', exitCode: 0 });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    emit({ type: 'server-ready', taskId: 't1', port: 5173, url: 'http://localhost:5173' });
    await waitFor(() =>
      expect(result.current.server).toEqual({ port: 5173, url: 'http://localhost:5173' })
    );

    act(() => result.current.resize(100, 40));
    expect(terminalApi.resize).toHaveBeenCalledWith('term-1', 100, 40);

    act(() => result.current.runCommand('npm run dev'));
    expect(dev).toHaveBeenCalledWith('t1', 'npm run dev');

    emit({ type: 'server-closed', taskId: 't1', port: 1234 });
    expect(result.current.server).not.toBeNull();
    emit({ type: 'server-closed', taskId: 't1', port: 5173 });
    expect(result.current.server).toBeNull();
  });

  it('sends keystrokes to the host shell', async () => {
    renderHook(() =>
      useLocalNodeSession({
        taskId: 't1',
        enabled: true,
        terminal,
        files,
        blockedError: null,
      })
    );
    await waitFor(() => expect(terminalApi.open).toHaveBeenCalled());

    type('npm test');
    type('\r');

    expect(terminalApi.write).toHaveBeenCalledWith('term-1', 'npm test');
    expect(terminalApi.write).toHaveBeenCalledWith('term-1', '\r');
  });

  it('queues keys typed before the shell is ready and sends them on open', async () => {
    let resolveOpen: (value: { terminalId: string }) => void = () => undefined;
    openTerminal.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOpen = resolve;
      })
    );

    renderHook(() =>
      useLocalNodeSession({
        taskId: 't1',
        enabled: true,
        terminal,
        files,
        blockedError: null,
      })
    );
    await waitFor(() => expect(terminalApi.open).toHaveBeenCalled());

    type('ls\r');
    expect(terminalApi.write).not.toHaveBeenCalled();

    act(() => {
      resolveOpen({ terminalId: 'term-1' });
    });

    await waitFor(() => expect(terminalApi.write).toHaveBeenCalledWith('term-1', 'ls\r'));
  });

  it('skips npm install when package.json has no dependencies', async () => {
    const { result } = renderHook(() =>
      useLocalNodeSession({
        taskId: 't1',
        enabled: true,
        terminal,
        files: { 'index.js': 'console.log(1)' },
        blockedError: null,
      })
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(install).not.toHaveBeenCalled();
  });

  it('surfaces a missing Node installation without opening a shell', () => {
    const { result } = renderHook(() =>
      useLocalNodeSession({
        taskId: 't1',
        enabled: false,
        terminal,
        files,
        blockedError: 'Node.js 22+ was not found.',
      })
    );

    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe('Node.js 22+ was not found.');
    expect(terminalApi.open).not.toHaveBeenCalled();
  });
});
