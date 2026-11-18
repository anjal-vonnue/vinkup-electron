import { useCallback, useMemo, useRef, useState } from 'react';
import { CircleAlert, Eye, FileCode2, Lock, RefreshCw, SquareTerminal } from 'lucide-react';
import type { TaskResponse } from '@itp/types';
import ResultPaneFrame from '../../components/ResultPaneFrame';
import { isIgnoredPath } from '../../lib/workspaceIgnore';
import { selectHtmlEntry } from '../../pages/TaskPage/state/selectors';
import { useWorkspaceState } from '../../pages/TaskPage/state/WorkspaceContext';
import { useRegisterRunner } from '../runnerContext';
import ConsolePanel from '../browser/ConsolePanel';
import PreviewFrame from '../browser/PreviewFrame';
import { useLocalPreview } from './useLocalPreview';
import { useLocalWorkspace } from './useLocalWorkspace';
import styles from './LocalBrowserRuntime.module.css';

type LocalBrowserRuntimeProps = { task: TaskResponse; isVisible: boolean };

const NO_ENTRY_MESSAGE = 'Add an .html file to preview your work.';

export default function LocalBrowserRuntime({ task, isVisible }: LocalBrowserRuntimeProps) {
  const state = useWorkspaceState();
  const workspace = useLocalWorkspace(task.id);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [chosenEntry, setChosenEntry] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('result');

  const defaultEntry = useMemo(() => selectHtmlEntry(state), [state]);
  const entryPath = chosenEntry !== null && chosenEntry in state.files ? chosenEntry : defaultEntry;
  const setEntryPath = useCallback((path: string) => setChosenEntry(path), []);

  const { run, entries, errorCount, isDomReady, isRunning, start, clearConsole, resetStorage } =
    useLocalPreview({
      taskId: task.id,
      files: state.files,
      entryPath,
      setEntryPath,
      isVisible,
      previewUrl: workspace.previewUrl,
      isReady: workspace.status === 'ready',
      iframeRef,
    });

  const htmlPaths = useMemo(
    () =>
      Object.keys(state.files)
        .filter((path) => path.endsWith('.html') && !isIgnoredPath(path))
        .sort(),
    [state.files]
  );

  const canRun = workspace.status === 'ready' && entryPath !== null;

  // Flush pending editor changes so a Run never serves the previous keystrokes.
  const flush = workspace.flush;
  const startRun = useCallback(
    (target?: string) => {
      void flush()
        .catch(() => undefined)
        .then(() => (target === undefined ? start() : start(target)));
    },
    [flush, start]
  );

  useRegisterRunner({
    canRun,
    label: 'Run',
    title: entryPath ? 'Run (Ctrl+Enter)' : 'Add an .html file to run',
    isRunning: workspace.status === 'opening' || isRunning,
    run: startRun,
  });

  const status = (() => {
    if (workspace.status === 'opening') return 'Preparing your workspace…';
    if (workspace.status === 'error') return workspace.error ?? 'The workspace could not start.';
    if (isRunning) return 'Loading your page…';
    if (!run) return 'Press Run to see your page.';
    return `Serving ${run.entryPath} from your computer.`;
  })();

  const isError = workspace.status === 'error';

  const toolbarEnd = (
    <div className={styles.toolbar}>
      <div className={styles.urlField}>
        <Lock size={13} aria-hidden="true" className={styles.lockIcon} />
        <select
          className={styles.urlSelect}
          aria-label="Preview page"
          value={entryPath ?? ''}
          disabled={htmlPaths.length === 0}
          onChange={(event) => {
            setEntryPath(event.target.value);
            startRun(event.target.value);
          }}
        >
          {htmlPaths.length === 0 && <option value="">localhost</option>}
          {htmlPaths.map((path) => (
            <option key={path} value={path}>
              {workspace.previewUrl ? `${workspace.previewUrl}/${path}` : path}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Reload preview"
        title="Reload preview"
        disabled={!canRun}
        onClick={() => startRun()}
      >
        <RefreshCw size={14} aria-hidden="true" />
      </button>
    </div>
  );

  const footer = (
    <div className={styles.footer}>
      <span className={isError ? `${styles.status} ${styles.statusError}` : styles.status}>
        <span className={styles.systemTag}>[System]</span> {status}
      </span>
      {run && (
        <span className={isDomReady ? `${styles.ready} ${styles.readyDone}` : styles.ready}>
          <span className={styles.dot} aria-hidden="true" />
          {isDomReady ? 'DOM Ready' : 'Loading…'}
        </span>
      )}
    </div>
  );

  return (
    <ResultPaneFrame
      tabs={[
        { id: 'result', label: 'Result', icon: Eye },
        {
          id: 'console',
          label: 'Console',
          icon: SquareTerminal,
          badge: errorCount > 0 ? { text: String(errorCount), tone: 'error' } : undefined,
        },
      ]}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      toolbarEnd={toolbarEnd}
      footer={footer}
    >
      <div
        className={styles.view}
        role="tabpanel"
        aria-label="Result"
        hidden={activeTab !== 'result'}
      >
        {entryPath === null ? (
          <div className={styles.empty}>
            <FileCode2 size={28} aria-hidden="true" />
            <p>{NO_ENTRY_MESSAGE}</p>
          </div>
        ) : (
          <>
            {isError && (
              <div className={styles.banner}>
                <CircleAlert size={14} aria-hidden="true" />
                {workspace.error}
              </div>
            )}
            {run ? (
              <div className={styles.frameArea}>
                <PreviewFrame
                  src={run.url}
                  runId={run.runId}
                  entryPath={run.entryPath}
                  iframeRef={iframeRef}
                />
              </div>
            ) : (
              !isError && (
                <div className={styles.empty}>
                  <p>
                    {workspace.status === 'opening'
                      ? 'Preparing your workspace…'
                      : 'Press Run to see your page.'}
                  </p>
                </div>
              )
            )}
          </>
        )}
      </div>
      <div
        className={styles.view}
        role="tabpanel"
        aria-label="Console"
        hidden={activeTab !== 'console'}
      >
        <ConsolePanel entries={entries} onClear={clearConsole} onResetStorage={resetStorage} />
      </div>
    </ResultPaneFrame>
  );
}
