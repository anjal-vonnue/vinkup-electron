import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
  TerminalDataEvent,
  TerminalExitEvent,
  WorkspaceEnvironment,
  WorkspaceEvent,
  WorkspaceOpenInput,
  WorkspaceOpenResult,
} from '@itp/types';
import { hostProcessEnv, resolveHostEnvironment, type HostEnvironment } from './env';
import {
  cleanupWorkspace,
  materializeWorkspace,
  prepareWorkspace,
  reloadWorkspaceFromDisk,
  watchWorkspace,
  writeSupportFiles,
  writeWorkspaceFiles,
  type WorkspaceWatcher,
  type WorkspaceWriteState,
} from './files';
import { TASK_ID_PATTERN } from './paths';
import {
  createPortWatcher,
  isPortListening,
  splitCommand,
  spawnWorkspaceProcess,
  waitForPort,
  type WorkspaceProcess,
} from './process';
import { openTerminal, type TerminalProcess } from './pty';
import { requiresPostgres, resolvePostgresEnvironment, type PostgresEnvironment } from './postgres';
import { startWorkspaceServer, type WorkspaceStaticServer } from './staticServer';

const MAX_TERMINALS_PER_TASK = 4;
const MAX_COMMAND_CHARS = 500;
const MAX_TERMINAL_WRITE_CHARS = 16_384;
const PORT_TIMEOUT_MS = 10_000;
const PORT_POLL_MS = 2_000;
const COMMAND_DELAY_MS = 150;
/** The Prisma task's database survives reopening the task; everything else is rebuilt. */
const PRESERVED_WORKSPACE_PATHS = ['.vinkup/db'];
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');

type TerminalEntry = {
  terminal: TerminalProcess;
  scan: (chunk: string) => void;
};

type WorkspaceRun = {
  process: WorkspaceProcess;
};

type WorkspaceSession = {
  taskId: string;
  root: string;
  written: WorkspaceWriteState;
  watcher: WorkspaceWatcher;
  server: WorkspaceStaticServer;
  terminals: Map<string, TerminalEntry>;
  install: WorkspaceProcess | null;
  run: WorkspaceRun | null;
  /** localhost ports that currently accept connections */
  servers: Map<number, string>;
  portMonitors: Map<number, ReturnType<typeof setInterval>>;
  pendingPorts: Set<number>;
  /** Set for Prisma tasks: the course database and the test database URLs. */
  database: PostgresEnvironment | null;
  closed: boolean;
};

export type WorkspaceManagerCallbacks = {
  baseDir: string;
  emitEvent: (event: WorkspaceEvent) => void;
  emitTerminalData: (event: TerminalDataEvent) => void;
  emitTerminalExit: (event: TerminalExitEvent) => void;
};

export function assertTaskId(value: unknown): string {
  if (typeof value !== 'string' || !TASK_ID_PATTERN.test(value)) {
    throw new Error('Invalid task id.');
  }
  return value;
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Owns one on-disk workspace per open task: the mirrored files, the preview HTTP
 * server, the shell processes and the task's dev server. Everything the renderer
 * asks for is identified by a task id; paths and ports are resolved here.
 */
export class WorkspaceManager {
  private readonly callbacks: WorkspaceManagerCallbacks;
  private readonly sessions = new Map<string, WorkspaceSession>();
  /** Closes still removing their folder, so a second close waits instead of skipping it. */
  private readonly closing = new Map<string, Promise<void>>();
  /** Serializes lifecycle work per task so open/close races cannot leak folders. */
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(callbacks: WorkspaceManagerCallbacks) {
    this.callbacks = callbacks;
  }

  getEnvironment(): Promise<WorkspaceEnvironment> {
    return resolveHostEnvironment().then((host) => ({
      nodeVersion: host.nodeVersion,
      error: host.error,
    }));
  }

  async open(input: WorkspaceOpenInput): Promise<WorkspaceOpenResult> {
    const taskId = assertTaskId(input.taskId);
    return this.exclusive(taskId, async () => {
      const existing = this.sessions.get(taskId);
      if (existing) {
        await writeWorkspaceFiles(existing.root, input.files, existing.written);
        if (input.supportFiles) await writeSupportFiles(existing.root, input.supportFiles);
        const host = await resolveHostEnvironment();
        return {
          previewUrl: existing.server.url,
          nodeVersion: host.nodeVersion,
          error: host.error,
        };
      }

      const root = path.resolve(this.callbacks.baseDir, taskId);
      const relative = path.relative(path.resolve(this.callbacks.baseDir), root);
      if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Invalid workspace location.');
      }

      await prepareWorkspace(root, PRESERVED_WORKSPACE_PATHS);
      let session: WorkspaceSession | null = null;
      try {
        const written = await materializeWorkspace(root, input.files);
        if (input.supportFiles) await writeSupportFiles(root, input.supportFiles);

        // Prisma tasks need a real PostgreSQL database; fail with a clear message
        // before anything is started when the machine is not ready.
        const host = await resolveHostEnvironment();
        const database = requiresPostgres(input.files)
          ? await resolvePostgresEnvironment(taskId, host.path)
          : null;

        const watcher = watchWorkspace(root, written, (change) => {
          this.callbacks.emitEvent({
            type: 'file-changed',
            taskId,
            path: change.path,
            content: change.content,
          });
        });

        const server = await startWorkspaceServer({
          root,
          callbacks: {
            onEvent: (event) => {
              this.callbacks.emitEvent({ ...event, taskId });
            },
          },
        });

        session = {
          taskId,
          root,
          written,
          watcher,
          server,
          terminals: new Map(),
          install: null,
          run: null,
          servers: new Map(),
          portMonitors: new Map(),
          pendingPorts: new Set(),
          database,
          closed: false,
        };
        this.sessions.set(taskId, session);
      } catch (error) {
        if (session) await this.disposeSession(session);
        else await cleanupWorkspace(root, PRESERVED_WORKSPACE_PATHS).catch(() => undefined);
        throw error;
      }

      const host = await resolveHostEnvironment();
      return { previewUrl: session.server.url, nodeVersion: host.nodeVersion, error: host.error };
    });
  }

  async sync(
    taskIdValue: unknown,
    files: Record<string, string>,
    supportFiles?: Record<string, string>
  ): Promise<void> {
    const taskId = assertTaskId(taskIdValue);
    return this.exclusive(taskId, async () => {
      const session = this.requireSession(taskId);
      await writeWorkspaceFiles(session.root, files, session.written);
      if (supportFiles) await writeSupportFiles(session.root, supportFiles);
    });
  }

  async reload(taskIdValue: unknown): Promise<Record<string, string>> {
    const taskId = assertTaskId(taskIdValue);
    return this.exclusive(taskId, async () => {
      const session = this.requireSession(taskId);
      return reloadWorkspaceFromDisk(session.root);
    });
  }

  async close(taskIdValue: unknown): Promise<void> {
    const taskId = assertTaskId(taskIdValue);
    const inFlight = this.closing.get(taskId);
    if (inFlight) return inFlight;

    const session = this.sessions.get(taskId);
    if (!session) return;

    // Drop the session first so nothing can use it while the folder is removed.
    this.sessions.delete(taskId);
    const work = this.exclusive(taskId, async () => {
      await this.disposeSession(session);
      await cleanupWorkspace(session.root, PRESERVED_WORKSPACE_PATHS).catch(() => undefined);
    }).finally(() => this.closing.delete(taskId));
    this.closing.set(taskId, work);
    return work;
  }

  async closeAll(): Promise<void> {
    // Include closes already running: quitting must wait for those folders too.
    const ids = new Set([...this.sessions.keys(), ...this.closing.keys()]);
    await Promise.allSettled([...ids].map((taskId) => this.close(taskId)));
  }

  async install(taskIdValue: unknown): Promise<void> {
    const taskId = assertTaskId(taskIdValue);
    return this.exclusive(taskId, async () => {
      const session = this.requireSession(taskId);
      if (session.install) return;

      const host = await resolveHostEnvironment();
      if (!session.closed) {
        const process = spawnWorkspaceProcess({
          cwd: session.root,
          command: 'npm',
          args: ['install', '--no-audit', '--no-fund'],
          env: this.environmentFor(session, host),
          onOutput: (stream, data) => {
            this.callbacks.emitEvent({ type: 'run-output', taskId, kind: 'install', stream, data });
          },
          onError: (message) => {
            this.callbacks.emitEvent({
              type: 'run-output',
              taskId,
              kind: 'install',
              stream: 'stderr',
              data: `${message}\n`,
            });
          },
        });
        session.install = process;

        void process.exit.then(({ exitCode }) => {
          if (session.install === process) session.install = null;
          if (session.closed) return;
          this.callbacks.emitEvent({ type: 'run-exited', taskId, kind: 'install', exitCode });
        });
      }
    });
  }

  async dev(taskIdValue: unknown, commandValue: unknown): Promise<void> {
    const taskId = assertTaskId(taskIdValue);
    if (
      typeof commandValue !== 'string' ||
      commandValue.trim() === '' ||
      commandValue.length > MAX_COMMAND_CHARS ||
      /[\r\n\0]/.test(commandValue)
    ) {
      return Promise.reject(new Error('Invalid run command.'));
    }
    const command = commandValue.trim();

    return this.exclusive(taskId, async () => {
      const session = this.requireSession(taskId);
      this.clearServers(session);
      this.resetScanners(session);

      if (session.run) {
        session.run.process.stop();
        session.run = null;
      }

      const terminal = [...session.terminals.values()][0];
      if (terminal) {
        // Ctrl+C stops whatever is already running; the command then appears as if typed.
        terminal.terminal.write('\u0003');
        await delay(COMMAND_DELAY_MS);
        if (session.closed) return;
        terminal.terminal.write(`${command}\n`);
        return;
      }

      const host = await resolveHostEnvironment();
      const { command: executable, args } = splitCommand(command);
      const scan = this.scannerFor(session);
      const process = spawnWorkspaceProcess({
        cwd: session.root,
        command: executable,
        args,
        env: this.environmentFor(session, host),
        onOutput: (stream, data) => {
          this.callbacks.emitEvent({ type: 'run-output', taskId, kind: 'dev', stream, data });
          scan(stripAnsi(data));
        },
        onError: (message) => {
          this.callbacks.emitEvent({
            type: 'run-output',
            taskId,
            kind: 'dev',
            stream: 'stderr',
            data: `${message}\n`,
          });
        },
      });
      session.run = { process };

      void process.exit.then(({ exitCode }) => {
        if (session.run?.process === process) session.run = null;
        if (session.closed) return;
        this.callbacks.emitEvent({ type: 'run-exited', taskId, kind: 'dev', exitCode });
      });
    });
  }

  async stop(taskIdValue: unknown): Promise<void> {
    const taskId = assertTaskId(taskIdValue);
    return this.exclusive(taskId, () => {
      const session = this.sessions.get(taskId);
      if (!session) return;

      if (session.run) {
        session.run.process.stop();
        session.run = null;
      }

      this.clearServers(session);
      this.resetScanners(session);
      for (const entry of session.terminals.values()) {
        entry.terminal.write('\u0003');
      }
    });
  }

  async openTerminal(input: unknown): Promise<{ terminalId: string }> {
    const parsed = parseTerminalInput(input);
    const taskId = assertTaskId(parsed.taskId);
    return this.exclusive(taskId, async () => {
      const session = this.requireSession(taskId);
      if (session.terminals.size >= MAX_TERMINALS_PER_TASK) {
        throw new Error('Too many terminals are open for this task.');
      }

      const host = await resolveHostEnvironment();
      if (session.closed) throw new Error('The workspace is closed.');

      const terminalId = randomUUID();
      const entry: TerminalEntry = {
        terminal: openTerminal({
          id: terminalId,
          cwd: session.root,
          shell: host.shell,
          env: this.environmentFor(session, host),
          cols: parsed.cols,
          rows: parsed.rows,
          onData: (data) => {
            if (session.closed) return;
            this.callbacks.emitTerminalData({ terminalId, data });
            entry.scan(stripAnsi(data));
          },
          onExit: (exitCode) => {
            session.terminals.delete(terminalId);
            if (session.closed) return;
            this.callbacks.emitTerminalExit({ terminalId, exitCode });
          },
        }),
        scan: this.scannerFor(session),
      };
      session.terminals.set(terminalId, entry);
      return { terminalId };
    });
  }

  async writeTerminal(terminalIdValue: unknown, dataValue: unknown): Promise<void> {
    const terminalId = parseTerminalId(terminalIdValue);
    if (typeof dataValue !== 'string' || dataValue.length > MAX_TERMINAL_WRITE_CHARS) {
      return Promise.reject(new Error('Invalid terminal input.'));
    }
    const entry = this.findTerminal(terminalId);
    entry?.terminal.write(dataValue);
    return Promise.resolve();
  }

  async resizeTerminal(
    terminalIdValue: unknown,
    colsValue: unknown,
    rowsValue: unknown
  ): Promise<void> {
    const terminalId = parseTerminalId(terminalIdValue);
    const cols = parseDimension(colsValue);
    const rows = parseDimension(rowsValue);
    const entry = this.findTerminal(terminalId);
    entry?.terminal.resize(cols, rows);
    return Promise.resolve();
  }

  async closeTerminal(terminalIdValue: unknown): Promise<void> {
    const terminalId = parseTerminalId(terminalIdValue);
    for (const session of this.sessions.values()) {
      const entry = session.terminals.get(terminalId);
      if (!entry) continue;
      session.terminals.delete(terminalId);
      entry.terminal.kill();
      return Promise.resolve();
    }
    return Promise.resolve();
  }

  private findTerminal(terminalId: string): TerminalEntry | undefined {
    for (const session of this.sessions.values()) {
      const entry = session.terminals.get(terminalId);
      if (entry) return entry;
    }
    return undefined;
  }

  private requireSession(taskId: string): WorkspaceSession {
    const session = this.sessions.get(taskId);
    if (!session) throw new Error('Open the workspace before using it.');
    return session;
  }

  private scannerFor(session: WorkspaceSession): (chunk: string) => void {
    const scan = createPortWatcher((port) => {
      void this.announcePort(session, port);
    });
    return scan;
  }

  private resetScanners(session: WorkspaceSession): void {
    for (const entry of session.terminals.values()) {
      entry.scan = this.scannerFor(session);
    }
  }

  private async announcePort(session: WorkspaceSession, port: number): Promise<void> {
    if (session.closed || session.servers.has(port) || session.pendingPorts.has(port)) return;
    session.pendingPorts.add(port);
    try {
      const listening = await waitForPort(port, PORT_TIMEOUT_MS);
      if (!listening || session.closed || session.servers.has(port)) return;

      const url = `http://localhost:${port}`;
      session.servers.set(port, url);
      this.callbacks.emitEvent({ type: 'server-ready', taskId: session.taskId, port, url });
      this.monitorPort(session, port);
    } finally {
      session.pendingPorts.delete(port);
    }
  }

  private monitorPort(session: WorkspaceSession, port: number): void {
    if (session.portMonitors.has(port)) return;
    let misses = 0;
    const timer = setInterval(() => {
      void isPortListening(port, 400).then((listening) => {
        if (session.closed) return;
        if (listening) {
          misses = 0;
          return;
        }
        misses += 1;
        if (misses < 2) return;
        clearInterval(timer);
        session.portMonitors.delete(port);
        if (session.servers.delete(port)) {
          this.callbacks.emitEvent({
            type: 'server-closed',
            taskId: session.taskId,
            port,
          });
        }
      });
    }, PORT_POLL_MS);
    timer.unref?.();
    session.portMonitors.set(port, timer);
  }

  private clearServers(session: WorkspaceSession): void {
    for (const timer of session.portMonitors.values()) clearInterval(timer);
    session.portMonitors.clear();
    const ports = [...session.servers.keys()];
    session.servers.clear();
    for (const port of ports) {
      this.callbacks.emitEvent({ type: 'server-closed', taskId: session.taskId, port });
    }
  }

  /** The task's environment, plus its PostgreSQL URLs for Prisma tasks. */
  private environmentFor(session: WorkspaceSession, host: HostEnvironment): NodeJS.ProcessEnv {
    const env = hostProcessEnv(host);
    if (!session.database) return env;
    return {
      ...env,
      DATABASE_URL: session.database.url,
      VINKUP_TEST_DATABASE_URL: session.database.testUrl,
    };
  }

  private async disposeSession(session: WorkspaceSession): Promise<void> {
    if (session.closed) return;
    session.closed = true;
    this.clearServers(session);
    session.install?.stop();
    session.install = null;
    session.run?.process.stop();
    session.run = null;
    for (const entry of session.terminals.values()) entry.terminal.kill();
    session.terminals.clear();
    session.watcher.close();
    await session.server.close().catch(() => undefined);
  }

  private exclusive<T>(taskId: string, work: () => T | Promise<T>): Promise<T> {
    const previous = this.chains.get(taskId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    this.chains.set(
      taskId,
      next.catch(() => undefined)
    );
    return next;
  }
}

function parseTerminalInput(value: unknown): { taskId: string; cols: number; rows: number } {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid terminal input.');
  const record = value as Record<string, unknown>;
  return {
    taskId: assertTaskId(record.taskId),
    cols: parseDimension(record.cols),
    rows: parseDimension(record.rows),
  };
}

function parseTerminalId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/i.test(value)) {
    throw new Error('Invalid terminal id.');
  }
  return value;
}

function parseDimension(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('Invalid terminal size.');
  return Math.min(400, Math.max(2, Math.round(value)));
}
