import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useToast } from '../Toast';
import { useFlagTracking } from '../../hooks/Useflagtracking';
import type { ReviewStatus, TaskResponse } from '@itp/types';
import { getTaskCode, saveTaskCode, submitTask } from '../../api/tasks';
import { applyRuntimeSettings } from '../../lib/monacoSetup';
import {
  selectFileCount,
  selectFilesForSave,
  selectIsDirty,
} from '../../pages/TaskPage/state/selectors';
import { findSaveProblem } from '../../lib/saveRules';
import { useAutosave } from '../../pages/TaskPage/hooks/useAutosave';
import { useRunner } from '../../runtimes/runnerContext';
import RuntimeHost from '../../runtimes/RuntimeHost';
import type { PaneId } from '../../types/workspaceTypes';
import { useReportActivityMode } from '../../context/useActivity';
import { useTaskActivityMode } from '../../pages/TaskPage/hooks/useTaskActivityMode';
import { WorkActivityContext } from '../../pages/TaskPage/state/WorkActivityContext';
import {
  useWorkspaceDispatch,
  useWorkspaceState,
} from '../../pages/TaskPage/state/WorkspaceContext';
import ConfirmDialog from '../ConfirmDialog';
import EditorPane from '../EditorPane';
import FilesPanel from '../FilesPanel';
import InstructionsPanel from '../InstructionsPanel';
import SaveIndicator from '../SaveIndicator';
import SubmitTaskButton from '../SubmitTaskButton';
import TaskFeedbackModal from '../TaskFeedbackModal';
import TaskToolbar from '../TaskToolbar';
import WorkspaceSidebar from '../WorkspaceSidebar';
import styles from './TaskWorkspace.module.css';

type TaskWorkspaceProps = {
  task: TaskResponse;
};

export default function TaskWorkspace({ task }: TaskWorkspaceProps) {
  const state = useWorkspaceState();
  const { mode, markWork } = useTaskActivityMode();
  useReportActivityMode(mode);
  const dispatch = useWorkspaceDispatch();
  const navigate = useNavigate();
  const runner = useRunner();
  const toast = useToast();

  const { show } = useToast();
  const showLeaveWarning = useCallback(
    (message: string) => show({ message, variant: 'warning', durationMs: 5000 }),
    [show]
  );
  // Logs TAB_SWITCH / FULLSCREEN_EXIT and shows the toast. This is the only place exits are logged.
  useFlagTracking({ taskId: task.id, onWarning: showLeaveWarning });

  const [isRefreshConfirmOpen, setIsRefreshConfirmOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus | null>(task.reviewStatus ?? null);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  // Submitting can be repeated and doesn't lock editing; this only drives the pill and the label.
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);
  const hasSubmitted = submittedAt !== null || task.status === 'completed';

  useEffect(() => {
    applyRuntimeSettings(task.runtime);
  }, [task.runtime]);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const autosave = useAutosave({
    isDirty: selectIsDirty(state),
    changeKey: state.files,
    getSnapshot: () => selectFilesForSave(stateRef.current),
    save: (files) => saveTaskCode(task.id, { files }),
    onSaved: (files) =>
      dispatch({
        type: 'saveSucceeded',
        snapshot: Object.fromEntries(files.map((f) => [f.path, f.content])),
      }),
    validate: findSaveProblem,
  });

  const { flush } = autosave;
  const { run: runnerRun } = runner;

  const handleRun = useCallback(() => {
    if (!state.visiblePanes.result) {
      dispatch({ type: 'paneToggled', pane: 'result' });
    }
    markWork();
    runnerRun();
  }, [dispatch, markWork, runnerRun, state.visiblePanes.result]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isCtrlOrCmd = event.ctrlKey || event.metaKey;
      if (isCtrlOrCmd && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void flush();
      } else if (isCtrlOrCmd && event.key === 'Enter') {
        event.preventDefault();
        handleRun();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flush, handleRun]);

  const loadServerFiles = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const code = await getTaskCode(task.id);
      dispatch({ type: 'serverFilesLoaded', code });
      setIsRefreshConfirmOpen(false);
    } catch (error) {
      setRefreshError(
        error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [dispatch, task.id]);

  const refreshFiles = useCallback(() => {
    if (selectIsDirty(state)) {
      setRefreshError(null);
      setIsRefreshConfirmOpen(true);
      return;
    }
    void loadServerFiles();
  }, [state, loadServerFiles]);

  const handleBack = useCallback(() => {
    void (async () => {
      const ok = await autosave.flush();
      if (ok) {
        await navigate(`/days/${task.day.id}`);
      } else {
        setIsLeaveConfirmOpen(true);
      }
    })();
  }, [autosave, navigate, task.day.id]);

  const handleSubmit = useCallback(async () => {
    const result = await submitTask(task.id);
    setSubmittedAt(new Date(result.submittedAt));
    setReviewStatus(result.reviewStatus);
    toast.show({
      message: reviewStatus === 'rework' ? 'Task resubmitted' : 'Task submitted',
      variant: 'success',
    });
  }, [task.id, toast, reviewStatus]);

  const handleTogglePane = useCallback(
    (pane: PaneId) => dispatch({ type: 'paneToggled', pane }),
    [dispatch]
  );

  const gridColumns = [
    state.visiblePanes.sidebar &&
      (state.visiblePanes.code || state.visiblePanes.result ? '320px' : 'minmax(0, 1fr)'),
    state.visiblePanes.code && 'minmax(0, 1fr)',
    state.visiblePanes.result && 'minmax(0, 1fr)',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <WorkActivityContext.Provider value={markWork}>
      <div className={styles.workspace}>
        <TaskToolbar
          estimatedMinutes={task.estimatedMinutes}
          visiblePanes={state.visiblePanes}
          onTogglePane={handleTogglePane}
          onBack={handleBack}
          onRun={handleRun}
          runner={runner}
          saveIndicator={<SaveIndicator state={autosave.state} onRetry={autosave.retry} />}
          hasSubmitted={hasSubmitted}
          submittedAt={submittedAt}
          reviewStatus={reviewStatus}
          onViewFeedback={() => setIsFeedbackModalOpen(true)}
          submitSlot={
            <SubmitTaskButton
              taskTitle={task.title}
              hasSubmitted={hasSubmitted}
              saveState={autosave.state}
              flush={autosave.flush}
              onSubmit={handleSubmit}
              reviewStatus={reviewStatus}
            />
          }
        />
        <div className={styles.paneRow} style={{ gridTemplateColumns: gridColumns }}>
          {state.visiblePanes.sidebar && (
            <div className={styles.pane} data-testid="sidebar-pane">
              <WorkspaceSidebar
                activeTab={state.sidebarTab}
                onTabChange={(tab) => dispatch({ type: 'sidebarTabChanged', tab })}
                fileCount={selectFileCount(state)}
                onCollapse={() => dispatch({ type: 'paneToggled', pane: 'sidebar' })}
                instructions={<InstructionsPanel markdown={task.instructionsMarkdown} />}
                files={<FilesPanel onRefresh={refreshFiles} />}
              />
            </div>
          )}
          {/* Always mounted, hidden with CSS when toggled off — unmounting Monaco would lose undo history. */}
          <div
            className={
              state.visiblePanes.code ? styles.pane : `${styles.pane} ${styles.paneHidden}`
            }
            data-testid="code-pane"
          >
            <EditorPane taskId={task.id} onSave={() => void autosave.flush()} onRun={handleRun} />
          </div>

          {/* Always mounted, hidden with CSS when toggled off — the node runtime's terminal
            and running server must survive the pane being hidden. */}
          <div
            className={
              state.visiblePanes.result ? styles.pane : `${styles.pane} ${styles.paneHidden}`
            }
            data-testid="result-pane"
          >
            <RuntimeHost task={task} isVisible={state.visiblePanes.result} />
          </div>
        </div>

        <ConfirmDialog
          open={isRefreshConfirmOpen}
          title="Discard unsaved changes and reload files from the server?"
          confirmLabel="Reload"
          isConfirming={isRefreshing}
          error={refreshError}
          onConfirm={() => void loadServerFiles()}
          onCancel={() => setIsRefreshConfirmOpen(false)}
        >
          Your local changes will be lost.
        </ConfirmDialog>

        <ConfirmDialog
          open={isLeaveConfirmOpen}
          title="Your latest changes aren't saved. Leave anyway?"
          confirmLabel="Leave"
          tone="danger"
          onConfirm={() => {
            setIsLeaveConfirmOpen(false);
            void navigate(`/days/${task.day.id}`);
          }}
          onCancel={() => setIsLeaveConfirmOpen(false)}
        >
          Unsaved changes will be lost.
        </ConfirmDialog>

        {isFeedbackModalOpen && (
          <TaskFeedbackModal
            isOpen={isFeedbackModalOpen}
            onClose={() => setIsFeedbackModalOpen(false)}
            taskId={task.id}
            taskTitle={task.title}
          />
        )}
      </div>
    </WorkActivityContext.Provider>
  );
}
