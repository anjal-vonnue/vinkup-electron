import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { WorkspaceEnvironment, WorkspaceEvent } from '@itp/types';
import {
  useWorkspaceDispatch,
  useWorkspaceState,
} from '../../pages/TaskPage/state/WorkspaceContext';
import {
  filesForWorkspace,
  getWorkspaceApi,
  isWorkspaceEvent,
  supportFilesForWorkspace,
} from './localWorkspace';

export type LocalWorkspaceStatus = 'opening' | 'ready' | 'error';

export type LocalWorkspace = {
  status: LocalWorkspaceStatus;
  error: string | null;
  environment: WorkspaceEnvironment | null;
  /** Loopback URL of the task's preview server; null until the workspace is open. */
  previewUrl: string | null;
  /** Writes the current editor files to disk now (Run uses this before starting). */
  flush: () => Promise<void>;
  retry: () => void;
};

const SYNC_DELAY_MS = 120;
const MISSING_API_ERROR = 'Local workspaces are only available in the desktop app.';

export type LocalWorkspaceOptions = {
  /** Checkpoint SQL: open the machine's PostgreSQL and pass DATABASE_URL to the workspace. */
  requiresPostgres?: boolean;
  /** Checkpoint SQL: schema loaded once, the first time the database is opened. */
  setupSql?: string | null;
};

/**
 * Opens the host workspace for a task, mirrors editor changes to disk and feeds
 * terminal-created files back into the editor. One hook per mounted runtime.
 */
export function useLocalWorkspace(
  taskId: string,
  options: LocalWorkspaceOptions = {}
): LocalWorkspace {
  const state = useWorkspaceState();
  const dispatch = useWorkspaceDispatch();
  const files = state.files;
  const requiresPostgres = options.requiresPostgres === true;
  const setupSql = options.setupSql ?? null;

  const api = getWorkspaceApi();
  const [status, setStatus] = useState<LocalWorkspaceStatus>(api ? 'opening' : 'error');
  const [error, setError] = useState<string | null>(api ? null : MISSING_API_ERROR);
  const [environment, setEnvironment] = useState<WorkspaceEnvironment | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Read by the open effect and the filesystem-event subscription; kept current after render.
  const filesRef = useRef(files);
  useLayoutEffect(() => {
    filesRef.current = files;
  });

  useEffect(() => {
    if (!api) return;

    let cancelled = false;
    const initialFiles = filesRef.current;

    void api
      .open({
        taskId,
        files: filesForWorkspace(initialFiles),
        supportFiles: supportFilesForWorkspace(initialFiles),
        requiresPostgres,
        setupSql,
      })
      .then((result) => {
        if (cancelled) return;
        setEnvironment({ nodeVersion: result.nodeVersion, error: result.error });
        setPreviewUrl(result.previewUrl);
        setStatus('ready');
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setError(reason instanceof Error ? reason.message : String(reason));
      });

    return () => {
      cancelled = true;
      // Leaving the route (Resources, Journal, …) must not tear down the host workspace:
      // its folder holds node_modules, and the trainee expects to resume the same session.
      // WorkspaceSessionContext closes it when they explicitly leave (Home / Back to tasks).
    };
  }, [api, taskId, attempt, requiresPostgres, setupSql]);

  const retry = useCallback(() => {
    setStatus('opening');
    setError(null);
    setAttempt((current) => current + 1);
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    if (!api || status !== 'ready') return;
    await api.sync({
      taskId,
      files: filesForWorkspace(filesRef.current),
      supportFiles: supportFilesForWorkspace(filesRef.current),
    });
  }, [api, status, taskId]);

  // Editor → disk. A short debounce keeps typing from queueing one write per keystroke.
  useEffect(() => {
    if (!api || status !== 'ready') return;
    const timer = setTimeout(() => {
      void api
        .sync({
          taskId,
          files: filesForWorkspace(files),
          supportFiles: supportFilesForWorkspace(files),
        })
        .catch((reason: unknown) => {
          console.error('[workspace] Failed to sync files to disk', reason);
        });
    }, SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [api, files, status, taskId]);

  // Disk → editor, for files a terminal command created, changed or removed.
  useEffect(() => {
    if (!api) return;
    return api.onEvent((payload) => {
      if (!isWorkspaceEvent(payload) || payload.taskId !== taskId) return;
      if (payload.type !== 'file-changed') return;

      if (payload.content === null) {
        dispatch({ type: 'fileDeleted', path: payload.path });
        return;
      }
      dispatch(
        payload.path in filesRef.current
          ? { type: 'fileEdited', path: payload.path, content: payload.content }
          : { type: 'fileCreated', path: payload.path, content: payload.content, open: false }
      );
    });
  }, [api, dispatch, taskId]);

  return { status, error, environment, previewUrl, flush, retry };
}

/** Subscribes to workspace events for one task with a stable callback. */
export function useWorkspaceEvents(taskId: string, handler: (event: WorkspaceEvent) => void): void {
  const api = getWorkspaceApi();
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!api) return;
    return api.onEvent((payload) => {
      if (!isWorkspaceEvent(payload) || payload.taskId !== taskId) return;
      handlerRef.current(payload);
    });
  }, [api, taskId]);
}
