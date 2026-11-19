import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type {
  DesktopApi,
  TerminalApi,
  TerminalDataEvent,
  TerminalExitEvent,
  WorkspaceApi,
  WorkspaceEvent,
} from '@itp/types';
import type { Terminal as XTerminal } from '@xterm/xterm';
import { useLocalNodeSession } from './useLocalNodeSession';

const TERMINAL_IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
];

let listeners: Array<(event: WorkspaceEvent) => void> = [];
let dataListeners: Array<(event: TerminalDataEvent) => void> = [];
let exitListeners: Array<(event: TerminalExitEvent) => void> = [];
let terminalApi: TerminalApi;
let workspaceApi: WorkspaceApi;
let install: ReturnType<typeof vi.fn>;
let dev: ReturnType<typeof vi.fn>;
let stop: ReturnType<typeof vi.fn>;
type OpenResult = { terminalId: string; name: string };
const openTerminal = vi.fn<(input: unknown) => Promise<OpenResult>>();
let opened = 0;

type TerminalMock = {
  instance: XTerminal;
  writes: string[];
  type: (data: string) => void;
  listenerCount: () => number;
};

function createTerminalMock(): TerminalMock {
  const writes: string[] = [];
  let inputListeners: Array<(data: string) => void> = [];

  const instance = {
    cols: 80,
    rows: 24,
    write: vi.fn((data: string) => writes.push(data)),
    focus: vi.fn(),
    onData: (listener: (data: string) => void) => {
      inputListeners.push(listener);
      return {
        dispose: () => {
          inputListeners = inputListeners.filter((candidate) => candidate !== listener);
        },
      };
    },
  } as unknown as XTerminal;

  return {
    instance,
    writes,
    type: (data) => {
      act(() => {
        for (const listener of inputListeners) listener(data);
      });
    },
    listenerCount: () => inputListeners.length,
  };
}

function emit(event: WorkspaceEvent): void {
  act(() => {
    for (const listener of listeners) listener(event);
  });
}

function emitData(terminalId: string, data: string): void {
  act(() => {
    for (const listener of dataListeners) listener({ taskId: 't1', terminalId, data });
  });
}

function emitExit(terminalId: string, exitCode: number): void {
  act(() => {
    for (const listener of exitListeners) listener({ taskId: 't1', terminalId, exitCode });
  });
}

function options(overrides: Partial<Parameters<typeof useLocalNodeSession>[0]> = {}) {
  return {
    taskId: 't1',
    enabled: true,
    files: { 'package.json': '{"dependencies":{"express":"1.0.0"}}', 'index.js': 'console.log(1)' },
    blockedError: null,
    ...overrides,
  };
}

beforeEach(() => {
  listeners = [];
  dataListeners = [];
  exitListeners = [];
  opened = 0;
  install = vi.fn(() => Promise.resolve());
  dev = vi.fn(() => Promise.resolve());
  stop = vi.fn(() => Promise.resolve());
  openTerminal.mockReset();
  openTerminal.mockImplementation(() => {
    const index = opened++;
    return Promise.resolve({
      terminalId: TERMINAL_IDS[index] ?? TERMINAL_IDS[TERMINAL_IDS.length - 1],
      name: `T${index + 1}`,
    });
  });

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
    onExit: (listener) => {
      exitListeners.push(listener);
      return () => {
        exitListeners = exitListeners.filter((candidate) => candidate !== listener);
      };
    },
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
    run: { install, dev, stop },
  } as unknown as DesktopApi;
});

afterEach(() => {
  delete (window as { desktop?: DesktopApi }).desktop;
  vi.clearAllMocks();
});

async function initialize(terminal: TerminalMock) {
  const rendered = renderHook((props) => useLocalNodeSession(props), { initialProps: options() });
  await waitFor(() => expect(rendered.result.current.terminals).toHaveLength(1));

  act(() => rendered.result.current.registerTerminal('terminal-1', terminal.instance));
  await waitFor(() => expect(install).toHaveBeenCalledWith('t1'));
  emit({ type: 'run-exited', taskId: 't1', kind: 'install', exitCode: 0 });
  await waitFor(() => expect(rendered.result.current.status).toBe('ready'));
  return rendered;
}

describe('useLocalNodeSession', () => {
  it('opens a shell after install and routes output, resize, Run and Preview', async () => {
    const terminal = createTerminalMock();
    const onServerReady = vi.fn();
    const rendered = renderHook((props) => useLocalNodeSession(props), {
      initialProps: options({ onServerReady }),
    });
    await waitFor(() => expect(rendered.result.current.terminals).toHaveLength(1));

    act(() => rendered.result.current.registerTerminal('terminal-1', terminal.instance));
    await waitFor(() => expect(install).toHaveBeenCalledWith('t1'));
    expect(openTerminal).not.toHaveBeenCalled();

    emit({ type: 'run-output', taskId: 't1', kind: 'install', stream: 'stdout', data: 'added 1' });
    expect(terminal.writes).toContain('added 1');

    emit({ type: 'run-exited', taskId: 't1', kind: 'install', exitCode: 0 });
    await waitFor(() => expect(rendered.result.current.status).toBe('ready'));
    expect(openTerminal).toHaveBeenCalledWith({
      taskId: 't1',
      cols: 80,
      rows: 24,
    });

    emitData(TERMINAL_IDS[0], 'hello\r\n');
    expect(terminal.writes).toContain('hello\r\n');

    act(() => rendered.result.current.resize('terminal-1', 100, 40));
    expect(terminalApi.resize).toHaveBeenCalledWith('t1', TERMINAL_IDS[0], 100, 40);

    act(() => rendered.result.current.runCommand('npm run dev'));
    expect(dev).toHaveBeenCalledWith('t1', 'npm run dev', TERMINAL_IDS[0]);

    emit({ type: 'server-ready', taskId: 't1', port: 5173, url: 'http://localhost:5173' });
    await waitFor(() =>
      expect(rendered.result.current.servers).toEqual([
        { port: 5173, url: 'http://localhost:5173', terminalId: undefined },
      ])
    );
    expect(onServerReady).toHaveBeenCalledWith({
      port: 5173,
      url: 'http://localhost:5173',
      terminalId: undefined,
    });

    emit({ type: 'server-closed', taskId: 't1', port: 1234 });
    expect(rendered.result.current.servers).toHaveLength(1);
    emit({ type: 'server-closed', taskId: 't1', port: 5173 });
    await waitFor(() => expect(rendered.result.current.servers).toHaveLength(0));
  });

  it('rebinds keyboard input when xterm recreates its instance', async () => {
    const first = createTerminalMock();
    const rendered = await initialize(first);

    // StrictMode (and any remount) disposes the first xterm and reports a fresh one.
    const replacement = createTerminalMock();
    act(() => rendered.result.current.registerTerminal('terminal-1', replacement.instance));

    first.type('stale\r');
    expect(terminalApi.write).not.toHaveBeenCalledWith('t1', TERMINAL_IDS[0], 'stale\r');

    replacement.type('typed in the live terminal\r');
    expect(terminalApi.write).toHaveBeenCalledWith(
      't1',
      TERMINAL_IDS[0],
      'typed in the live terminal\r'
    );
  });

  it('sends keystrokes to the active shell and queues them until it opens', async () => {
    let resolveOpen: (value: { terminalId: string; name: string }) => void = () => undefined;
    openTerminal.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOpen = resolve;
      })
    );

    const terminal = createTerminalMock();
    const rendered = renderHook((props) => useLocalNodeSession(props), {
      initialProps: options({ files: { 'index.js': 'console.log(1)' } }),
    });
    await waitFor(() => expect(rendered.result.current.terminals).toHaveLength(1));
    act(() => rendered.result.current.registerTerminal('terminal-1', terminal.instance));
    await waitFor(() => expect(openTerminal).toHaveBeenCalled());

    terminal.type('ls\r');
    expect(terminalApi.write).not.toHaveBeenCalled();

    act(() => {
      resolveOpen({ terminalId: TERMINAL_IDS[0], name: 'T1' });
    });

    await waitFor(() =>
      expect(terminalApi.write).toHaveBeenCalledWith('t1', TERMINAL_IDS[0], 'ls\r')
    );

    terminal.type('pwd\r');
    expect(terminalApi.write).toHaveBeenCalledWith('t1', TERMINAL_IDS[0], 'pwd\r');
  });

  it('creates and switches independent sessions without interrupting the previous shell', async () => {
    const first = createTerminalMock();
    const rendered = await initialize(first);

    const second = createTerminalMock();
    act(() => rendered.result.current.createTerminal());
    await waitFor(() => expect(rendered.result.current.terminals).toHaveLength(2));
    act(() => rendered.result.current.registerTerminal('terminal-2', second.instance));
    await waitFor(() => expect(openTerminal).toHaveBeenCalledTimes(2));

    expect(rendered.result.current.terminals.map((session) => session.name)).toEqual(['T1', 'T2']);
    expect(rendered.result.current.activeTerminalKey).toBe('terminal-2');
    expect(rendered.result.current.activeTerminalId).toBe(TERMINAL_IDS[1]);

    emitData(TERMINAL_IDS[0], 'first output');
    expect(first.writes).toContain('first output');
    expect(second.writes).not.toContain('first output');

    act(() => rendered.result.current.selectTerminal('terminal-1'));
    // Each xterm instance keeps its own PTY route; hiding a tab does not retarget its input.
    second.type('in second\r');
    expect(terminalApi.write).toHaveBeenCalledWith('t1', TERMINAL_IDS[1], 'in second\r');
    first.type('in first\r');
    expect(terminalApi.write).toHaveBeenCalledWith('t1', TERMINAL_IDS[0], 'in first\r');

    // Run follows the selected tab, not the terminal that most recently received keystrokes.
    act(() => rendered.result.current.runCommand('npm start'));
    expect(dev).toHaveBeenCalledWith('t1', 'npm start', TERMINAL_IDS[0]);

    act(() => rendered.result.current.selectTerminal('terminal-2'));
    expect(rendered.result.current.activeTerminalId).toBe(TERMINAL_IDS[1]);
    expect(first.writes).toContain('first output');
  });

  it('closes the selected terminal, selects another, and keeps at least one session', async () => {
    const first = createTerminalMock();
    const rendered = await initialize(first);

    const second = createTerminalMock();
    act(() => rendered.result.current.createTerminal());
    await waitFor(() => expect(rendered.result.current.terminals).toHaveLength(2));
    act(() => rendered.result.current.registerTerminal('terminal-2', second.instance));
    await waitFor(() => expect(openTerminal).toHaveBeenCalledTimes(2));

    act(() => rendered.result.current.closeTerminal('terminal-2'));
    expect(terminalApi.close).toHaveBeenCalledWith('t1', TERMINAL_IDS[1]);
    expect(rendered.result.current.terminals.map((session) => session.key)).toEqual(['terminal-1']);
    expect(rendered.result.current.activeTerminalKey).toBe('terminal-1');
    expect(second.listenerCount()).toBe(0);

    act(() => rendered.result.current.closeTerminal('terminal-1'));
    expect(rendered.result.current.terminals).toHaveLength(1);
    expect(rendered.result.current.terminalError).toMatch(/at least one terminal/i);
  });

  it('marks an unexpected exit and replaces the last usable terminal in place', async () => {
    const first = createTerminalMock();
    const rendered = await initialize(first);

    emitExit(TERMINAL_IDS[0], 3);

    await waitFor(() => expect(openTerminal).toHaveBeenCalledTimes(2));
    expect(first.writes.join('')).toContain('Terminal exited (3)');
    await waitFor(() => expect(rendered.result.current.terminals).toHaveLength(1));
    await waitFor(() =>
      expect(rendered.result.current.terminals[0].terminalId).toBe(TERMINAL_IDS[1])
    );
    expect(rendered.result.current.activeTerminalKey).toBe('terminal-1');

    // The auto-restarted shell must accept typing again on its new id.
    first.type('after restart\r');
    expect(terminalApi.write).toHaveBeenCalledWith('t1', TERMINAL_IDS[1], 'after restart\r');
  });

  it('keeps multiple servers available independently', async () => {
    const terminal = createTerminalMock();
    const rendered = await initialize(terminal);

    emit({ type: 'server-ready', taskId: 't1', port: 5173, url: 'http://localhost:5173' });
    emit({ type: 'server-ready', taskId: 'other', port: 3000, url: 'http://localhost:3000' });
    emit({ type: 'server-ready', taskId: 't1', port: 3000, url: 'http://localhost:3000' });

    await waitFor(() => expect(rendered.result.current.servers).toHaveLength(2));
    expect(rendered.result.current.server?.port).toBe(3000);

    emit({ type: 'server-closed', taskId: 't1', port: 5173 });
    await waitFor(() =>
      expect(rendered.result.current.servers).toEqual([
        { port: 3000, url: 'http://localhost:3000', terminalId: undefined },
      ])
    );
  });

  it('reports the maximum session limit without opening a fifth PTY', async () => {
    const first = createTerminalMock();
    const rendered = await initialize(first);

    for (const key of ['terminal-2', 'terminal-3', 'terminal-4']) {
      act(() => rendered.result.current.createTerminal());
      await waitFor(() =>
        expect(rendered.result.current.terminals.some((session) => session.key === key)).toBe(true)
      );
      act(() => rendered.result.current.registerTerminal(key, createTerminalMock().instance));
    }
    await waitFor(() => expect(openTerminal).toHaveBeenCalledTimes(4));

    act(() => rendered.result.current.createTerminal());
    expect(rendered.result.current.terminalError).toMatch(/maximum of 4/i);
    expect(openTerminal).toHaveBeenCalledTimes(4);
    expect(rendered.result.current.terminals).toHaveLength(4);
  });

  it('surfaces terminal creation failures and can retry them', async () => {
    openTerminal.mockRejectedValueOnce(new Error('Shell unavailable'));
    const terminal = createTerminalMock();
    const rendered = renderHook((props) => useLocalNodeSession(props), {
      initialProps: options({ files: { 'index.js': 'console.log(1)' } }),
    });
    await waitFor(() => expect(rendered.result.current.terminals).toHaveLength(1));
    act(() => rendered.result.current.registerTerminal('terminal-1', terminal.instance));

    await waitFor(() => expect(rendered.result.current.terminals[0].status).toBe('error'));
    expect(rendered.result.current.terminalError).toBe('Shell unavailable');

    act(() => rendered.result.current.retryTerminal('terminal-1'));
    await waitFor(() => expect(rendered.result.current.terminals[0].status).toBe('ready'));
    // The rejected first call is a one-off mock, so the next open uses the first generated id.
    expect(rendered.result.current.terminals[0].terminalId).toBe(TERMINAL_IDS[0]);
  });

  it('skips npm install when package.json has no dependencies', async () => {
    const terminal = createTerminalMock();
    const rendered = renderHook((props) => useLocalNodeSession(props), {
      initialProps: options({ files: { 'index.js': 'console.log(1)' } }),
    });
    await waitFor(() => expect(rendered.result.current.terminals).toHaveLength(1));
    act(() => rendered.result.current.registerTerminal('terminal-1', terminal.instance));

    await waitFor(() => expect(rendered.result.current.status).toBe('ready'));
    expect(install).not.toHaveBeenCalled();
  });

  it('surfaces a missing Node installation without opening a terminal', () => {
    const { result } = renderHook((props) => useLocalNodeSession(props), {
      initialProps: options({
        enabled: false,
        blockedError: 'Node.js 22+ was not found.',
      }),
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe('Node.js 22+ was not found.');
    expect(result.current.terminals).toHaveLength(0);
    expect(openTerminal).not.toHaveBeenCalled();
  });
});
