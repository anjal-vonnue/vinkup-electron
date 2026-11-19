import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Terminal } from '@xterm/xterm';
import { MAX_TERMINALS_PER_TASK } from '@itp/types';
import { getRunApi, getTerminalApi, getWorkspaceApi, isWorkspaceEvent } from './localWorkspace';

export type LocalNodeStatus = 'booting' | 'installing' | 'ready' | 'error';

export type LocalServer = { port: number; url: string; terminalId?: string };

export type LocalTerminalStatus = 'opening' | 'ready' | 'exited' | 'error';

export type LocalTerminalSession = {
  /** Renderer-only key; stable while the main-process id is still being assigned. */
  key: string;
  name: string;
  terminalId: string | null;
  status: LocalTerminalStatus;
  exitCode: number | null;
  error: string | null;
};

type UseLocalNodeSessionOptions = {
  taskId: string;
  enabled: boolean;
  files: Record<string, string>;
  blockedError: string | null;
  /** Called when a dev server becomes reachable (the runtime brings its Preview tab forward). */
  onServerReady?: (server: LocalServer) => void;
  /** Called when a dev server stops, with the servers that are still reachable. */
  onServerClosed?: (port: number, remaining: LocalServer[]) => void;
  /** Called when the trainee types into any terminal, for work-activity tracking. */
  onTerminalActivity?: () => void;
};

type UseLocalNodeSessionResult = {
  status: LocalNodeStatus;
  errorMessage: string | null;
  servers: LocalServer[];
  /** Most recently detected server; kept for the single-Preview call sites. */
  server: LocalServer | null;
  terminals: LocalTerminalSession[];
  activeTerminalKey: string | null;
  activeTerminalId: string | null;
  terminalError: string | null;
  isCreatingTerminal: boolean;
  registerTerminal: (key: string, terminal: Terminal) => void;
  createTerminal: () => void;
  selectTerminal: (key: string) => void;
  closeTerminal: (key: string) => void;
  retryTerminal: (key: string) => void;
  focusActiveTerminal: () => void;
  runCommand: (command: string) => void;
  stopActive: () => void;
  resize: (key: string, cols: number, rows: number) => void;
  retry: () => void;
};

type InternalTerminal = {
  key: string;
  name: string;
  terminalId: string | null;
  instance: Terminal | null;
  announcedStart: boolean;
  status: LocalTerminalStatus;
  exitCode: number | null;
  error: string | null;
  queuedInput: string[];
  queuedChars: number;
  pendingSize: { cols: number; rows: number } | null;
  inputDisposer: { dispose(): void } | null;
  opening: boolean;
  closed: boolean;
};

type InstallBarrier = {
  promise: Promise<void>;
  resolve: () => void;
  started: boolean;
  done: boolean;
  failed: boolean;
};

const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/** Matches MAX_TERMINAL_WRITE_CHARS in the main process; larger writes are rejected there. */
const MAX_WRITE_CHARS = 16_384;
/** Keys pressed while the PTY is still opening are kept, up to this many characters. */
const MAX_QUEUED_INPUT_CHARS = 4_096;

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function createBarrier(): InstallBarrier {
  let finish!: () => void;
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const barrier: InstallBarrier = {
    promise,
    resolve: () => undefined,
    started: false,
    done: false,
    failed: false,
  };
  barrier.resolve = () => {
    if (barrier.done) return;
    barrier.done = true;
    finish();
  };
  return barrier;
}

/** true when package.json lists anything to install */
function hasDependencies(packageJson: string | undefined): boolean {
  if (!packageJson) return false;
  try {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return (
      Object.keys(parsed.dependencies ?? {}).length > 0 ||
      Object.keys(parsed.devDependencies ?? {}).length > 0
    );
  } catch {
    return false; // a broken package.json: npm will say so when the trainee runs it
  }
}

function toPublicTerminal(session: InternalTerminal): LocalTerminalSession {
  return {
    key: session.key,
    name: session.name,
    terminalId: session.terminalId,
    status: session.status,
    exitCode: session.exitCode,
    error: session.error,
  };
}

/**
 * Owns the mounted Node task's terminal tabs and their host PTYs. Install and Run output is
 * written into the relevant xterm, and every terminal's output is watched for Preview ports.
 */
export function useLocalNodeSession({
  taskId,
  enabled,
  files,
  blockedError,
  onServerReady,
  onServerClosed,
  onTerminalActivity,
}: UseLocalNodeSessionOptions): UseLocalNodeSessionResult {
  const [status, setStatus] = useState<LocalNodeStatus>('booting');
  const [errorMessageState, setErrorMessage] = useState<string | null>(null);
  const [servers, setServers] = useState<LocalServer[]>([]);
  const [terminals, setTerminals] = useState<LocalTerminalSession[]>([]);
  const [activeTerminalKey, setActiveTerminalKey] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);

  const filesRef = useRef(files);
  const onServerReadyRef = useRef(onServerReady);
  const onServerClosedRef = useRef(onServerClosed);
  const onTerminalActivityRef = useRef(onTerminalActivity);
  const serversRef = useRef<LocalServer[]>([]);
  useLayoutEffect(() => {
    filesRef.current = files;
    onServerReadyRef.current = onServerReady;
    onServerClosedRef.current = onServerClosed;
    onTerminalActivityRef.current = onTerminalActivity;
  });

  const sessionsRef = useRef(new Map<string, InternalTerminal>());
  const activeKeyRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const nextSessionNumberRef = useRef(1);
  const nextNameNumberRef = useRef(1);
  const installRef = useRef<InstallBarrier>(createBarrier());

  const syncTerminals = useCallback(() => {
    const list = [...sessionsRef.current.values()].filter((session) => !session.closed);
    setTerminals(list.map(toPublicTerminal));
  }, []);

  const beginInstall = useCallback(() => {
    const state = installRef.current;
    if (state.started) return state.promise;
    state.started = true;

    if (!hasDependencies(filesRef.current['package.json'])) {
      state.resolve();
      return state.promise;
    }

    setStatus('installing');
    const api = getRunApi();
    if (!api) {
      state.failed = true;
      state.resolve();
      setStatus('error');
      setErrorMessage('Local run operations are only available in the desktop app.');
      return state.promise;
    }

    // The host emits `run-exited` when npm finishes; resolving on the IPC promise alone
    // would open the shell before npm's output and put its prompt above the install log.
    void api.install(taskId).catch((reason: unknown) => {
      state.failed = true;
      setStatus('error');
      setErrorMessage(errorMessage(reason));
      state.resolve();
    });
    return state.promise;
  }, [taskId]);

  const openSession = useCallback(
    async (key: string) => {
      const generation = generationRef.current;
      const session = sessionsRef.current.get(key);
      const api = getTerminalApi();
      if (
        !session ||
        session.closed ||
        session.opening ||
        session.terminalId ||
        !session.instance
      ) {
        return;
      }
      if (!api) return;

      session.opening = true;
      session.status = 'opening';
      syncTerminals();

      try {
        await beginInstall();
        if (generation !== generationRef.current || session.closed || !session.instance) return;

        const result = await api.open({
          taskId,
          cols: session.instance.cols,
          rows: session.instance.rows,
        });
        if (generation !== generationRef.current || session.closed) {
          void api.close(taskId, result.terminalId).catch(() => undefined);
          return;
        }

        session.terminalId = result.terminalId;
        session.name = result.name || session.name;
        session.opening = false;
        session.status = 'ready';
        session.error = null;
        if (!installRef.current.failed) setStatus('ready');
        syncTerminals();

        if (session.queuedInput.length > 0) {
          void api
            .write(taskId, result.terminalId, session.queuedInput.join(''))
            .catch(() => undefined);
          session.queuedInput = [];
          session.queuedChars = 0;
        }
        if (session.pendingSize) {
          void api
            .resize(taskId, result.terminalId, session.pendingSize.cols, session.pendingSize.rows)
            .catch(() => undefined);
        }
      } catch (reason: unknown) {
        if (generation !== generationRef.current || session.closed) return;
        const message = errorMessage(reason);
        session.opening = false;
        session.status = 'error';
        session.error = message;
        setTerminalError(message);
        if (![...sessionsRef.current.values()].some((candidate) => candidate.status === 'ready')) {
          setStatus('error');
          setErrorMessage(message);
        }
        syncTerminals();
      }
    },
    [beginInstall, syncTerminals, taskId]
  );

  const addSession = useCallback(() => {
    setTerminalError(null);
    if (sessionsRef.current.size >= MAX_TERMINALS_PER_TASK) {
      setTerminalError(
        `Maximum of ${MAX_TERMINALS_PER_TASK} terminal sessions reached. Close one first.`
      );
      return;
    }

    const key = `terminal-${nextSessionNumberRef.current++}`;
    const session: InternalTerminal = {
      key,
      name: `T${nextNameNumberRef.current++}`,
      terminalId: null,
      instance: null,
      announcedStart: false,
      status: 'opening',
      exitCode: null,
      error: null,
      queuedInput: [],
      queuedChars: 0,
      pendingSize: null,
      inputDisposer: null,
      opening: false,
      closed: false,
    };
    sessionsRef.current.set(key, session);
    activeKeyRef.current = key;
    setActiveTerminalKey(key);
    syncTerminals();
  }, [syncTerminals]);

  const bindTerminalInput = useCallback(
    (session: InternalTerminal, instance: Terminal) => {
      // A replacement xterm (or a restarted PTY) needs a fresh subscription; the PTY itself
      // is owned by the session and must not be reopened just to restore typing.
      session.inputDisposer?.dispose();
      session.instance = instance;

      const api = getTerminalApi();
      session.inputDisposer = instance.onData((data) => {
        const generation = generationRef.current;
        if (session.closed || generation !== generationRef.current) return;
        onTerminalActivityRef.current?.();
        if (!session.terminalId) {
          if (session.queuedChars + data.length <= MAX_QUEUED_INPUT_CHARS) {
            session.queuedInput.push(data);
            session.queuedChars += data.length;
          }
          return;
        }
        for (let offset = 0; offset < data.length; offset += MAX_WRITE_CHARS) {
          void api?.write(taskId, session.terminalId, data.slice(offset, offset + MAX_WRITE_CHARS));
        }
      });
    },
    [taskId]
  );

  const reopenSession = useCallback(
    (key: string) => {
      const session = sessionsRef.current.get(key);
      if (!session || session.closed || !session.instance || session.opening) return;
      session.terminalId = null;
      session.exitCode = null;
      session.error = null;
      session.queuedInput = [];
      session.queuedChars = 0;
      activeKeyRef.current = key;
      setActiveTerminalKey(key);
      bindTerminalInput(session, session.instance);
      void openSession(key);
    },
    [bindTerminalInput, openSession]
  );

  const registerTerminal = useCallback(
    (key: string, instance: Terminal) => {
      const session = sessionsRef.current.get(key);
      if (!session || session.closed || session.instance === instance) return;

      // StrictMode (and any remount) disposes the previous xterm and reports a fresh one.
      if (!session.announcedStart) {
        session.announcedStart = true;
        if (sessionsRef.current.size === 1) instance.write(`${DIM}Starting Node…${RESET}\r\n`);
      }

      bindTerminalInput(session, instance);
      if (!session.terminalId) void openSession(key);
    },
    [bindTerminalInput, openSession]
  );

  const selectTerminal = useCallback((key: string) => {
    if (!sessionsRef.current.has(key)) return;
    activeKeyRef.current = key;
    setActiveTerminalKey(key);
    setTerminalError(null);
  }, []);

  const closeTerminal = useCallback(
    (key: string) => {
      const session = sessionsRef.current.get(key);
      if (!session || session.closed) return;
      if (sessionsRef.current.size <= 1) {
        setTerminalError('Keep at least one terminal open.');
        return;
      }

      const wasActive = activeKeyRef.current === key;
      session.closed = true;
      session.inputDisposer?.dispose();
      sessionsRef.current.delete(key);

      if (session.terminalId) {
        void getTerminalApi()
          ?.close(taskId, session.terminalId)
          .catch(() => undefined);
      }

      if (wasActive) {
        const remaining = [...sessionsRef.current.values()];
        const next = remaining.find((candidate) => candidate.status === 'ready') ?? remaining[0];
        activeKeyRef.current = next?.key ?? null;
        setActiveTerminalKey(activeKeyRef.current);
      }
      setTerminalError(null);
      syncTerminals();
    },
    [syncTerminals, taskId]
  );

  const retryTerminal = useCallback(
    (key: string) => {
      setTerminalError(null);
      setErrorMessage(null);
      reopenSession(key);
    },
    [reopenSession]
  );

  const resize = useCallback(
    (key: string, cols: number, rows: number) => {
      const session = sessionsRef.current.get(key);
      if (!session || session.closed) return;
      session.pendingSize = { cols, rows };
      if (!session.terminalId) return;
      void getTerminalApi()
        ?.resize(taskId, session.terminalId, cols, rows)
        .catch(() => undefined);
    },
    [taskId]
  );

  const activeSession = useCallback(
    () => (activeKeyRef.current ? sessionsRef.current.get(activeKeyRef.current) : undefined),
    []
  );

  const focusActiveTerminal = useCallback(
    () => activeSession()?.instance?.focus(),
    [activeSession]
  );

  const runCommand = useCallback(
    (command: string) => {
      const api = getRunApi();
      const session = activeSession();
      if (!api) return;
      if (!session?.terminalId) {
        setTerminalError('Wait for the terminal to finish starting.');
        return;
      }
      void api.dev(taskId, command, session.terminalId).catch((reason: unknown) => {
        setErrorMessage(errorMessage(reason));
      });
    },
    [activeSession, taskId]
  );

  const stopActive = useCallback(() => {
    const api = getRunApi();
    const session = activeSession();
    if (!api || !session?.terminalId) return;
    void api.stop(taskId, session.terminalId).catch((reason: unknown) => {
      setErrorMessage(errorMessage(reason));
    });
  }, [activeSession, taskId]);

  const retry = useCallback(() => {
    const installFailed = installRef.current.failed;
    setStatus('booting');
    setErrorMessage(null);
    setTerminalError(null);
    installRef.current = createBarrier();

    if (installFailed) void beginInstall();
    const failed = [...sessionsRef.current.values()].filter(
      (session) => session.status === 'error' || session.status === 'exited'
    );
    if (failed.length === 0 && sessionsRef.current.size === 0) addSession();
    for (const session of failed) reopenSession(session.key);
  }, [addSession, beginInstall, reopenSession]);

  useEffect(() => {
    if (blockedError) return;
    const terminalApi = getTerminalApi();
    const runApi = getRunApi();
    const workspaceApi = getWorkspaceApi();
    if (!enabled || !terminalApi || !runApi || !workspaceApi) return;

    const generation = ++generationRef.current;
    // The map is created once and never replaced; capture it so cleanup uses this snapshot.
    const sessions = sessionsRef.current;

    const offData = terminalApi.onData((event) => {
      if (event.taskId !== taskId || generation !== generationRef.current) return;
      const target = [...sessions.values()].find(
        (session) => session.terminalId === event.terminalId
      );
      target?.instance?.write(event.data);
    });

    const offExit = terminalApi.onExit((event) => {
      if (event.taskId !== taskId || generation !== generationRef.current) return;
      const session = [...sessions.values()].find(
        (candidate) => candidate.terminalId === event.terminalId
      );
      if (!session || session.closed) return;

      session.terminalId = null;
      session.opening = false;
      session.status = 'exited';
      session.exitCode = event.exitCode;
      session.inputDisposer?.dispose();
      session.inputDisposer = null;
      session.instance?.write(`\r\n${YELLOW}Terminal exited (${event.exitCode}).${RESET}\r\n`);
      syncTerminals();

      if (activeKeyRef.current === session.key) {
        const others = [...sessions.values()].filter(
          (candidate) => candidate !== session && candidate.status !== 'exited'
        );
        const next = others[others.length - 1];
        if (next) {
          activeKeyRef.current = next.key;
          setActiveTerminalKey(next.key);
        }
      }

      // Losing the last usable shell would leave a dead terminal area, so replace it in place.
      const hasUsable = [...sessions.values()].some(
        (candidate) => candidate.status === 'ready' || candidate.status === 'opening'
      );
      if (!hasUsable) reopenSession(session.key);
    });

    const offEvents = workspaceApi.onEvent((payload) => {
      if (!isWorkspaceEvent(payload) || payload.taskId !== taskId) return;
      if (generation !== generationRef.current) return;

      switch (payload.type) {
        case 'run-output': {
          const target =
            [...sessions.values()].find((session) => session.instance)?.instance ??
            activeSession()?.instance;
          target?.write(payload.data);
          break;
        }
        case 'run-exited':
          if (payload.kind === 'install') {
            const state = installRef.current;
            if (!state.failed) setStatus('booting');
            state.resolve();
          }
          break;
        case 'server-ready': {
          const server: LocalServer = {
            port: payload.port,
            url: payload.url,
            terminalId: payload.terminalId,
          };
          serversRef.current = [
            ...serversRef.current.filter((candidate) => candidate.port !== server.port),
            server,
          ];
          setServers(serversRef.current);
          onServerReadyRef.current?.(server);
          break;
        }
        case 'server-closed': {
          serversRef.current = serversRef.current.filter((server) => server.port !== payload.port);
          setServers(serversRef.current);
          onServerClosedRef.current?.(payload.port, serversRef.current);
          break;
        }
        default:
          break;
      }
    });

    if (sessions.size === 0) addSession();

    return () => {
      generationRef.current += 1;
      offData();
      offExit();
      offEvents();
      for (const session of sessions.values()) {
        session.closed = true;
        session.inputDisposer?.dispose();
        if (session.terminalId) {
          void terminalApi.close(taskId, session.terminalId).catch(() => undefined);
        }
      }
      sessions.clear();
      activeKeyRef.current = null;
      serversRef.current = [];
      setTerminals([]);
      setServers([]);
      setActiveTerminalKey(null);
    };
  }, [activeSession, addSession, enabled, reopenSession, syncTerminals, taskId, blockedError]);

  const isCreatingTerminal = useMemo(
    () => terminals.some((session) => session.status === 'opening'),
    [terminals]
  );
  const activeTerminalId =
    terminals.find((session) => session.key === activeTerminalKey)?.terminalId ?? null;

  return {
    status: blockedError ? 'error' : status,
    errorMessage: blockedError ?? errorMessageState,
    servers,
    server: servers[servers.length - 1] ?? null,
    terminals,
    activeTerminalKey,
    activeTerminalId,
    terminalError,
    isCreatingTerminal,
    registerTerminal,
    createTerminal: addSession,
    selectTerminal,
    closeTerminal,
    retryTerminal,
    focusActiveTerminal,
    runCommand,
    stopActive,
    resize,
    retry,
  };
}
