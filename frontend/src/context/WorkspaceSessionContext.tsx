import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { WorkspaceState } from '../types/workspaceTypes';

type WorkspaceSession = {
  taskId: string;
  /** In-memory workspace state, including edits that have not reached the server yet. */
  state: WorkspaceState;
};

type WorkspaceSessionContextValue = {
  /** The task whose workspace should be restored when the trainee comes back Home. */
  activeTaskId: string | null;
  /** Registers or refreshes the active workspace snapshot. */
  rememberWorkspace: (taskId: string, state: WorkspaceState) => void;
  /** Snapshot to rehydrate a remounted workspace with, if one is preserved. */
  restoreWorkspace: (taskId: string) => WorkspaceState | null;
  /** Explicitly ends the session (workspace Home button / Back to tasks). */
  exitWorkspace: () => void;
};

const WorkspaceSessionContext = createContext<WorkspaceSessionContextValue>({
  activeTaskId: null,
  rememberWorkspace: () => {},
  restoreWorkspace: () => null,
  exitWorkspace: () => {},
});

/**
 * Keeps the active workspace across ordinary in-app section navigation. The snapshot
 * lives in a ref (not local/session storage): it must survive route unmounts but not
 * a page reload, and it must not duplicate the server as the source of saved files.
 */
export function WorkspaceSessionProvider({ children }: { children: ReactNode }) {
  const sessionRef = useRef<WorkspaceSession | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const rememberWorkspace = useCallback((taskId: string, state: WorkspaceState) => {
    sessionRef.current = { taskId, state };
    setActiveTaskId((current) => (current === taskId ? current : taskId));
  }, []);

  const restoreWorkspace = useCallback(
    (taskId: string) => (sessionRef.current?.taskId === taskId ? sessionRef.current.state : null),
    []
  );

  const exitWorkspace = useCallback(() => {
    sessionRef.current = null;
    setActiveTaskId(null);
  }, []);

  const value = useMemo(
    () => ({ activeTaskId, rememberWorkspace, restoreWorkspace, exitWorkspace }),
    [activeTaskId, rememberWorkspace, restoreWorkspace, exitWorkspace]
  );

  return (
    <WorkspaceSessionContext.Provider value={value}>{children}</WorkspaceSessionContext.Provider>
  );
}

export function useWorkspaceSession(): WorkspaceSessionContextValue {
  return useContext(WorkspaceSessionContext);
}
