import { useState } from 'react';
import type {
  CheckpointQuestion,
  CheckpointWorkspaceFile,
  TaskCodeResponse,
  TaskResponse,
} from '@itp/types';
import { Loader2, Play } from 'lucide-react';
import EditorPane from '../../components/EditorPane';
import FilesPanel from '../../components/FilesPanel';
import { RunnerProvider, useRunner } from '../../runtimes/runnerContext';
import RuntimeHost from '../../runtimes/RuntimeHost';
import { EditorProvider } from '../../pages/TaskPage/state/EditorContext';
import { WorkspaceProvider, useWorkspaceState } from '../../pages/TaskPage/state/WorkspaceContext';
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
  onFilesChange: (files: CheckpointWorkspaceFile[]) => void;
  onSave: () => void;
};

function runtimeLabel(runtime: CheckpointQuestion['runtime']): string {
  if (runtime === 'sql') return 'SQL workspace';
  if (runtime === 'browser') return 'Browser workspace';
  return 'Node workspace';
}

function taskFor(question: CheckpointQuestion, workspaceId: string): TaskResponse {
  return {
    id: workspaceId,
    title: question.title,
    instructionsMarkdown: question.promptMarkdown,
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
};

function PracticalWorkspaceBody({
  task,
  initialFiles,
  workspaceId,
  hasStarterFiles,
  onFilesChange,
  onSave,
}: PracticalWorkspaceBodyProps) {
  const state = useWorkspaceState();
  const runner = useRunner();

  useWorkspaceFilesReporter(state.files, initialFiles, onFilesChange);

  return (
    <div className={styles.workspaceShell}>
      <header className={styles.toolbar}>
        <div className={styles.toolbarMeta}>
          <span className={styles.runtimeBadge}>{runtimeLabel(task.runtime)}</span>
          {hasStarterFiles && <span className={styles.hint}>Starter files are ready</span>}
        </div>
        <button
          type="button"
          className={styles.runButton}
          onClick={() => runner.run()}
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
      </header>

      <div className={styles.workspace}>
        <div className={styles.filesPane}>
          <FilesPanel onRefresh={() => undefined} />
        </div>
        <div className={styles.mainPane}>
          <div className={styles.editorPane}>
            <EditorPane taskId={workspaceId} onSave={onSave} onRun={() => runner.run()} />
          </div>
          <div className={styles.runtimePane}>
            <RuntimeHost task={task} isVisible />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A practical checkpoint answer is a real workspace: files, package installation,
 * a terminal and a Run command, using the same runtime as daily tasks.
 */
export default function PracticalWorkspace({
  question,
  initialFiles,
  submittedFiles = null,
  workspaceId,
  disabled,
  onFilesChange,
  onSave,
}: PracticalWorkspaceProps) {
  const [initialCode] = useState<TaskCodeResponse>(() => ({
    files: initialFiles.map((file) => ({ path: file.path, content: file.content })),
    updatedAt: null,
  }));
  const [task] = useState<TaskResponse>(() => taskFor(question, workspaceId));

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
          />
        </RunnerProvider>
      </EditorProvider>
    </WorkspaceProvider>
  );
}
