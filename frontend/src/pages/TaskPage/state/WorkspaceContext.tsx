import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import type { TaskCodeResponse } from '@itp/types';
import { initWorkspace } from './initWorkspace';
import { workspaceReducer } from './workspaceReducer';
import type { PaneId, WorkspaceAction, WorkspaceState } from '../../../types/workspaceTypes';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { useWorkspaceSession } from '../../../context/WorkspaceSessionContext';

const PANES_STORAGE_KEY = 'itp.task.panes';

const WorkspaceStateContext = createContext<WorkspaceState | null>(null);
const WorkspaceDispatchContext = createContext<Dispatch<WorkspaceAction> | null>(null);

type WorkspaceProviderProps = {
  code: TaskCodeResponse;
  /** Task this workspace belongs to. Optional so isolated unit tests stay simple. */
  taskId?: string;
  /** Rehydrates an in-progress workspace when its route is restored. */
  initialState?: WorkspaceState;
  children: ReactNode;
};

export function WorkspaceProvider({
  code,
  taskId,
  initialState,
  children,
}: WorkspaceProviderProps) {
  const { rememberWorkspace } = useWorkspaceSession();
  const [storedPanes, setStoredPanes] = useLocalStorageState<Record<PaneId, boolean> | undefined>(
    PANES_STORAGE_KEY,
    undefined
  );

  const [state, dispatch] = useReducer(
    workspaceReducer,
    code,
    (initialCode) => initialState ?? initWorkspace(initialCode, storedPanes)
  );

  useEffect(() => {
    setStoredPanes(state.visiblePanes);
  }, [state.visiblePanes, setStoredPanes]);

  // Mirror every edit into the session so temporary navigation never loses unsaved work.
  // The snapshot is only read back when a new provider mounts for the same task.
  useEffect(() => {
    if (taskId) rememberWorkspace(taskId, state);
  }, [taskId, state, rememberWorkspace]);

  return (
    <WorkspaceStateContext.Provider value={state}>
      <WorkspaceDispatchContext.Provider value={dispatch}>
        {children}
      </WorkspaceDispatchContext.Provider>
    </WorkspaceStateContext.Provider>
  );
}

export function useWorkspaceState(): WorkspaceState {
  const state = useContext(WorkspaceStateContext);
  if (!state) throw new Error('useWorkspaceState must be used within a WorkspaceProvider');

  return state;
}

export function useWorkspaceDispatch(): Dispatch<WorkspaceAction> {
  const dispatch = useContext(WorkspaceDispatchContext);
  if (!dispatch) throw new Error('useWorkspaceDispatch must be used within a WorkspaceProvider');
  return dispatch;
}
