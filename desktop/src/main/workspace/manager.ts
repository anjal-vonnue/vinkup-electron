import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  MAX_TERMINALS_PER_TASK,
  type TerminalDataEvent,
  type TerminalExitEvent,
  type WorkspaceEnvironment,
  type WorkspaceEvent,
  type WorkspaceOpenInput,
  type WorkspaceOpenResult,
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
  type PortWatcher,
  type WorkspaceProcess,
} from './process';
import { openTerminal, type TerminalProcess } from './pty';
import { requiresPostgres, resolvePostgresEnvironment, type PostgresEnvironment } from './postgres';
import { startWorkspaceServer, type WorkspaceStaticServer } from './staticServer';

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
  scan: PortWatcher;
  /** Stable, terminal-id-independent label shown in the renderer's tab bar. */
  name: string;
};

type ServerEntry = {
  url: string;
  /** null when the fallback Run process owns the server (no shell was open). */
  ownerId: string | null;
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
  nextTerminalNumber: number;
  install: WorkspaceProcess | null;
  /** package.json that the last successful `npm install` covered, so it can be skipped. */
  installedPackageJson: string | null;
  run: WorkspaceRun | null;
  /** localhost ports that currently accept connections, with the terminal that found them. */
  servers: Map<number, ServerEntry>;
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
 * The package.json currently on disk. A workspace folder survives ordinary navigation, so
 * this marks which dependency set the last successful `npm install` covered.
 */
async function packageJsonOnDisk(root: string): Promise<string | null> {
  try {
    return await readFile(path.join(root, 'package.json'), 'utf8');
  } catch {
    return null;
  }
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

        // PostgreSQL and Prisma tasks need the machine's server; fail with a clear
        // message before anything is started when it is not ready.
        const host = await resolveHostEnvironment();
        const database = requiresPostgres(taskId, input.files)
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
          nextTerminalNumber: 1,
          install: null,
          installedPackageJson: null,
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

  getPreviewUrl(taskIdValue: unknown): string {
    const taskId = assertTaskId(taskIdValue);
    const session = this.requireSession(taskId);

    if (session.closed) {
      throw new Error('The workspace is closed.');
    }

    return session.server.url;
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

      const packageJson = await packageJsonOnDisk(session.root);
      if (packageJson !== null && packageJson === session.installedPackageJson) {
        // The trainee visited another section and came back: the folder and node_modules
        // are still here, so report the existing install as done instead of running it again.
        this.callbacks.emitEvent({ type: 'run-exited', taskId, kind: 'install', exitCode: 0 });
        return;
      }

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
          if (exitCode === 0) session.installedPackageJson = packageJson;
          if (session.closed) return;
          this.callbacks.emitEvent({ type: 'run-exited', taskId, kind: 'install', exitCode });
        });
      }
    });
  }

  async dev(taskIdValue: unknown, commandValue: unknown, terminalIdValue?: unknown): Promise<void> {
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
      // An explicit id must belong to this workspace; omitting it keeps the old first-shell
      // behaviour for callers that predate multiple sessions.
      const target =
        this.optionalTerminalFor(session, terminalIdValue) ??
        (terminalIdValue == null ? [...session.terminals.values()][0] : null);

      if (session.run) {
        session.run.process.stop();
        session.run = null;
      }

      if (target) {
        this.clearServers(session, target.terminal.id);
        target.scan = this.scannerFor(session, target.terminal.id);
        // Ctrl+C stops whatever is already running; the command then appears as if typed.
        target.terminal.write('\u0003');
        await delay(COMMAND_DELAY_MS);
        if (session.closed || !session.terminals.has(target.terminal.id)) return;
        target.terminal.write(`${command}\n`);
        return;
      }

      this.clearServers(session, null);
      const host = await resolveHostEnvironment();
      const { command: executable, args } = splitCommand(command);
      const scan = this.scannerFor(session, null);
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

  async stop(taskIdValue: unknown, terminalIdValue?: unknown): Promise<void> {
    const taskId = assertTaskId(taskIdValue);
    return this.exclusive(taskId, () => {
      const session = this.sessions.get(taskId);
      if (!session) return;

      const target = this.optionalTerminalFor(session, terminalIdValue);
      if (target) {
        this.clearServers(session, target.terminal.id);
        target.scan = this.scannerFor(session, target.terminal.id);
        target.terminal.write('\u0003');
        return;
      }

      // Omitting the id keeps the original Stop-the-whole-workspace behaviour.
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

  async openTerminal(input: unknown): Promise<{ terminalId: string; name: string }> {
    const parsed = parseTerminalInput(input);
    const taskId = assertTaskId(parsed.taskId);
    return this.exclusive(taskId, async () => {
      const session = this.requireSession(taskId);
      if (session.terminals.size >= MAX_TERMINALS_PER_TASK) {
        throw new Error(
          `Maximum of ${MAX_TERMINALS_PER_TASK} terminal sessions reached. Close one first.`
        );
      }

      const host = await resolveHostEnvironment();
      if (session.closed) throw new Error('The workspace is closed.');

      const terminalId = randomUUID();
      const name = `T${session.nextTerminalNumber++}`;
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
            this.callbacks.emitTerminalData({ taskId, terminalId, data });
            entry.scan(stripAnsi(data));
          },
          onExit: (exitCode) => {
            session.terminals.delete(terminalId);
            if (session.closed) return;
            // A dev server started from this shell dies with it. Only its own ports close;
            // servers announced by other terminals keep their Preview state.
            this.clearServers(session, terminalId);
            this.callbacks.emitTerminalExit({ taskId, terminalId, exitCode });
          },
        }),
        scan: this.scannerFor(session, terminalId),
        name,
      };
      session.terminals.set(terminalId, entry);
      return { terminalId, name };
    });
  }

  async writeTerminal(
    taskIdValue: unknown,
    terminalIdValue: unknown,
    dataValue: unknown
  ): Promise<void> {
    const taskId = assertTaskId(taskIdValue);
    if (typeof dataValue !== 'string' || dataValue.length > MAX_TERMINAL_WRITE_CHARS) {
      throw new Error('Invalid terminal input.');
    }
    this.requireTerminal(this.requireSession(taskId), terminalIdValue).terminal.write(dataValue);
    return Promise.resolve();
  }

  async resizeTerminal(
    taskIdValue: unknown,
    terminalIdValue: unknown,
    colsValue: unknown,
    rowsValue: unknown
  ): Promise<void> {
    const taskId = assertTaskId(taskIdValue);
    const cols = parseDimension(colsValue);
    const rows = parseDimension(rowsValue);
    this.requireTerminal(this.requireSession(taskId), terminalIdValue).terminal.resize(cols, rows);
    return Promise.resolve();
  }

  async closeTerminal(taskIdValue: unknown, terminalIdValue: unknown): Promise<void> {
    const taskId = assertTaskId(taskIdValue);
    const session = this.requireSession(taskId);
    const terminalId = parseTerminalId(terminalIdValue);
    const entry = session.terminals.get(terminalId);
    if (!entry) throw new Error('Terminal is not open in this workspace.');

    session.terminals.delete(terminalId);
    entry.terminal.kill();
    // The kill callback also runs on exit; clearing here keeps the UI response immediate and
    // is idempotent because the owned port set has already been removed from the map.
    this.clearServers(session, terminalId);
    return Promise.resolve();
  }

  private requireTerminal(session: WorkspaceSession, terminalIdValue: unknown): TerminalEntry {
    const terminalId = parseTerminalId(terminalIdValue);
    const entry = session.terminals.get(terminalId);
    if (!entry) throw new Error('Terminal is not open in this workspace.');
    return entry;
  }

  private optionalTerminalFor(
    session: WorkspaceSession,
    terminalIdValue: unknown
  ): TerminalEntry | null {
    if (terminalIdValue === undefined || terminalIdValue === null) return null;
    return this.requireTerminal(session, terminalIdValue);
  }

  private requireSession(taskId: string): WorkspaceSession {
    const session = this.sessions.get(taskId);
    if (!session) throw new Error('Open the workspace before using it.');
    return session;
  }

  private scannerFor(session: WorkspaceSession, ownerId: string | null): PortWatcher {
    return createPortWatcher((port) => {
      void this.announcePort(session, port, ownerId);
    });
  }

  private resetScanners(session: WorkspaceSession): void {
    for (const entry of session.terminals.values()) {
      entry.scan = this.scannerFor(session, entry.terminal.id);
    }
  }

  private async announcePort(
    session: WorkspaceSession,
    port: number,
    ownerId: string | null
  ): Promise<void> {
    if (session.closed || session.servers.has(port) || session.pendingPorts.has(port)) return;
    session.pendingPorts.add(port);
    try {
      const listening = await waitForPort(port, PORT_TIMEOUT_MS);
      if (!listening || session.closed || session.servers.has(port)) return;

      const url = `http://localhost:${port}`;
      session.servers.set(port, { url, ownerId });
      this.callbacks.emitEvent({
        type: 'server-ready',
        taskId: session.taskId,
        port,
        url,
        terminalId: ownerId ?? undefined,
      });
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
        const server = session.servers.get(port);
        if (!server) return;
        session.servers.delete(port);
        this.forgetPort(session, port);
        this.callbacks.emitEvent({
          type: 'server-closed',
          taskId: session.taskId,
          port,
          terminalId: server.ownerId ?? undefined,
        });
      });
    }, PORT_POLL_MS);
    timer.unref?.();
    session.portMonitors.set(port, timer);
  }

  /**
   * Closes servers owned by one terminal, the fallback Run process, or everything. A port is
   * forgotten by every terminal so a later server can reuse it and be announced again.
   */
  private clearServers(session: WorkspaceSession, ownerId?: string | null): void {
    if (ownerId === undefined) {
      for (const timer of session.portMonitors.values()) clearInterval(timer);
      session.portMonitors.clear();
    }

    const closing = [...session.servers.entries()].filter(
      ([, server]) => ownerId === undefined || server.ownerId === ownerId
    );
    for (const [port, server] of closing) {
      const timer = session.portMonitors.get(port);
      if (timer) clearInterval(timer);
      session.portMonitors.delete(port);
      session.servers.delete(port);
      this.forgetPort(session, port);
      this.callbacks.emitEvent({
        type: 'server-closed',
        taskId: session.taskId,
        port,
        terminalId: server.ownerId ?? undefined,
      });
    }
  }

  private forgetPort(session: WorkspaceSession, port: number): void {
    // The next server on this port may be started from a different terminal, so no scanner
    // may still remember the old URL.
    for (const entry of session.terminals.values()) entry.scan.forget(port);
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
