// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi, WorkspaceEvent } from '@itp/types';
import { RunnerProvider } from '../runnerContext';
import { WorkspaceProvider } from '../../pages/TaskPage/state/WorkspaceContext';
import { taskFixture } from '../../test/fixtures/task';
import LocalNodeRuntime from './LocalNodeRuntime';

const TERMINAL_IDS = [
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
];

let workspaceListeners: Array<(event: WorkspaceEvent) => void> = [];
let opened = 0;

const terminalMocks = vi.hoisted(() => ({
  instances: [] as Array<{ type: (data: string) => void }>,
}));

vi.mock('../node/TerminalView', async () => {
  const { useEffect, useRef } = await import('react');

  function MockTerminalView({
    onReady,
    onResize,
  }: {
    onReady: (instance: never) => void;
    onResize: (cols: number, rows: number) => void;
  }) {
    const callbacks = useRef({ onReady, onResize });
    callbacks.current = { onReady, onResize };

    // StrictMode runs this effect twice with a fresh xterm each time, like the real view.
    useEffect(() => {
      let listeners: Array<(data: string) => void> = [];
      const subscriptions = new Set<{ dispose(): void }>();
      const terminal = {
        cols: 80,
        rows: 24,
        write: vi.fn(),
        focus: vi.fn(),
        onData: (listener: (data: string) => void) => {
          listeners.push(listener);
          const subscription = {
            dispose: () => {
              listeners = listeners.filter((item) => item !== listener);
              subscriptions.delete(subscription);
            },
          };
          subscriptions.add(subscription);
          return subscription;
        },
      };
      terminalMocks.instances.push({
        type: (data) => {
          for (const listener of listeners) listener(data);
        },
      });
      callbacks.current.onReady(terminal as never);
      callbacks.current.onResize(80, 24);
      return () => {
        for (const subscription of [...subscriptions]) subscription.dispose();
      };
    }, []);

    return <div data-testid="terminal-view" />;
  }

  return { default: MockTerminalView };
});

vi.mock('../node/NodePreview', () => ({
  default: ({ port }: { port: number }) => (
    <div data-testid={`preview-${port}`}>Preview on {port}</div>
  ),
}));

function emit(event: WorkspaceEvent): void {
  act(() => {
    for (const listener of workspaceListeners) listener(event);
  });
}

function renderRuntime() {
  const task = {
    ...taskFixture,
    id: 't1',
    runtime: 'node' as const,
    runCommand: 'npm run dev',
  };
  return render(
    <StrictMode>
      <WorkspaceProvider
        code={{
          updatedAt: null,
          files: [
            { path: 'package.json', content: '{"dependencies":{"express":"1.0.0"}}' },
            { path: 'index.js', content: 'console.log(1)' },
          ],
        }}
        taskId="t1"
      >
        <RunnerProvider>
          <LocalNodeRuntime task={task} isVisible={true} />
        </RunnerProvider>
      </WorkspaceProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  workspaceListeners = [];
  opened = 0;
  terminalMocks.instances = [];

  window.desktop = {
    workspace: {
      open: vi.fn(() =>
        Promise.resolve({ previewUrl: 'http://127.0.0.1:4100', nodeVersion: '24.0.0', error: null })
      ),
      sync: vi.fn(() => Promise.resolve()),
      reload: vi.fn(() => Promise.resolve({})),
      close: vi.fn(() => Promise.resolve()),
      getEnvironment: vi.fn(() => Promise.resolve({ nodeVersion: '24.0.0', error: null })),
      onEvent: (listener: (event: WorkspaceEvent) => void) => {
        workspaceListeners.push(listener);
        return () => {
          workspaceListeners = workspaceListeners.filter((candidate) => candidate !== listener);
        };
      },
    },
    terminal: {
      open: vi.fn(() => {
        const index = opened++;
        return Promise.resolve({
          terminalId: TERMINAL_IDS[index] ?? TERMINAL_IDS[TERMINAL_IDS.length - 1],
          name: `T${index + 1}`,
        });
      }),
      write: vi.fn(() => Promise.resolve()),
      resize: vi.fn(() => Promise.resolve()),
      close: vi.fn(() => Promise.resolve()),
      onData: () => () => undefined,
      onExit: () => () => undefined,
    },
    run: {
      install: vi.fn(() => Promise.resolve()),
      dev: vi.fn(() => Promise.resolve()),
      stop: vi.fn(() => Promise.resolve()),
    },
  } as unknown as DesktopApi;
});

afterEach(() => {
  cleanup();
  delete (window as { desktop?: DesktopApi }).desktop;
  vi.clearAllMocks();
});

describe('LocalNodeRuntime', () => {
  it('sends typing from the live xterm to the active PTY under StrictMode', async () => {
    renderRuntime();

    await waitFor(() => expect(screen.getByRole('tab', { name: /T1/ })).toBeInTheDocument());
    await waitFor(() => expect(window.desktop?.run.install).toHaveBeenCalledWith('t1'));
    emit({ type: 'run-exited', taskId: 't1', kind: 'install', exitCode: 0 });
    await waitFor(() => expect(window.desktop?.terminal.open).toHaveBeenCalledTimes(1));

    // The first xterm is disposed by StrictMode; typing must reach the replacement.
    const liveTerminal = terminalMocks.instances[terminalMocks.instances.length - 1];
    if (!liveTerminal) throw new Error('No terminal instance was registered');
    act(() => liveTerminal.type('npm run dev\r'));

    expect(window.desktop?.terminal.write).toHaveBeenCalledWith(
      't1',
      TERMINAL_IDS[0],
      'npm run dev\r'
    );
  });

  it('keeps terminal tabs mounted while switching between multiple Preview servers', async () => {
    renderRuntime();

    await waitFor(() => expect(screen.getByRole('tab', { name: /T1/ })).toBeInTheDocument());
    await waitFor(() => expect(window.desktop?.run.install).toHaveBeenCalledWith('t1'));
    emit({ type: 'run-exited', taskId: 't1', kind: 'install', exitCode: 0 });
    await waitFor(() => expect(window.desktop?.terminal.open).toHaveBeenCalled());

    emit({ type: 'server-ready', taskId: 't1', port: 5173, url: 'http://localhost:5173' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Preview/ })).toHaveAttribute('aria-selected', 'true')
    );
    expect(screen.getByTestId('preview-5173')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Terminal/ }));
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: /T2/ })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /T1/ })).toBeInTheDocument();

    emit({ type: 'server-ready', taskId: 't1', port: 3000, url: 'http://localhost:3000' });
    await waitFor(() => expect(screen.getByTestId('preview-3000')).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /Preview 2/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('preview-5173')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Terminal/ }));
    expect(screen.getAllByTestId('terminal-view')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: /T2/ })).toHaveAttribute('aria-selected', 'true');

    emit({ type: 'server-closed', taskId: 't1', port: 3000 });
    await waitFor(() => expect(screen.queryByTestId('preview-3000')).not.toBeInTheDocument());
    expect(screen.getByTestId('preview-5173')).toBeInTheDocument();
  });
});
