import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { WorkspaceEvent } from '@itp/types';
import { isPreviewMessage, type PreviewMessage } from '../browser/previewMessages';
import { resolvePath } from '../browser/resolvePath';
import { storageKey, type ConsoleEntry, type ConsoleLevel } from '../previewConsole';
import { useWorkspaceEvents } from './useLocalWorkspace';

export type LocalPreviewRun = {
  runId: string;
  url: string;
  entryPath: string;
};

type UseLocalPreviewOptions = {
  taskId: string;
  files: Record<string, string>;
  entryPath: string | null;
  setEntryPath: (path: string) => void;
  isVisible: boolean;
  previewUrl: string | null;
  isReady: boolean;
  iframeRef: RefObject<HTMLIFrameElement | null>;
};

type UseLocalPreviewResult = {
  run: LocalPreviewRun | null;
  entries: ConsoleEntry[];
  errorCount: number;
  isDomReady: boolean;
  isRunning: boolean;
  /** Starts a run; omit the entry to use the currently selected one. */
  start: (target?: string) => void;
  clearConsole: () => void;
  resetStorage: () => void;
};

const MAX_ENTRIES = 1000;
const ERROR_LEVELS: ConsoleLevel[] = ['error', 'runtime', 'build'];
const READY_TIMEOUT_MS = 6_000;

function readStoredStorage(taskId: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(storageKey(taskId));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((pair): pair is [string, string] => typeof pair[1] === 'string')
    );
  } catch {
    return {};
  }
}

function writeStoredStorage(taskId: string, storage: Record<string, string>): void {
  try {
    if (Object.keys(storage).length === 0) window.localStorage.removeItem(storageKey(taskId));
    else window.localStorage.setItem(storageKey(taskId), JSON.stringify(storage));
  } catch {
    // Storage blocked or full: values still live in memory until the page reloads.
  }
}

/**
 * Preview state for a host workspace: the page is served over loopback HTTP, console output
 * arrives as workspace events, and navigation/storage still arrive over postMessage from the
 * sandboxed bridge.
 */
export function useLocalPreview({
  taskId,
  files,
  entryPath,
  setEntryPath,
  isVisible,
  previewUrl,
  isReady,
  iframeRef,
}: UseLocalPreviewOptions): UseLocalPreviewResult {
  const [run, setRun] = useState<LocalPreviewRun | null>(null);
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [isDomReady, setIsDomReady] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const filesRef = useRef(files);
  const entryPathRef = useRef(entryPath);
  const runRef = useRef<LocalPreviewRun | null>(run);
  useLayoutEffect(() => {
    filesRef.current = files;
    entryPathRef.current = entryPath;
    runRef.current = run;
  });

  const nextIdRef = useRef(1);
  const runIdRef = useRef<string | null>(null);
  const hasRunRef = useRef(false);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageRef = useRef<{ taskId: string; data: Record<string, string> } | null>(null);

  const getStorage = useCallback((): Record<string, string> => {
    if (storageRef.current?.taskId !== taskId) {
      storageRef.current = { taskId, data: readStoredStorage(taskId) };
    }
    return storageRef.current.data;
  }, [taskId]);

  const setStorage = useCallback(
    (data: Record<string, string>) => {
      storageRef.current = { taskId, data };
      writeStoredStorage(taskId, data);
    },
    [taskId]
  );

  const makeEntry = useCallback(
    (level: ConsoleLevel, text: string, ts = Date.now()): ConsoleEntry => ({
      id: nextIdRef.current++,
      ts,
      level,
      text,
    }),
    []
  );

  const addEntry = useCallback((entry: ConsoleEntry) => {
    setEntries((current) => {
      const next = [...current, entry];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });
  }, []);

  const startFor = useCallback(
    (target: string) => {
      if (!previewUrl) return;
      hasRunRef.current = true;
      const runId = crypto.randomUUID();
      runIdRef.current = runId;

      const query = new URLSearchParams({
        run: runId,
        parent: window.location.origin,
        storage: JSON.stringify(getStorage()),
      });
      const next: LocalPreviewRun = {
        runId,
        url: `${previewUrl}/${encodeURI(target)}?${query.toString()}`,
        entryPath: target,
      };

      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      setRun(next);
      setEntries([]);
      setIsDomReady(false);
      setIsRunning(true);
      readyTimerRef.current = setTimeout(() => {
        readyTimerRef.current = null;
        setIsRunning(false);
      }, READY_TIMEOUT_MS);
    },
    [getStorage, previewUrl]
  );

  const start = useCallback(
    (target?: string) => {
      const next = target ?? entryPathRef.current;
      if (next === null) return;
      startFor(next);
    },
    [startFor]
  );

  // First run happens when the Result pane is first shown, like the in-browser runtime.
  useEffect(() => {
    if (!isVisible || !isReady || hasRunRef.current || entryPath === null) return;
    startFor(entryPath);
  }, [entryPath, isReady, isVisible, startFor]);

  const handleMessage = useCallback(
    (data: PreviewMessage) => {
      switch (data.type) {
        case 'console':
          addEntry(makeEntry(data.level, data.args.join(' '), data.ts));
          break;
        case 'runtime-error': {
          const source =
            data.source && data.line !== undefined ? `${data.source}:${data.line}` : data.source;
          addEntry({
            id: nextIdRef.current++,
            ts: data.ts,
            level: 'runtime',
            text: data.message,
            ...(source ? { source } : {}),
          });
          break;
        }
        case 'console-clear':
          setEntries([]);
          break;
        case 'dom-ready':
          setIsDomReady(true);
          break;
        case 'navigate': {
          const from = runRef.current?.entryPath ?? entryPathRef.current ?? '';
          const target = resolvePath(from, data.href);
          if (target === null || !target.endsWith('.html') || !(target in filesRef.current)) {
            addEntry(makeEntry('system', `${target ?? data.href} not found`));
            return;
          }
          setEntryPath(target);
          startFor(target);
          break;
        }
        case 'storage': {
          const next = { ...getStorage() };
          if (data.op === 'clear') {
            for (const key of Object.keys(next)) delete next[key];
          } else if (data.key !== undefined) {
            if (data.op === 'set' && data.value !== undefined) next[data.key] = data.value;
            if (data.op === 'remove') delete next[data.key];
          }
          setStorage(next);
          break;
        }
      }
    },
    [addEntry, getStorage, makeEntry, setEntryPath, setStorage, startFor]
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;
      const data: unknown = event.data;
      if (!isPreviewMessage(data) || data.runId !== runIdRef.current) return;
      handleMessage(data);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleMessage, iframeRef]);

  // Console and readiness come from the workspace server's bridge endpoint.
  useWorkspaceEvents(taskId, (event: WorkspaceEvent) => {
    if (
      event.type !== 'console' &&
      event.type !== 'console-clear' &&
      event.type !== 'preview-ready'
    ) {
      return;
    }
    // A page from an older Run may still flush its buffered messages.
    if (event.runId !== runIdRef.current) return;

    if (event.type === 'console') {
      addEntry(makeEntry(event.level, event.args.join(' '), event.ts));
      return;
    }
    if (event.type === 'console-clear') {
      setEntries([]);
      return;
    }
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    readyTimerRef.current = null;
    setIsDomReady(true);
    setIsRunning(false);
  });

  useEffect(
    () => () => {
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    },
    []
  );

  const clearConsole = useCallback(() => setEntries([]), []);

  const resetStorage = useCallback(() => {
    setStorage({});
    addEntry(makeEntry('system', 'localStorage cleared. It starts empty on the next Run.'));
  }, [addEntry, makeEntry, setStorage]);

  const errorCount = useMemo(
    () => entries.filter((entry) => ERROR_LEVELS.includes(entry.level)).length,
    [entries]
  );

  return { run, entries, errorCount, isDomReady, isRunning, start, clearConsole, resetStorage };
}
