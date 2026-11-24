import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  CheckpointQuestion,
  CheckpointWorkspaceFile,
  TaskCodeResponse,
  TaskResponse,
} from '@itp/types';
import { Loader2, Play } from 'lucide-react';
import EditorPane from '../../components/EditorPane';
import FilesPanel from '../../components/FilesPanel';
import InstructionsPanel from '../../components/InstructionsPanel';
import PaneResizer from '../../components/PaneResizer';
import ViewToggleGroup from '../../components/ViewToggleGroup';
import WorkspaceSidebar from '../../components/WorkspaceSidebar';
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
import { selectFileCount } from '../../pages/TaskPage/state/selectors';
import { RunnerProvider, useRunner } from '../../runtimes/runnerContext';
import RuntimeHost from '../../runtimes/RuntimeHost';
import type { PaneId } from '../../types/workspaceTypes';
import { EditorProvider } from '../../pages/TaskPage/state/EditorContext';
import {
  WorkspaceProvider,
  useWorkspaceDispatch,
  useWorkspaceState,
} from '../../pages/TaskPage/state/WorkspaceContext';
import WorkspaceFilesViewer from './WorkspaceFilesViewer';
import { useWorkspaceFilesReporter } from './useWorkspaceFilesReporter';
import styles from './PracticalWorkspace.module.css';

type PracticalWorkspaceProps = {
  question: CheckpointQuestion;
  /** Files the editable workspace opens with: saved answer files or the starter files. */
  initialFiles: CheckpointWorkspaceFile[];
  /** Files to show once the attempt is locked, or null when nothing was saved. */
  submittedFiles?: CheckpointWorkspaceFile[] | null;
  workspaceId: string;
  disabled: boolean;
  /** Checkpoint-level instructions for the sidebar's Instructions tab. */
  instructionsMarkdown?: string;
  onFilesChange: (files: CheckpointWorkspaceFile[]) => void;
  onSave: () => void;
  /** Slot rendered after the Run button (timer, save status, submit). */
  toolbarTrailing?: ReactNode;
};

type ResizableKind = 'sidebar' | 'result';

function runtimeLabel(runtime: CheckpointQuestion['runtime']): string {
  if (runtime === 'sql') return 'SQL workspace';
  if (runtime === 'browser') return 'Browser workspace';
  return 'Node workspace';
}

function taskFor(
  question: CheckpointQuestion,
  workspaceId: string,
  instructionsMarkdown?: string
): TaskResponse {
  return {
    id: workspaceId,
    title: question.title,
    instructionsMarkdown: instructionsMarkdown ?? question.promptMarkdown,
    isStretchGoal: false,
    sequenceOrder: question.orderIndex,
    estimatedMinutes: null,
    status: 'in_progress',
    reviewStatus: null,
    submissionCount: 0,
    day: { id: 'checkpoint', dayNumber: 0, courseTitle: 'Checkpoint' },
    runtime: question.runtime ?? 'node',
    runCommand: question.runCommand,
    setupSql: question.setupSql,
  };
}

type PracticalWorkspaceBodyProps = {
  task: TaskResponse;
  initialFiles: CheckpointWorkspaceFile[];
  workspaceId: string;
  hasStarterFiles: boolean;
  onFilesChange: (files: CheckpointWorkspaceFile[]) => void;
  onSave: () => void;
  toolbarTrailing?: ReactNode;
};

function PracticalWorkspaceBody({
  task,
  initialFiles,
  workspaceId,
  hasStarterFiles,
  onFilesChange,
  onSave,
  toolbarTrailing,
}: PracticalWorkspaceBodyProps) {
  const state = useWorkspaceState();
  const dispatch = useWorkspaceDispatch();
  const runner = useRunner();

  useWorkspaceFilesReporter(state.files, initialFiles, onFilesChange);

  const rowRef = useRef<HTMLDivElement>(null);
  const sidebarPaneRef = useRef<HTMLDivElement>(null);
  const resultPaneRef = useRef<HTMLDivElement>(null);

  const [paneSizes, setPaneSizes] = useState<PaneSizes>(readSizes);
  const [isResizing, setIsResizing] = useState(false);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

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

  const resize = useCallback(
    (deltaX: number) => {
      const drag = dragRef.current;
      const row = rowRef.current;
      if (!drag || !row) return;

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

  const handleTogglePane = useCallback(
    (pane: PaneId) => dispatch({ type: 'paneToggled', pane }),
    [dispatch]
  );

  const handleRun = useCallback(() => {
    if (!state.visiblePanes.result) {
      dispatch({ type: 'paneToggled', pane: 'result' });
    }
    runner.run();
  }, [dispatch, runner, state.visiblePanes.result]);

  const { sidebar: showSidebar, code: showCode, result: showResult } = state.visiblePanes;
  const gridColumns = buildColumns(state.visiblePanes, paneSizes);

  return (
    <div className={styles.workspaceShell}>
      <header className={styles.toolbar}>
        <div className={styles.toolbarMeta}>
          <span className={styles.runtimeBadge}>{runtimeLabel(task.runtime)}</span>
          {hasStarterFiles && <span className={styles.hint}>Starter files ready</span>}
        </div>

        <ViewToggleGroup visiblePanes={state.visiblePanes} onToggle={handleTogglePane} />

        <div className={styles.divider} aria-hidden="true" />

        <button
          type="button"
          className={styles.runButton}
          onClick={handleRun}
          disabled={!runner.canRun}
          title={runner.title}
        >
          {runner.isRunning ? (
            <Loader2 size={14} className={styles.spin} aria-hidden="true" />
          ) : (
            <Play size={14} aria-hidden="true" />
          )}
          {runner.label}
        </button>

        {toolbarTrailing}
      </header>

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
              instructions={<InstructionsPanel markdown={task.instructionsMarkdown} />}
              files={<FilesPanel onRefresh={() => undefined} />}
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

        <div
          className={showCode ? styles.pane : `${styles.pane} ${styles.paneHidden}`}
          data-testid="code-pane"
        >
          <EditorPane taskId={workspaceId} onSave={onSave} onRun={handleRun} />
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

        <div
          className={showResult ? styles.pane : `${styles.pane} ${styles.paneHidden}`}
          data-testid="result-pane"
          data-pane="result"
          ref={resultPaneRef}
        >
          <RuntimeHost task={task} isVisible={showResult} />
        </div>
      </div>
    </div>
  );
}

/**
 * A practical checkpoint answer is a real workspace: instructions and files in the
 * sidebar, Monaco editor, and terminal/runtime result pane with pane toggles and Run.
 */
export default function PracticalWorkspace({
  question,
  initialFiles,
  submittedFiles = null,
  workspaceId,
  disabled,
  instructionsMarkdown,
  onFilesChange,
  onSave,
  toolbarTrailing,
}: PracticalWorkspaceProps) {
  const [initialCode] = useState<TaskCodeResponse>(() => ({
    files: initialFiles.map((file) => ({ path: file.path, content: file.content })),
    updatedAt: null,
  }));
  const [task] = useState<TaskResponse>(() => taskFor(question, workspaceId, instructionsMarkdown));

  if (disabled) {
    return (
      <WorkspaceFilesViewer
        files={submittedFiles}
        emptyLabel="No workspace files were saved for this question."
      />
    );
  }

  return (
    <WorkspaceProvider code={initialCode}>
      <EditorProvider>
        <RunnerProvider>
          <PracticalWorkspaceBody
            task={task}
            initialFiles={initialFiles}
            workspaceId={workspaceId}
            hasStarterFiles={initialFiles.length > 0}
            onFilesChange={onFilesChange}
            onSave={onSave}
            toolbarTrailing={toolbarTrailing}
          />
        </RunnerProvider>
      </EditorProvider>
    </WorkspaceProvider>
  );
}
