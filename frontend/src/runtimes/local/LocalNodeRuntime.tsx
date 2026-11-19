import { lazy, Suspense, useCallback, useState } from 'react';
import { Globe, Monitor, RotateCcw, SquareTerminal } from 'lucide-react';
import type { TaskResponse } from '@itp/types';
import ResultPaneFrame from '../../components/ResultPaneFrame';
import { useMarkWork } from '../../pages/TaskPage/state/WorkActivityContext';
import { useWorkspaceState } from '../../pages/TaskPage/state/WorkspaceContext';
import { useRegisterRunner } from '../runnerContext';
import NodePreview from '../node/NodePreview';
import type { LocalNodeStatus } from './useLocalNodeSession';
import { useLocalNodeSession } from './useLocalNodeSession';
import { useLocalWorkspace } from './useLocalWorkspace';
import TerminalSessionTabs from './TerminalSessionTabs';
import styles from './LocalNodeRuntime.module.css';

type LocalNodeRuntimeProps = { task: TaskResponse; isVisible: boolean };

// xterm is only downloaded for Node tasks (and doesn't touch <canvas> on other pages or in tests).
const TerminalView = lazy(() => import('../node/TerminalView'));

function previewTabId(port: number): string {
  return `preview:${port}`;
}

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

  const [activeTab, setActiveTab] = useState('terminal');

  const blockedError =
    workspace.status === 'error'
      ? (workspace.error ?? 'The workspace could not start.')
      : (workspace.environment?.error ?? null);

  const session = useLocalNodeSession({
    taskId: task.id,
    enabled: workspace.status === 'ready' && blockedError === null,
    files: state.files,
    blockedError,
    onServerReady: (server) => setActiveTab(previewTabId(server.port)),
    onServerClosed: (port, remaining) =>
      setActiveTab((current) => {
        if (current !== previewTabId(port)) return current;
        const next = remaining[remaining.length - 1];
        return next ? previewTabId(next.port) : 'terminal';
      }),
    onTerminalActivity: markWork,
  });
  const {
    status,
    errorMessage,
    servers,
    terminals,
    activeTerminalKey,
    terminalError,
    isCreatingTerminal,
    registerTerminal,
    createTerminal,
    selectTerminal,
    closeTerminal,
    retryTerminal,
    focusActiveTerminal,
    runCommand,
    resize,
    retry,
  } = session;

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
    focusActiveTerminal();
  }, [flush, focusActiveTerminal, runCommand, task.runCommand]);

  useRegisterRunner({
    canRun,
    label,
    title,
    isRunning: status === 'booting' || status === 'installing',
    run,
  });

  // A stopped Preview server must not leave the pane stranded on a closed tab; the
  // onServerClosed callback selects another live server (or Terminal) when that happens.
  const shownTab =
    activeTab === 'terminal' || servers.some((server) => previewTabId(server.port) === activeTab)
      ? activeTab
      : 'terminal';

  const activeSession = terminals.find((terminal) => terminal.key === activeTerminalKey);
  const canRetryTerminal = activeSession?.status === 'error' || activeSession?.status === 'exited';

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
        {terminalError && (
          <div className={styles.terminalBanner} role="status">
            <span>{terminalError}</span>
            {canRetryTerminal && activeSession && (
              <button
                type="button"
                className={styles.retry}
                onClick={() => retryTerminal(activeSession.key)}
              >
                <RotateCcw size={12} aria-hidden="true" />
                Retry
              </button>
            )}
          </div>
        )}

        {/* Every session stays mounted (hidden when inactive) so its process and scrollback survive. */}
        <div className={styles.terminalArea} hidden={shownTab !== 'terminal'}>
          <TerminalSessionTabs
            sessions={terminals}
            activeKey={activeTerminalKey}
            isCreating={isCreatingTerminal}
            onSelect={selectTerminal}
            onNew={createTerminal}
            onClose={closeTerminal}
          />
          <div className={styles.stack}>
            {terminals.length === 0 ? (
              <div className={styles.loading}>Starting terminal…</div>
            ) : (
              terminals.map((terminal) => (
                <div
                  key={terminal.key}
                  className={styles.view}
                  hidden={terminal.key !== activeTerminalKey}
                >
                  <Suspense fallback={<div className={styles.loading}>Loading terminal…</div>}>
                    <TerminalView
                      taskId={task.id}
                      isVisible={
                        isVisible &&
                        shownTab === 'terminal' &&
                        terminal.key === activeTerminalKey &&
                        terminal.status === 'ready'
                      }
                      onReady={(instance) => registerTerminal(terminal.key, instance)}
                      onResize={(cols, rows) => resize(terminal.key, cols, rows)}
                    />
                  </Suspense>
                </div>
              ))
            )}
          </div>
        </div>

        {servers.map((server) => (
          <div
            key={server.port}
            className={styles.view}
            hidden={shownTab !== previewTabId(server.port)}
          >
            <NodePreview url={server.url} port={server.port} />
          </div>
        ))}
      </>
    );
  }

  return (
    <ResultPaneFrame
      tabs={[
        { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
        ...servers.map((server, index) => ({
          id: previewTabId(server.port),
          label: index === 0 ? 'Preview' : `Preview ${index + 1}`,
          icon: Globe,
          badge: { text: `:${server.port}`, tone: 'neutral' as const },
        })),
      ]}
      activeTab={shownTab}
      onTabChange={setActiveTab}
      toolbarEnd={pill}
    >
      <div className={styles.body}>{body}</div>
    </ResultPaneFrame>
  );
}
