import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useWorkspaceSession } from '../context/WorkspaceSessionContext';

/**
 * Returning Home normally means "go back to what I was doing". An explicit workspace
 * exit clears the session first, so the same Home link then shows the dashboard.
 */
export function WorkspaceAwareHome({ children }: { children: ReactNode }) {
  const { activeTaskId } = useWorkspaceSession();

  if (activeTaskId) return <Navigate to={`/tasks/${activeTaskId}`} replace />;

  return <>{children}</>;
}
