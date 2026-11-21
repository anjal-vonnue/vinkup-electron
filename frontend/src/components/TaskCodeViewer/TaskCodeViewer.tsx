import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { lazy, Suspense } from 'react';
import type { AdminTaskCode } from '@itp/types';
import { getAdminTaskCode } from '../../api/admin';
import { ApiError, toApiError } from '../../api/errors';
import { TASK_STATUS_LABELS } from '../../lib/adminLabels';
import { formatIstDateTime } from '../../lib/formatDateTime';
import { ErrorState } from '../Common/ErrorState';
import LoaderOverlay from '../Common/LoadingState';
import styles from './TaskCodeViewer.module.css';

const loadReadOnlyCodeViewer = () => import('../ReadOnlyCodeViewer');
const ReadOnlyCodeViewer = lazy(loadReadOnlyCodeViewer);

type ViewerState = {
  code: AdminTaskCode | null;
  isLoading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  showMetadata?: boolean;
};

const TaskCodeViewerContext = createContext<ViewerState | null>(null);

export function TaskCodeViewerProvider({
  value,
  children,
}: {
  value: ViewerState;
  children: ReactNode;
}) {
  return <TaskCodeViewerContext.Provider value={value}>{children}</TaskCodeViewerContext.Provider>;
}

export default function TaskCodeViewer({
  traineeId,
  taskId,
}: {
  traineeId: string;
  taskId: string;
}) {
  const provided = useContext(TaskCodeViewerContext);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    taskId: string;
    code: AdminTaskCode | null;
    error: ApiError | null;
    isLoading: boolean;
  } | null>(null);

  useEffect(() => {
    if (provided) return;

    let active = true;
    getAdminTaskCode(traineeId, taskId)
      .then((code) => {
        if (active) setLoaded({ taskId, code, error: null, isLoading: false });
      })
      .catch((error: unknown) => {
        if (active) {
          setLoaded({ taskId, code: null, error: toApiError(error), isLoading: false });
        }
      });

    return () => {
      active = false;
    };
  }, [attempt, provided, taskId, traineeId]);

  const retry = () => {
    setLoaded(null);
    setAttempt((value) => value + 1);
  };
  const state =
    provided ??
    (loaded?.taskId === taskId ? loaded : { code: null, error: null, isLoading: true, taskId });

  return (
    <div className={styles.viewer}>
      {state.isLoading && <LoaderOverlay label="Loading code…" />}
      {state.error && (
        <ErrorState
          title="Unable to load code"
          message={state.error.message}
          onRetry={state.error.code === 'NOT_FOUND' ? undefined : (provided?.onRetry ?? retry)}
        />
      )}
      {state.code && (
        <>
          {provided?.showMetadata !== false && (
            <div className={styles.meta}>
              <span>{TASK_STATUS_LABELS[state.code.status]}</span>
              {state.code.submissionCount > 0 && <span>Attempt #{state.code.submissionCount}</span>}
              {state.code.codeUpdatedAt && (
                <span>Saved {formatIstDateTime(state.code.codeUpdatedAt)}</span>
              )}
              {state.code.lastSubmittedAt && (
                <span>Submitted {formatIstDateTime(state.code.lastSubmittedAt)}</span>
              )}
            </div>
          )}
          {state.code.isStarterCode && (
            <p className={styles.starter} role="note">
              Starter code: this trainee hasn&rsquo;t saved any work on this task.
            </p>
          )}
          {!state.code.isStarterCode && state.code.status === 'in_progress' && (
            <p className={styles.starter} role="note">
              Draft: the trainee hasn&rsquo;t submitted this task yet. Approve and Rework appear
              once they submit.
            </p>
          )}
          <div className={styles.code}>
            <Suspense fallback={<LoaderOverlay label="Opening viewer…" />}>
              <ReadOnlyCodeViewer
                key={state.code.taskId}
                files={state.code.files}
                scope={`${traineeId}/${state.code.taskId}`}
              />
            </Suspense>
          </div>
        </>
      )}
    </div>
  );
}
