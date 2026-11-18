import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { Terminal } from '@xterm/xterm';
import type { WorkspaceEvent } from '@itp/types';
import { getRunApi, getTerminalApi, getWorkspaceApi, isWorkspaceEvent } from './localWorkspace';

export type LocalNodeStatus = 'booting' | 'installing' | 'ready' | 'error';

export type LocalServer = { port: number; url: string };

type UseLocalNodeSessionOptions = {
  taskId: string;
  enabled: boolean;
  terminal: Terminal | null;
  files: Record<string, string>;
  blockedError: string | null;
  /** Called when a dev server becomes reachable (the runtime brings its Preview tab forward). */
  onServerReady?: (server: LocalServer) => void;
};

type UseLocalNodeSessionResult = {
  status: LocalNodeStatus;
  errorMessage: string | null;
  server: LocalServer | null;
  runCommand: (command: string) => void;
  resize: (cols: number, rows: number) => void;
  retry: () => void;
};

const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/** Matches MAX_TERMINAL_WRITE_CHARS in the main process; larger writes are rejected there. */
const MAX_WRITE_CHARS = 16_384;
/** Keys pressed while the PTY is still opening are kept, up to this many characters. */
const MAX_QUEUED_INPUT_CHARS = 4_096;

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

/**
 * One host shell per mounted Node task. Install and Run output is written into the
 * same xterm, and localhost ports the shell prints become the Preview tab.
 */
export function useLocalNodeSession({
  taskId,
  enabled,
  terminal,
  files,
  blockedError,
  onServerReady,
}: UseLocalNodeSessionOptions): UseLocalNodeSessionResult {
  const [status, setStatus] = useState<LocalNodeStatus>('booting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [server, setServer] = useState<LocalServer | null>(null);
  const [attempt, setAttempt] = useState(0);

  const filesRef = useRef(files);
  const onServerReadyRef = useRef(onServerReady);
  useLayoutEffect(() => {
    filesRef.current = files;
    onServerReadyRef.current = onServerReady;
  });

  const terminalIdRef = useRef<string | null>(null);
  const pendingSizeRef = useRef<{ cols: number; rows: number } | null>(null);

  useEffect(() => {
    if (blockedError) return;
    const terminalApi = getTerminalApi();
    const runApi = getRunApi();
    const workspaceApi = getWorkspaceApi();
    if (!enabled || !terminal || !terminalApi || !runApi || !workspaceApi) return;

    let cancelled = false;
    let terminalId: string | null = null;
    terminalIdRef.current = null;

    // The shell is a real PTY: every keystroke goes to main, which writes it to the process.
    const queuedInput: string[] = [];
    let queuedChars = 0;
    const sendInput = (id: string, data: string) => {
      for (let offset = 0; offset < data.length; offset += MAX_WRITE_CHARS) {
        void terminalApi
          .write(id, data.slice(offset, offset + MAX_WRITE_CHARS))
          .catch(() => undefined);
      }
    };

    terminal.write(`${DIM}Starting Node…${RESET}\r\n`);

    const inputSubscription = terminal.onData((data) => {
      if (cancelled) return;
      if (terminalId === null) {
        // Typing before open() resolves: hold the keys and send them once the shell exists.
        if (queuedChars + data.length <= MAX_QUEUED_INPUT_CHARS) {
          queuedInput.push(data);
          queuedChars += data.length;
        }
        return;
      }
      sendInput(terminalId, data);
    });

    const offData = terminalApi.onData((event) => {
      if (cancelled) return;
      if (terminalId !== null && event.terminalId !== terminalId) return;
      terminal.write(event.data);
    });

    const offExit = terminalApi.onExit((event) => {
      if (terminalId !== null && event.terminalId !== terminalId) return;
      if (cancelled) return;
      terminal.write(`\r\n${YELLOW}Terminal exited (${event.exitCode}).${RESET}\r\n`);
    });

    const offEvents = workspaceApi.onEvent((payload) => {
      if (!isWorkspaceEvent(payload) || payload.taskId !== taskId) return;
      handleWorkspaceEvent(
        payload,
        terminal,
        setServer,
        (code) => {
          if (cancelled) return;
          if (code !== 0) {
            terminal.write(
              `\r\n${YELLOW}npm install failed — fix package.json and run npm install again${RESET}\r\n`
            );
          }
          setStatus('ready');
        },
        (next) => onServerReadyRef.current?.(next)
      );
    });

    void terminalApi
      .open({ taskId, cols: terminal.cols, rows: terminal.rows })
      .then((result) => {
        if (cancelled) {
          void terminalApi.close(result.terminalId);
          return;
        }
        terminalId = result.terminalId;
        terminalIdRef.current = result.terminalId;

        if (queuedInput.length > 0) {
          sendInput(result.terminalId, queuedInput.join(''));
          queuedInput.length = 0;
          queuedChars = 0;
        }

        const pending = pendingSizeRef.current;
        if (pending) void terminalApi.resize(result.terminalId, pending.cols, pending.rows);

        if (hasDependencies(filesRef.current['package.json'])) {
          setStatus('installing');
          void runApi.install(taskId).catch((reason: unknown) => {
            if (cancelled) return;
            setStatus('error');
            setErrorMessage(reason instanceof Error ? reason.message : String(reason));
          });
        } else {
          setStatus('ready');
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(reason instanceof Error ? reason.message : String(reason));
      });

    return () => {
      cancelled = true;
      inputSubscription.dispose();
      offData();
      offExit();
      offEvents();
      const id = terminalId;
      terminalId = null;
      terminalIdRef.current = null;
      if (id) void terminalApi.close(id);
    };
  }, [attempt, blockedError, enabled, taskId, terminal]);

  const runCommand = useCallback(
    (command: string) => {
      const runApi = getRunApi();
      if (!runApi) return;
      void runApi.dev(taskId, command).catch((reason: unknown) => {
        setErrorMessage(reason instanceof Error ? reason.message : String(reason));
      });
    },
    [taskId]
  );

  const resize = useCallback((cols: number, rows: number) => {
    pendingSizeRef.current = { cols, rows };
    const terminalApi = getTerminalApi();
    const terminalId = terminalIdRef.current;
    if (!terminalApi || !terminalId) return;
    void terminalApi.resize(terminalId, cols, rows).catch(() => undefined);
  }, []);

  const retry = useCallback(() => {
    setStatus('booting');
    setErrorMessage(null);
    setServer(null);
    setAttempt((current) => current + 1);
  }, []);

  return {
    status: blockedError ? 'error' : status,
    errorMessage: blockedError ?? errorMessage,
    server,
    runCommand,
    resize,
    retry,
  };
}

function handleWorkspaceEvent(
  event: WorkspaceEvent,
  terminal: Terminal,
  setServer: Dispatch<SetStateAction<LocalServer | null>>,
  onInstallExit: (exitCode: number) => void,
  onServerReady: (server: LocalServer) => void
): void {
  switch (event.type) {
    case 'run-output':
      terminal.write(event.data);
      break;
    case 'run-exited':
      if (event.kind === 'install') onInstallExit(event.exitCode);
      break;
    case 'server-ready': {
      const next = { port: event.port, url: event.url };
      setServer(next);
      onServerReady(next);
      break;
    }
    case 'server-closed':
      setServer((current) => (current?.port === event.port ? null : current));
      break;
    default:
      break;
  }
}
