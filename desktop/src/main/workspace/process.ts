import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';

export type ProcessStream = 'stdout' | 'stderr';

export type WorkspaceProcess = {
  pid: number;
  /** Resolves with the real exit code (128 + signal when the child was signalled). */
  exit: Promise<{ exitCode: number }>;
  stop: () => void;
};

export type SpawnOptions = {
  cwd: string;
  command: string;
  args?: string[];
  env: NodeJS.ProcessEnv;
  onOutput?: (stream: ProcessStream, data: string) => void;
  onError?: (message: string) => void;
};

const KILL_GRACE_MS = 3_000;
const PORT_PATTERN = /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1):(\d{2,5})/gi;

/** Minimal shell-like splitting for trusted task metadata commands ("npm run dev"). */
export function splitCommand(command: string): { command: string; args: string[] } {
  const parts: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const character of command.trim()) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current !== '') {
        parts.push(current);
        current = '';
      }
      continue;
    }
    current += character;
  }

  if (current !== '') parts.push(current);
  const [executable, ...args] = parts;
  if (!executable) throw new Error('No command to run.');
  return { command: executable, args };
}

/** Spawns a detached process group so terminateProcessGroup can stop its children too. */
export function spawnWorkspaceProcess(options: SpawnOptions): WorkspaceProcess {
  const child: ChildProcess = spawn(options.command, options.args ?? [], {
    cwd: options.cwd,
    env: options.env,
    detached: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let settled = false;
  let killTimer: ReturnType<typeof setTimeout> | null = null;

  const exit = new Promise<{ exitCode: number }>((resolve) => {
    const finish = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      resolve({ exitCode });
    };

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (data: string) => options.onOutput?.('stdout', data));
    child.stderr?.on('data', (data: string) => options.onOutput?.('stderr', data));

    child.on('error', (error) => {
      options.onError?.(error.message);
      finish(1);
    });

    child.on('exit', (code, signal) => {
      if (typeof code === 'number') {
        finish(code);
        return;
      }
      finish(signal ? 128 + (signalNumber(signal) ?? 0) : 1);
    });
  });

  const stop = (): void => {
    if (settled || typeof child.pid !== 'number') return;
    terminateProcessGroup(child.pid, 'SIGTERM');
    killTimer = setTimeout(() => {
      if (!settled && typeof child.pid === 'number') {
        terminateProcessGroup(child.pid, 'SIGKILL');
      }
    }, KILL_GRACE_MS);
    killTimer.unref?.();
  };

  return { pid: child.pid ?? -1, exit, stop };
}

export function terminateProcessGroup(pid: number, signal: NodeJS.Signals): void {
  if (pid <= 0) return;
  try {
    // The negative pid is the process group created by detached: true.
    process.kill(-pid, signal);
    return;
  } catch {
    // Fall back to the process itself (e.g. when it never became a group leader).
  }
  try {
    process.kill(pid, signal);
  } catch {
    // Already gone.
  }
}

function signalNumber(signal: NodeJS.Signals): number | null {
  switch (signal) {
    case 'SIGHUP':
      return 1;
    case 'SIGINT':
      return 2;
    case 'SIGKILL':
      return 9;
    case 'SIGTERM':
      return 15;
    default:
      return null;
  }
}

/** Finds the last localhost URL printed by a dev server. */
export function extractServerPort(text: string): number | null {
  let port: number | null = null;
  for (const match of text.matchAll(PORT_PATTERN)) {
    const value = Number(match[1]);
    if (Number.isInteger(value) && value >= 1 && value <= 65535) port = value;
  }
  return port;
}

export type PortWatcher = ((chunk: string) => void) & {
  /** Allows the port to be announced again after the server on it stopped. */
  forget: (port: number) => void;
};

/**
 * Calls onPort once per newly seen port; the caller verifies that it is listening. A port is
 * remembered so repeated output (or the shell echoing the command) does not announce it again.
 * After a server stops, `forget` clears that so the next server on the same port is announced.
 */
export function createPortWatcher(onPort: (port: number) => void): PortWatcher {
  let buffer = '';
  const seen = new Set<number>();

  const scan = (chunk: string) => {
    // Keep a little history so a URL split across two chunks is still recognised.
    buffer = `${buffer}${chunk}`.slice(-16_384);
    for (const match of buffer.matchAll(PORT_PATTERN)) {
      const value = Number(match[1]);
      if (!Number.isInteger(value) || value < 1 || value > 65535) continue;
      if (seen.has(value)) continue;
      seen.add(value);
      onPort(value);
    }
  };

  scan.forget = (port: number) => {
    seen.delete(port);
    // Drop the history too, otherwise the old URL would announce the port before the new
    // server on it is listening, and the real announcement would then be ignored.
    buffer = '';
  };

  return scan;
}

function canConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (value: boolean): void => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

/** Checks that something accepts TCP connections on loopback (IPv4, then IPv6). */
export async function isPortListening(port: number, timeoutMs = 500): Promise<boolean> {
  if (await canConnect('127.0.0.1', port, timeoutMs)) return true;
  // Vite and other tools may bind localhost to ::1 only.
  return canConnect('::1', port, timeoutMs);
}

/** Polls until the port accepts connections, or the timeout expires. */
export async function waitForPort(port: number, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortListening(port, 400)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}
