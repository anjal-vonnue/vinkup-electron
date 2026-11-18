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

/**
 * Lighthouse puts every audit in a category and, usually, a group inside it
 * (for example Accessibility > "Names and labels"). The main process passes
 * these through; older results without them fall back to one flat list.
 */
type GroupedAudit = Audit & {
  category?: string | null;
  group?: string | null;
  groupTitle?: string | null;
};

type AttentionGroup = { id: string; title: string | null; audits: GroupedAudit[] };
type AttentionCategory = { key: string; label: string | null; groups: AttentionGroup[] };

function prettifyGroupId(id: string): string {
  const text = id.replace(/^a11y-/, '').replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Where Lighthouse puts each audit, mirroring Chrome's report headings.
 * Used when an audit arrives without `category`/`group` from the main process;
 * if those fields are present they win. Group order here is display order.
 */
type GroupDef = { category: string; title: string; ids: string[] };

const GROUPS: Record<string, GroupDef> = {
  metrics: {
    category: 'performance',
    title: 'Metrics',
    ids: [
      'first-contentful-paint',
      'largest-contentful-paint',
      'total-blocking-time',
      'cumulative-layout-shift',
      'speed-index',
      'interactive',
      'max-potential-fid',
    ],
  },
  insights: { category: 'performance', title: 'Insights', ids: [] },
  diagnostics: {
    category: 'performance',
    title: 'Diagnostics',
    ids: [
      'unminified-javascript',
      'unminified-css',
      'unused-css-rules',
      'unused-javascript',
      'uses-long-cache-ttl',
      'total-byte-weight',
      'dom-size',
      'duplicated-javascript',
      'legacy-javascript',
      'font-display',
      'bootup-time',
      'mainthread-work-breakdown',
      'third-party-summary',
      'third-party-facades',
      'long-tasks',
      'non-composited-animations',
      'unsized-images',
      'prioritize-lcp-image',
      'redirects',
      'uses-optimized-images',
      'uses-responsive-images',
      'uses-text-compression',
      'uses-rel-preconnect',
      'efficient-animated-content',
      'modern-image-formats',
      'offscreen-images',
      'render-blocking-resources',
      'server-response-time',
      'critical-request-chains',
      'layout-shifts',
      'lcp-lazy-loaded',
      'network-requests',
      'network-rtt',
      'network-server-latency',
      'main-thread-tasks',
    ],
  },
  'a11y-color-contrast': {
    category: 'accessibility',
    title: 'Contrast',
    ids: ['color-contrast', 'link-in-text-block'],
  },
  'a11y-names-labels': {
    category: 'accessibility',
    title: 'Names and labels',
    ids: [
      'button-name',
      'document-title',
      'form-field-multiple-labels',
      'frame-title',
      'image-alt',
      'image-redundant-alt',
      'input-button-name',
      'input-image-alt',
      'label',
      'link-name',
      'object-alt',
      'select-name',
      'summary-name',
      'custom-controls-labels',
      'custom-controls-roles',
    ],
  },
  'a11y-navigation': {
    category: 'accessibility',
    title: 'Navigation',
    ids: [
      'accesskeys',
      'bypass',
      'heading-order',
      'tabindex',
      'skip-link',
      'focus-traps',
      'focusable-controls',
      'interactive-element-affordance',
      'logical-tab-order',
      'managed-focus',
      'offscreen-content-hidden',
      'use-landmarks',
      'visual-order-follows-dom',
    ],
  },
  'a11y-aria': {
    category: 'accessibility',
    title: 'ARIA',
    ids: [
      'aria-allowed-attr',
      'aria-allowed-role',
      'aria-command-name',
      'aria-conditional-attr',
      'aria-deprecated-role',
      'aria-dialog-name',
      'aria-hidden-body',
      'aria-hidden-focus',
      'aria-input-field-name',
      'aria-meter-name',
      'aria-progressbar-name',
      'aria-prohibited-attr',
      'aria-required-attr',
      'aria-required-children',
      'aria-required-parent',
      'aria-roles',
      'aria-text',
      'aria-toggle-field-name',
      'aria-tooltip-name',
      'aria-treeitem-name',
      'aria-valid-attr-value',
      'aria-valid-attr',
    ],
  },
  'a11y-language': {
    category: 'accessibility',
    title: 'Internationalization and localization',
    ids: ['html-has-lang', 'html-lang-valid', 'html-xml-lang-mismatch', 'valid-lang'],
  },
  'a11y-audio-video': {
    category: 'accessibility',
    title: 'Audio and video',
    ids: ['audio-caption', 'video-caption'],
  },
  'a11y-tables-lists': {
    category: 'accessibility',
    title: 'Tables and lists',
    ids: [
      'definition-list',
      'dlitem',
      'list',
      'listitem',
      'td-headers-attr',
      'th-has-data-cells',
      'td-has-header',
      'table-duplicate-name',
      'table-fake-caption',
    ],
  },
  'a11y-best-practices': {
    category: 'accessibility',
    title: 'Best practices',
    ids: [
      'meta-viewport',
      'landmark-one-main',
      'target-size',
      'identical-links-same-purpose',
      'label-content-name-mismatch',
      'empty-heading',
      'duplicate-id-aria',
      'duplicate-id-active',
      'duplicate-id',
    ],
  },
  'trust-safety': {
    category: 'best-practices',
    title: 'Trust and Safety',
    ids: [
      'is-on-https',
      'csp-xss',
      'has-hsts',
      'origin-isolation',
      'clickjacking-mitigation',
      'trusted-types-xss',
    ],
  },
  ux: {
    category: 'best-practices',
    title: 'User Experience',
    ids: [
      'geolocation-on-start',
      'notification-on-start',
      'paste-preventing-inputs',
      'image-aspect-ratio',
      'image-size-responsive',
    ],
  },
  'browser-compat': {
    category: 'best-practices',
    title: 'Browser Compatibility',
    ids: ['doctype', 'charset'],
  },
  general: {
    category: 'best-practices',
    title: 'General',
    ids: [
      'js-libraries',
      'deprecations',
      'errors-in-console',
      'inspector-issues',
      'valid-source-maps',
      'third-party-cookies',
      'bf-cache',
    ],
  },
  'seo-mobile': { category: 'seo', title: 'Mobile Friendly', ids: ['viewport', 'font-size'] },
  'seo-content': {
    category: 'seo',
    title: 'Content Best Practices',
    ids: ['meta-description', 'link-text', 'hreflang', 'canonical', 'structured-data'],
  },
  'seo-crawl': {
    category: 'seo',
    title: 'Crawling and Indexing',
    ids: ['http-status-code', 'is-crawlable', 'robots-txt', 'crawlable-anchors'],
  },
};

const GROUP_ORDER = Object.keys(GROUPS);

const PLACEMENT = new Map<string, string>();
for (const [groupId, def] of Object.entries(GROUPS)) {
  for (const id of def.ids) PLACEMENT.set(id, groupId);
}

function placementOf(audit: GroupedAudit): {
  category: string | null;
  groupId: string;
  title: string | null;
} {
  // Data from the main process wins.
  if (audit.category) {
    const groupId = audit.group ?? '';
    return {
      category: audit.category,
      groupId,
      title: groupId
        ? (audit.groupTitle ?? GROUPS[groupId]?.title ?? prettifyGroupId(groupId))
        : null,
    };
  }

  const groupId = PLACEMENT.get(audit.id) ?? (audit.id.endsWith('-insight') ? 'insights' : '');
  const def = GROUPS[groupId];

  return { category: def?.category ?? null, groupId, title: def?.title ?? null };
}

function buildAttentionTree(audits: GroupedAudit[]): AttentionCategory[] {
  const categoryOrder: string[] = AUDIT_CATEGORIES.map((category) => category.key);
  const categories = new Map<string, AttentionCategory>();

  for (const audit of audits) {
    const placement = placementOf(audit);
    const key =
      placement.category && categoryOrder.includes(placement.category)
        ? placement.category
        : 'other';

    let category = categories.get(key);
    if (!category) {
      category = {
        key,
        label: AUDIT_CATEGORIES.find((item) => item.key === key)?.label ?? null,
        groups: [],
      };
      categories.set(key, category);
    }

    let group = category.groups.find((item) => item.id === placement.groupId);
    if (!group) {
      group = { id: placement.groupId, title: placement.title, audits: [] };
      category.groups.push(group);
    }

    group.audits.push(audit);
  }

  const rankCategory = (key: string) =>
    categoryOrder.includes(key) ? categoryOrder.indexOf(key) : 99;
  const rankGroup = (id: string) => {
    const index = GROUP_ORDER.indexOf(id);
    return index === -1 ? 999 : index;
  };

  const tree = [...categories.values()].sort((a, b) => rankCategory(a.key) - rankCategory(b.key));

  for (const category of tree) {
    category.groups.sort((a, b) => rankGroup(a.id) - rankGroup(b.id));

    // Worst first inside each group.
    for (const group of category.groups) {
      group.audits.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
    }
  }

  return tree;
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
    <details className={styles.lhRow} data-audit-id={audit.id}>
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
      attention: audits.filter((audit) => audit.score !== null && audit.score < PASS_SCORE),
      passed: audits.filter((audit) => audit.score !== null && audit.score >= PASS_SCORE),
      info: audits.filter((audit) => audit.score === null),
    };
  }, [auditResult]);

  const attentionTree = useMemo(
    () => buildAttentionTree(findings.attention as GroupedAudit[]),
    [findings.attention]
  );
  const showCategoryHeadings = attentionTree.some((category) => category.label !== null);

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
                      {attentionTree.map((category) => (
                        <div className={styles.lhCategory} key={category.key}>
                          {showCategoryHeadings && (
                            <h6 className={styles.lhCategoryTitle}>{category.label ?? 'Other'}</h6>
                          )}

                          {category.groups.map((group) => (
                            <div className={styles.lhSubgroup} key={group.id || 'ungrouped'}>
                              {group.title && (
                                <p className={styles.lhSubgroupTitle}>
                                  {group.title} <span>{group.audits.length}</span>
                                </p>
                              )}
                              <div className={styles.lhGroup}>
                                {group.audits.map((audit) => (
                                  <AuditRow key={audit.id} audit={audit} />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
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
