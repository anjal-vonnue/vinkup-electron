import * as pty from 'node-pty';
import { terminateProcessGroup } from './process';

const MIN_COLS = 20;
const MAX_COLS = 400;
const MIN_ROWS = 2;
const MAX_ROWS = 200;
const KILL_GRACE_MS = 2_000;

export type TerminalProcess = {
  id: string;
  pid: number;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
};

export type OpenTerminalOptions = {
  id: string;
  cwd: string;
  shell: string;
  /** Startup arguments, e.g. `--rcfile` for the generated minimal prompt. */
  args?: string[];
  env: NodeJS.ProcessEnv;
  cols: number;
  rows: number;
  onData: (data: string) => void;
  onExit: (exitCode: number) => void;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** node-pty wants string values only; undefined entries must be dropped. */
function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}

/**
 * Opens a real login shell in a pseudo-terminal. The renderer only ever sees the
 * terminal data; it never gets a handle to the process or the filesystem.
 */
export function openTerminal(options: OpenTerminalOptions): TerminalProcess {
  const child = pty.spawn(options.shell, options.args ?? [], {
    name: 'xterm-256color',
    cols: clamp(options.cols, MIN_COLS, MAX_COLS),
    rows: clamp(options.rows, MIN_ROWS, MAX_ROWS),
    cwd: options.cwd,
    env: stringEnv(options.env),
  });

  let isClosed = false;
  let killTimer: ReturnType<typeof setTimeout> | null = null;

  const dataSubscription = child.onData((data) => {
    if (isClosed) return;
    options.onData(data);
  });

  const exitSubscription = child.onExit(({ exitCode, signal }) => {
    if (isClosed) return;
    isClosed = true;
    dataSubscription.dispose();
    exitSubscription.dispose();
    if (killTimer) clearTimeout(killTimer);
    options.onExit(typeof exitCode === 'number' ? exitCode : (signal ?? 1));
  });

  return {
    id: options.id,
    pid: child.pid,
    write(data: string) {
      if (isClosed) return;
      child.write(data);
    },
    resize(cols: number, rows: number) {
      if (isClosed) return;
      try {
        child.resize(clamp(cols, MIN_COLS, MAX_COLS), clamp(rows, MIN_ROWS, MAX_ROWS));
      } catch {
        // The shell exited between the resize request and this call.
      }
    },
    kill() {
      if (isClosed) return;
      try {
        child.kill();
      } catch {
        // Already gone.
      }
      killTimer = setTimeout(() => {
        if (!isClosed) terminateProcessGroup(child.pid, 'SIGKILL');
      }, KILL_GRACE_MS);
      killTimer.unref?.();
    },
  };
}
