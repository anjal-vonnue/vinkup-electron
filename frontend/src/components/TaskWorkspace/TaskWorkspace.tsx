import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useToast } from '../Toast';
import { useFlagTracking } from '../../hooks/Useflagtracking';
import { useIdleTracking } from '../../hooks/useIdleTracking';
import type { ReviewStatus, TaskResponse } from '@itp/types';
import { getTaskCode, getTaskReview, saveTaskCode, submitTask } from '../../api/tasks';
import { applyRuntimeSettings } from '../../lib/monacoSetup';
import {
  DEFAULT_SIDEBAR_PX,
  HANDLE_PX,
  MAX_SIDEBAR_PX,
  MIN_PANE_PX,
  MIN_RESULT_PX,
  MIN_SIDEBAR_PX,
  buildColumns,
  clamp,
  readSizes,
  writeSizes,
  type PaneSizes,
} from '../../lib/paneLayout';
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
import { useRealtimeEvent, useRealtimeRefresh } from '../../context/useRealtime';
import { useWorkspaceSession } from '../../context/WorkspaceSessionContext';
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
import MentorSuggestion from '../MentorSuggestion/MentorSuggestion';
import PaneResizer from '../PaneResizer';
import SaveIndicator from '../SaveIndicator';
import SubmitTaskButton from '../SubmitTaskButton';
import TaskFeedbackModal from '../TaskFeedbackModal';
import TaskToolbar from '../TaskToolbar';
import WorkspaceSidebar from '../WorkspaceSidebar';
import styles from './TaskWorkspace.module.css';

type TaskWorkspaceProps = {
  task: TaskResponse;
  /** Tells the page whether the header timer should be stopped (task submitted, not in rework). */
  onTimerStoppedChange?: (taskId: string, isStopped: boolean) => void;
};

type ResizableKind = 'sidebar' | 'result';

export default function TaskWorkspace({ task, onTimerStoppedChange }: TaskWorkspaceProps) {
  const state = useWorkspaceState();
  const { mode, markWork } = useTaskActivityMode();
  useReportActivityMode(mode);
  const dispatch = useWorkspaceDispatch();
  const navigate = useNavigate();
  const { exitWorkspace } = useWorkspaceSession();
  const runner = useRunner();
  const toast = useToast();

  const { show } = useToast();
  const showLeaveWarning = useCallback(
    (message: string) => show({ message, variant: 'warning', durationMs: 5000 }),
    [show]
  );
  // Logs TAB_SWITCH / FULLSCREEN_EXIT and shows the toast. This is the only place exits are logged.
  useFlagTracking({ taskId: task.id, onWarning: showLeaveWarning });
  // Records long stretches without input as an IDLE flag for the mentor. Silent for the trainee.
  useIdleTracking({ taskId: task.id });

  const [isRefreshConfirmOpen, setIsRefreshConfirmOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus | null>(task.reviewStatus ?? null);
  const [approvedSuggestion, setApprovedSuggestion] = useState<{
    adminName: string;
    feedback: string;
  } | null>(null);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  // Submitting can be repeated and doesn't lock editing; this only drives the pill and the label.
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);
  const hasSubmitted = submittedAt !== null || task.status === 'completed';
  // Submitted and waiting for review (or approved): the timer stops. Rework runs it again.
  const isTimerStopped = hasSubmitted && reviewStatus !== 'rework';

  // The timer lives in the page header, outside this component, so report the value up.
  useEffect(() => {
    onTimerStoppedChange?.(task.id, isTimerStopped);
  }, [onTimerStoppedChange, task.id, isTimerStopped]);

  useEffect(() => {
    applyRuntimeSettings(task.runtime);
  }, [task.runtime]);

  // Load feedback when opening an already-approved task. The state update runs
  // in the request callback, outside the synchronous effect body.
  useEffect(() => {
    if (task.reviewStatus !== 'approved') return;

    let cancelled = false;
    getTaskReview(task.id)
      .then((review) => {
        if (cancelled) return;
        setReviewStatus(review.reviewStatus);
        const latestReview = review.latestReview;
        setApprovedSuggestion(
          latestReview?.decision === 'approved' && latestReview.feedback.trim()
            ? { adminName: latestReview.adminName, feedback: latestReview.feedback }
            : null
        );
      })
      .catch(() => {
        // Best effort: the reconnect refresh can catch a temporary failure.
      });

    return () => {
      cancelled = true;
    };
  }, [task.id, task.reviewStatus]);

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
        exitWorkspace();
        await navigate(`/days/${task.day.id}`);
      } else {
        setIsLeaveConfirmOpen(true);
      }
    })();
  }, [autosave, navigate, task.day.id, exitWorkspace]);

  const handleSubmit = useCallback(async () => {
    const result = await submitTask(task.id);
    setSubmittedAt(new Date(result.submittedAt));
    setReviewStatus(result.reviewStatus);
    setApprovedSuggestion(null);
    toast.show({
      message: reviewStatus === 'rework' ? 'Task resubmitted' : 'Task submitted',
      variant: 'success',
    });
  }, [task.id, toast, reviewStatus]);

  /** Re-reads only the review state, so the code in the editor is never replaced. */
  const refreshReview = useCallback(async () => {
    try {
      const review = await getTaskReview(task.id);
      setReviewStatus(review.reviewStatus);
      const latestReview = review.latestReview;
      setApprovedSuggestion(
        latestReview?.decision === 'approved' && latestReview.feedback.trim()
          ? { adminName: latestReview.adminName, feedback: latestReview.feedback }
          : null
      );
    } catch {
      // Best effort: the next event or the next page load catches up.
    }
  }, [task.id]);

  // The mentor's approve / request-rework arrives while this page stays open.
  useRealtimeEvent((event) => {
    if (event.type !== 'task.reviewed' || event.taskId !== task.id) return;

    setReviewStatus(event.reviewStatus);
    setApprovedSuggestion(
      event.reviewStatus === 'approved' && event.feedback.trim()
        ? { adminName: event.mentorName, feedback: event.feedback }
        : null
    );
  });

  // After a stream reconnect, catch a review that landed while the stream was down.
  useRealtimeRefresh(() => {
    void refreshReview();
  });

  const handleTogglePane = useCallback(
    (pane: PaneId) => dispatch({ type: 'paneToggled', pane }),
    [dispatch]
  );

  /* ---- Resizable panes -------------------------------------------------------------- */

  const rowRef = useRef<HTMLDivElement>(null);
  const sidebarPaneRef = useRef<HTMLDivElement>(null);
  const resultPaneRef = useRef<HTMLDivElement>(null);

  const [paneSizes, setPaneSizes] = useState<PaneSizes>(readSizes);
  const [isResizing, setIsResizing] = useState(false);

  const sizesRef = useRef(paneSizes);
  useEffect(() => {
    sizesRef.current = paneSizes;
  });

  const dragRef = useRef<{ kind: ResizableKind; startWidth: number; draft: PaneSizes } | null>(
    null
  );

  const commitSizes = useCallback((next: PaneSizes) => {
    sizesRef.current = next;
    setPaneSizes(next);
    writeSizes(next);
  }, []);

  /** The sizes after giving `kind` this width, or null if the window is too small to resize. */
  const sizesForWidth = useCallback((kind: ResizableKind, width: number): PaneSizes | null => {
    const row = rowRef.current;
    if (!row) return null;

    const { sidebar, code, result } = stateRef.current.visiblePanes;
    const hasMain = code || result;
    const rowWidth = row.getBoundingClientRect().width;
    const handles = (sidebar && hasMain ? 1 : 0) + (code && result ? 1 : 0);
    const handleSpace = handles * HANDLE_PX;

    let min: number;
    let max: number;

    if (kind === 'sidebar') {
      const others = (code ? MIN_PANE_PX : 0) + (result ? MIN_RESULT_PX : 0);
      min = MIN_SIDEBAR_PX;
      max = Math.min(MAX_SIDEBAR_PX, rowWidth - others - handleSpace);
    } else {
      const sidebarWidth = sidebar
        ? (sidebarPaneRef.current?.getBoundingClientRect().width ?? 0)
        : 0;
      min = MIN_RESULT_PX;
      max = rowWidth - sidebarWidth - handleSpace - MIN_PANE_PX;
    }

    if (max < min) return null;

    const next = Math.round(clamp(width, min, max));
    const base = sizesRef.current;

    return kind === 'sidebar' ? { ...base, sidebar: next } : { ...base, result: next };
  }, []);

  const paneFor = useCallback(
    (kind: ResizableKind) => (kind === 'sidebar' ? sidebarPaneRef.current : resultPaneRef.current),
    []
  );

  const beginResize = useCallback(
    (kind: ResizableKind) => {
      const pane = paneFor(kind);
      if (!pane) return;

      dragRef.current = {
        kind,
        startWidth: pane.getBoundingClientRect().width,
        draft: sizesRef.current,
      };
      setIsResizing(true);
    },
    [paneFor]
  );

  // While dragging, write the grid straight to the DOM. Re-rendering the whole workspace
  // (Monaco, the runtime) on every pointer move would make the drag feel heavy.
  const resize = useCallback(
    (deltaX: number) => {
      const drag = dragRef.current;
      const row = rowRef.current;
      if (!drag || !row) return;

      // The sidebar grows as the boundary moves right; the result pane shrinks.
      const width = drag.kind === 'sidebar' ? drag.startWidth + deltaX : drag.startWidth - deltaX;
      const next = sizesForWidth(drag.kind, width);
      if (!next) return;

      drag.draft = next;
      row.style.gridTemplateColumns = buildColumns(stateRef.current.visiblePanes, next);
    },
    [sizesForWidth]
  );

  const endResize = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setIsResizing(false);

    if (drag) commitSizes(drag.draft);
  }, [commitSizes]);

  const nudge = useCallback(
    (kind: ResizableKind, deltaX: number) => {
      const pane = paneFor(kind);
      if (!pane) return;

      const current = pane.getBoundingClientRect().width;
      const next = sizesForWidth(kind, kind === 'sidebar' ? current + deltaX : current - deltaX);
      if (next) commitSizes(next);
    },
    [commitSizes, paneFor, sizesForWidth]
  );

  const resetSize = useCallback(
    (kind: ResizableKind) => {
      const base = sizesRef.current;
      commitSizes(
        kind === 'sidebar' ? { ...base, sidebar: DEFAULT_SIDEBAR_PX } : { ...base, result: null }
      );
    },
    [commitSizes]
  );

  const { sidebar: showSidebar, code: showCode, result: showResult } = state.visiblePanes;
  const gridColumns = buildColumns(state.visiblePanes, paneSizes);

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
        <div
          ref={rowRef}
          className={isResizing ? `${styles.paneRow} ${styles.resizing}` : styles.paneRow}
          style={{ gridTemplateColumns: gridColumns }}
        >
          {showSidebar && (
            <div className={styles.pane} data-testid="sidebar-pane" ref={sidebarPaneRef}>
              <WorkspaceSidebar
                activeTab={state.sidebarTab}
                onTabChange={(tab) => dispatch({ type: 'sidebarTabChanged', tab })}
                fileCount={selectFileCount(state)}
                onCollapse={() => dispatch({ type: 'paneToggled', pane: 'sidebar' })}
                instructions={
                  <>
                    {approvedSuggestion && (
                      <MentorSuggestion
                        adminName={approvedSuggestion.adminName}
                        feedback={approvedSuggestion.feedback}
                      />
                    )}
                    <InstructionsPanel markdown={task.instructionsMarkdown} />
                  </>
                }
                files={<FilesPanel onRefresh={refreshFiles} />}
              />
            </div>
          )}

          {showSidebar && (showCode || showResult) && (
            <PaneResizer
              label="Resize sidebar"
              valueNow={clamp(paneSizes.sidebar, MIN_SIDEBAR_PX, MAX_SIDEBAR_PX)}
              valueMin={MIN_SIDEBAR_PX}
              valueMax={MAX_SIDEBAR_PX}
              onResizeStart={() => beginResize('sidebar')}
              onResize={resize}
              onResizeEnd={endResize}
              onNudge={(deltaX) => nudge('sidebar', deltaX)}
              onReset={() => resetSize('sidebar')}
            />
          )}

          {/* Always mounted, hidden with CSS when toggled off — unmounting Monaco would lose undo history. */}
          <div
            className={showCode ? styles.pane : `${styles.pane} ${styles.paneHidden}`}
            data-testid="code-pane"
          >
            <EditorPane taskId={task.id} onSave={() => void autosave.flush()} onRun={handleRun} />
          </div>

          {showCode && showResult && (
            <PaneResizer
              label="Resize result pane"
              valueNow={paneSizes.result ?? undefined}
              valueMin={MIN_RESULT_PX}
              onResizeStart={() => beginResize('result')}
              onResize={resize}
              onResizeEnd={endResize}
              onNudge={(deltaX) => nudge('result', deltaX)}
              onReset={() => resetSize('result')}
            />
          )}

          {/* Always mounted, hidden with CSS when toggled off — the node runtime's terminal
            and running server must survive the pane being hidden. */}
          <div
            className={showResult ? styles.pane : `${styles.pane} ${styles.paneHidden}`}
            data-testid="result-pane"
            data-pane="result"
            ref={resultPaneRef}
          >
            <RuntimeHost task={task} isVisible={showResult} />
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
            exitWorkspace();
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
