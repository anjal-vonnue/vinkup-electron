import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Globe, Monitor, RotateCcw, SquareTerminal } from 'lucide-react';
import type { Terminal } from '@xterm/xterm';
import type { TaskResponse } from '@itp/types';
import ResultPaneFrame from '../../components/ResultPaneFrame';
import { useMarkWork } from '../../pages/TaskPage/state/WorkActivityContext';
import { useWorkspaceState } from '../../pages/TaskPage/state/WorkspaceContext';
import { useRegisterRunner } from '../runnerContext';
import NodePreview from '../node/NodePreview';
import type { LocalNodeStatus } from './useLocalNodeSession';
import { useLocalNodeSession } from './useLocalNodeSession';
import { useLocalWorkspace } from './useLocalWorkspace';
import styles from './LocalNodeRuntime.module.css';

type LocalNodeRuntimeProps = { task: TaskResponse; isVisible: boolean };

// xterm is only downloaded for Node tasks (and doesn't touch <canvas> on other pages or in tests).
const TerminalView = lazy(() => import('../node/TerminalView'));

function runnerFor(
  status: LocalNodeStatus,
  runCommand: string | null,
  errorMessage: string | null
): { canRun: boolean; label: string; title: string } {
  switch (status) {
    case 'booting':
      return { canRun: false, label: 'Run', title: 'Starting Node…' };
    case 'installing':
      return { canRun: false, label: 'Run', title: 'Installing packages…' };
    case 'ready':
      return runCommand
        ? { canRun: true, label: `Run: ${runCommand}`, title: 'Run (Ctrl+Enter)' }
        : { canRun: false, label: 'Run', title: 'Use the terminal for this task' };
    case 'error':
      return { canRun: false, label: 'Run', title: errorMessage ?? "Node couldn't start" };
  }
}

export default function LocalNodeRuntime({ task, isVisible }: LocalNodeRuntimeProps) {
  const state = useWorkspaceState();
  const workspace = useLocalWorkspace(task.id);
  const markWork = useMarkWork();

  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [activeTab, setActiveTab] = useState('terminal');
  useEffect(() => {
    if (!terminal) return;
    const subscription = terminal.onKey(() => markWork());
    return () => subscription.dispose();
  }, [terminal, markWork]);

  const blockedError =
    workspace.status === 'error'
      ? (workspace.error ?? 'The workspace could not start.')
      : (workspace.environment?.error ?? null);

  const session = useLocalNodeSession({
    taskId: task.id,
    enabled: workspace.status === 'ready' && blockedError === null && terminal !== null,
    terminal,
    files: state.files,
    blockedError,
    onServerReady: () => setActiveTab('preview'),
  });
  const { status, errorMessage, server, runCommand, resize, retry } = session;

  const { canRun, label, title } = runnerFor(status, task.runCommand, errorMessage);
  const flush = workspace.flush;
  const run = useCallback(() => {
    const command = task.runCommand;
    if (!command) return;
    setActiveTab('terminal');
    // Flush pending editor changes before the shell reads the files.
    void flush()
      .catch(() => undefined)
      .then(() => runCommand(command));
    terminal?.focus();
  }, [flush, task.runCommand, runCommand, terminal]);

  useRegisterRunner({
    canRun,
    label,
    title,
    isRunning: status === 'booting' || status === 'installing',
    run,
  });

  const shownTab = server ? activeTab : 'terminal';

  const pill =
    status === 'ready' ? (
      <span className={`${styles.pill} ${styles.pillReady}`}>
        <span className={styles.dot} aria-hidden="true" />
        Node ready
      </span>
    ) : status === 'installing' ? (
      <span className={styles.pill}>
        <span className={styles.spinner} aria-hidden="true" />
        Installing…
      </span>
    ) : status === 'booting' ? (
      <span className={styles.pill}>
        <span className={styles.spinner} aria-hidden="true" />
        Starting…
      </span>
    ) : null;

  let body;
  if (blockedError) {
    body = (
      <div className={styles.card} role="alert">
        <Monitor size={28} aria-hidden="true" />
        <p className={styles.cardTitle}>Node.js is needed for this task</p>
        <p className={styles.cardText}>{blockedError}</p>
        <button type="button" className={styles.retry} onClick={workspace.retry}>
          <RotateCcw size={12} aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  } else {
    body = (
      <>
        {status === 'error' && errorMessage && (
          <div className={styles.errorBanner} role="alert">
            <span>{errorMessage}</span>
            <button type="button" className={styles.retry} onClick={retry}>
              <RotateCcw size={12} aria-hidden="true" />
              Retry
            </button>
          </div>
        )}
        {/* Kept mounted (hidden) while Preview shows: the terminal keeps its history and shell. */}
        <div className={styles.view} hidden={shownTab !== 'terminal'}>
          <Suspense fallback={null}>
            <TerminalView
              taskId={task.id}
              isVisible={isVisible && shownTab === 'terminal'}
              onReady={setTerminal}
              onResize={resize}
            />
          </Suspense>
        </div>
        {server && (
          <div className={styles.view} hidden={shownTab !== 'preview'}>
            <NodePreview url={server.url} port={server.port} />
          </div>
        )}
      </>
    );
  }

  return (
    <ResultPaneFrame
      tabs={[
        { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
        ...(server
          ? [
              {
                id: 'preview',
                label: 'Preview',
                icon: Globe,
                badge: { text: `:${server.port}`, tone: 'neutral' as const },
              },
            ]
          : []),
      ]}
      activeTab={shownTab}
      onTabChange={setActiveTab}
      toolbarEnd={pill}
    >
      <div className={styles.body}>{body}</div>
    </ResultPaneFrame>
  );
}
