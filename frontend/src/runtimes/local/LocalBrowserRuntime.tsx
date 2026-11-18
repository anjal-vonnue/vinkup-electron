import ReactMarkdown from 'react-markdown';
import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CircleAlert,
  Eye,
  FileCode2,
  Gauge,
  Info,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  SquareTerminal,
  Zap,
  XCircle,
} from 'lucide-react';
import type { LighthouseAuditResult, TaskResponse } from '@itp/types';
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

const AUDIT_CATEGORIES = [
  { key: 'performance', label: 'Performance', icon: Zap },
  { key: 'accessibility', label: 'Accessibility', icon: Eye },
  { key: 'best-practices', label: 'Best Practices', icon: ShieldCheck },
  { key: 'seo', label: 'SEO', icon: Search },
] as const;

/* Lighthouse display helpers (presentation only) */

type Audit = LighthouseAuditResult['audits'][number];
type Tone = 'good' | 'average' | 'poor' | 'none';

const PASS_SCORE = 0.9;

const TONE_CLASS: Record<Tone, string> = {
  good: styles.lhGood,
  average: styles.lhAverage,
  poor: styles.lhPoor,
  none: styles.lhNone,
};

const TONE_LABEL: Record<Tone, string> = {
  good: 'Good',
  average: 'Needs improvement',
  poor: 'Poor',
  none: 'No score',
};

function toneOf(score: number | null): Tone {
  if (score === null) return 'none';
  if (score >= PASS_SCORE) return 'good';
  if (score >= 0.5) return 'average';
  return 'poor';
}

function AuditRow({ audit }: { audit: Audit }) {
  const tone = toneOf(audit.score);
  const Icon =
    audit.score === null
      ? Info
      : audit.score >= PASS_SCORE
        ? CheckCircle2
        : tone === 'poor'
          ? XCircle
          : CircleAlert;
  const statusText =
    audit.score === null ? 'Information' : audit.score >= PASS_SCORE ? 'Passed' : 'Needs attention';

  return (
    <details className={styles.lhRow}>
      <summary className={styles.lhRowSummary}>
        <Icon size={16} aria-hidden="true" className={`${styles.lhRowIcon} ${TONE_CLASS[tone]}`} />
        <span className={styles.lhSrOnly}>{statusText}: </span>
        <span className={styles.lhRowTitle}>{audit.title}</span>
        {audit.displayValue && <span className={styles.lhRowValue}>{audit.displayValue}</span>}
      </summary>

      <div className={`${styles.lhRowBody} ${styles.auditDescription}`}>
        <ReactMarkdown
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
          }}
        >
          {audit.description}
        </ReactMarkdown>
      </div>
    </details>
  );
}

export default function LocalBrowserRuntime({ task, isVisible }: LocalBrowserRuntimeProps) {
  const state = useWorkspaceState();
  const workspace = useLocalWorkspace(task.id);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [chosenEntry, setChosenEntry] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('result');
  const [auditResult, setAuditResult] = useState<LighthouseAuditResult | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);

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
  const canAudit = canRun && Boolean(run) && !isAuditing;

  // Split findings so failures come first and the noisy rest stays folded away.
  const findings = useMemo(() => {
    const audits = auditResult?.audits ?? [];

    return {
      attention: audits
        .filter((audit) => audit.score !== null && audit.score < PASS_SCORE)
        .sort((a, b) => (a.score ?? 0) - (b.score ?? 0)),
      passed: audits.filter((audit) => audit.score !== null && audit.score >= PASS_SCORE),
      info: audits.filter((audit) => audit.score === null),
    };
  }, [auditResult]);

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

  const runLighthouse = useCallback(async () => {
    if (!canAudit) return;

    setIsAuditing(true);
    setAuditError(null);
    setActiveTab('lighthouse');

    try {
      // Ensure the audit uses the latest editor contents.
      await flush();

      const result = await window.desktop!.audit.run(task.id);
      setAuditResult(result);
    } catch (error) {
      setAuditResult(null);
      setAuditError(error instanceof Error ? error.message : 'Unable to run the Lighthouse audit.');
    } finally {
      setIsAuditing(false);
    }
  }, [canAudit, flush, task.id]);

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

      <button
        type="button"
        className={styles.iconButton}
        aria-label="Run Lighthouse audit"
        title="Run Lighthouse audit"
        disabled={!canAudit}
        onClick={() => void runLighthouse()}
      >
        <Gauge size={14} aria-hidden="true" />
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
        // { id: 'lighthouse', label: 'Lighthouse', icon: Gauge },
      ]}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      toolbarEnd={toolbarEnd}
      footer={footer}
    >
      {/* Preview tab */}
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

      {/* Console tab */}
      <div
        className={styles.view}
        role="tabpanel"
        aria-label="Console"
        hidden={activeTab !== 'console'}
      >
        <ConsolePanel entries={entries} onClear={clearConsole} onResetStorage={resetStorage} />
      </div>

      {/* Lighthouse tab */}
      <div
        className={styles.view}
        role="tabpanel"
        aria-label="Lighthouse"
        hidden={activeTab !== 'lighthouse'}
      >
        {isAuditing ? (
          <div className={styles.lhState} role="status" aria-live="polite">
            <span className={styles.lhSpinner} aria-hidden="true" />
            <p className={styles.lhStateTitle}>Running Lighthouse audit…</p>
            <p className={styles.lhStateText}>This may take a little while.</p>
          </div>
        ) : auditError ? (
          <div className={`${styles.lhState} ${styles.lhStateError}`} role="alert">
            <AlertCircle size={28} aria-hidden="true" />
            <p className={styles.lhStateTitle}>The audit could not run</p>
            <p className={styles.lhStateText}>{auditError}</p>
            <button
              type="button"
              className={styles.lhButton}
              onClick={() => void runLighthouse()}
              disabled={!canAudit}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : auditResult ? (
          <div className={styles.lhScroll}>
            <div className={styles.lhHeader}>
              <div>
                <h3 className={styles.lhTitle}>Lighthouse results</h3>
                <p className={styles.lhTimestamp}>
                  Audited{' '}
                  <time dateTime={new Date(auditResult.fetchedAt).toISOString()}>
                    {new Date(auditResult.fetchedAt).toLocaleString()}
                  </time>
                </p>
              </div>

              <button
                type="button"
                className={styles.lhButton}
                disabled={!canAudit}
                onClick={() => void runLighthouse()}
              >
                <RefreshCw size={14} aria-hidden="true" />
                Run again
              </button>
            </div>

            <ul className={styles.lhScores}>
              {AUDIT_CATEGORIES.map(({ key, label, icon: Icon }) => {
                const score = auditResult.scores[key];
                const percentage = score === null ? null : Math.round(score * 100);
                const tone = toneOf(score);

                return (
                  <li className={`${styles.lhScore} ${TONE_CLASS[tone]}`} key={key}>
                    <div
                      className={styles.lhRing}
                      style={{ '--lh-p': percentage ?? 0 } as CSSProperties}
                      role="img"
                      aria-label={
                        percentage === null
                          ? `${label}: no score`
                          : `${label}: ${percentage} out of 100, ${TONE_LABEL[tone]}`
                      }
                    >
                      <span aria-hidden="true">{percentage === null ? '—' : percentage}</span>
                    </div>
                    <span className={styles.lhScoreLabel}>
                      <Icon size={14} aria-hidden="true" />
                      {label}
                    </span>
                    <span className={styles.lhScoreBand}>{TONE_LABEL[tone]}</span>
                  </li>
                );
              })}
            </ul>

            <div className={styles.lhFindings}>
              <h4 className={styles.lhHeading}>Audit findings</h4>

              {auditResult.audits.length === 0 ? (
                <p className={styles.lhStateText}>No audit findings available.</p>
              ) : (
                <>
                  {findings.attention.length > 0 && (
                    <section>
                      <h5 className={styles.lhGroupTitle}>
                        Needs attention <span>{findings.attention.length}</span>
                      </h5>
                      <div className={styles.lhGroup}>
                        {findings.attention.map((audit) => (
                          <AuditRow key={audit.id} audit={audit} />
                        ))}
                      </div>
                    </section>
                  )}

                  {findings.passed.length > 0 && (
                    <details className={styles.lhFold}>
                      <summary className={styles.lhFoldSummary}>
                        Passed <span>{findings.passed.length}</span>
                      </summary>
                      <div className={styles.lhGroup}>
                        {findings.passed.map((audit) => (
                          <AuditRow key={audit.id} audit={audit} />
                        ))}
                      </div>
                    </details>
                  )}

                  {findings.info.length > 0 && (
                    <details className={styles.lhFold}>
                      <summary className={styles.lhFoldSummary}>
                        Information <span>{findings.info.length}</span>
                      </summary>
                      <div className={styles.lhGroup}>
                        {findings.info.map((audit) => (
                          <AuditRow key={audit.id} audit={audit} />
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.lhState}>
            <span className={styles.lhStateIcon} aria-hidden="true">
              <Gauge size={26} />
            </span>
            <p className={styles.lhStateTitle}>Run a Lighthouse audit</p>
            <p className={styles.lhStateText}>
              Analyze your page performance, accessibility, best practices, and SEO.
            </p>
            <button
              type="button"
              className={`${styles.lhButton} ${styles.lhButtonPrimary}`}
              disabled={!canAudit}
              onClick={() => void runLighthouse()}
            >
              <Gauge size={14} aria-hidden="true" />
              Run audit
            </button>
          </div>
        )}
      </div>
    </ResultPaneFrame>
  );
}
