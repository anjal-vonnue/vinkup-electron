import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { ArrowLeft, Check, Copy, Loader2, Pencil, Trash2, X } from 'lucide-react';
import type { AiDecision, AiTaskResult, ReviewPrompt } from '@itp/types';
import { lazy, memo, Suspense } from 'react';
import {
  analyzeTasks,
  approveTask,
  createReviewPrompt,
  deleteReviewPrompt,
  listReviewPrompts,
  requestRework,
  updateReviewPrompt,
} from '../../api/admin';
import styles from './AiReviewModal.module.css';

const MAX_TASKS = 50;
const MAX_NAME = 100;
const MAX_CONTENT = 8000;
const MAX_FEEDBACK = 10000;

export type AiReviewTask = { taskId: string; title: string };

type AiReviewModalProps = {
  traineeId: string;
  traineeName?: string;
  /** Tasks the mentor can analyze (normally those awaiting review). */
  tasks: AiReviewTask[];
  onClose: () => void;
  /** Called after at least one decision was applied, so the page can refresh. */
  onApplied: () => void;
};

type Step = 'setup' | 'running' | 'review' | 'confirm' | 'result';
type DiscardAction = 'setup' | 'close';
type Decision = AiDecision | 'skip';
type Draft = {
  decision: Decision;
  feedback: string;
  reasoning: string;
  evidence: string[];
  provider: string;
  model: string;
};
type Outcome = { state: 'applying' | 'applied' | 'failed'; error?: string };
type Editor = { id: string | null; name: string; content: string };

const TaskCodeViewer = lazy(() => {
  const viewer = import('../TaskCodeViewer/TaskCodeViewer');
  void import('../ReadOnlyCodeViewer').catch((error: unknown) => {
    console.error('[admin] Failed to preload the code editor', error);
  });
  return viewer;
});

type ReviewCardProps = {
  result: AiTaskResult;
  title: string;
  draft?: Draft;
  retrying: boolean;
  isCodeSelected: boolean;
  onRetry: (taskId: string) => void;
  onDraftChange: (taskId: string, patch: Partial<Draft>) => void;
  onToggleCode: (taskId: string, trigger: HTMLButtonElement) => void;
};

const ReviewCard = memo(function ReviewCard({
  result,
  title,
  draft,
  retrying,
  isCodeSelected,
  onRetry,
  onDraftChange,
  onToggleCode,
}: ReviewCardProps) {
  if (result.status === 'error') {
    return (
      <li className={styles.card}>
        <div className={styles.cardHead}>
          <strong>{title}</strong>
        </div>
        <p className={styles.error}>{result.error}</p>
        <button
          type="button"
          className={styles.secondary}
          disabled={retrying}
          onClick={() => onRetry(result.taskId)}
        >
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      </li>
    );
  }
  if (!draft) return null;

  const needsFeedback = draft.decision === 'rework' && !draft.feedback.trim();
  return (
    <li className={`${styles.card} ${isCodeSelected ? styles.cardSelected : ''}`}>
      <div className={styles.cardHead}>
        <strong>{title}</strong>
        <span className={styles.chip}>
          {draft.provider} · {draft.model}
        </span>
      </div>
      <div className={styles.segmented} role="radiogroup" aria-label={`Decision for ${title}`}>
        {(['approve', 'rework', 'skip'] as const).map((value) => (
          <label key={value} className={draft.decision === value ? styles.segActive : styles.seg}>
            <input
              type="radio"
              name={`decision-${result.taskId}`}
              checked={draft.decision === value}
              onChange={() => onDraftChange(result.taskId, { decision: value })}
            />
            {DECISION_LABEL[value]}
          </label>
        ))}
      </div>
      <p className={styles.reasoning}>{draft.reasoning}</p>
      {draft.evidence.length > 0 && (
        <ul className={styles.evidence}>
          {draft.evidence.map((line, index) => (
            <li key={index}>
              <code>{line}</code>
            </li>
          ))}
        </ul>
      )}
      <label className={styles.field}>
        <span>Feedback to trainee</span>
        <textarea
          rows={4}
          value={draft.feedback}
          maxLength={MAX_FEEDBACK}
          onChange={(event) => onDraftChange(result.taskId, { feedback: event.target.value })}
        />
      </label>
      {needsFeedback && <p className={styles.error}>Rework needs feedback for the trainee.</p>}
      <button
        type="button"
        className={`${styles.link} ${isCodeSelected ? styles.linkActive : ''}`}
        aria-pressed={isCodeSelected}
        onClick={(event) => onToggleCode(result.taskId, event.currentTarget)}
      >
        {isCodeSelected ? 'Hide code' : 'View code'}
      </button>
    </li>
  );
});

function errorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: string } | undefined;
    return data?.message ?? data?.error ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

const DECISION_LABEL: Record<Decision, string> = {
  approve: 'Approve',
  rework: 'Rework',
  skip: 'Skip',
};

export function AiReviewModal({
  traineeId,
  traineeName,
  tasks,
  onClose,
  onApplied,
}: AiReviewModalProps) {
  // Frozen at open time so a background refresh can't change what is being reviewed.
  const [snapshot] = useState(tasks);
  const titleById = useMemo(() => new Map(snapshot.map((t) => [t.taskId, t.title])), [snapshot]);
  const titleOf = (taskId: string) => titleById.get(taskId) ?? taskId;

  const [step, setStep] = useState<Step>('setup');
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepReviewingRef = useRef<HTMLButtonElement>(null);
  const codePaneCloseRef = useRef<HTMLButtonElement>(null);
  const codeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const discardTriggerRef = useRef<HTMLElement | null>(null);
  const runRef = useRef(0);

  // setup
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(snapshot.map((t) => t.taskId))
  );
  const [prompts, setPrompts] = useState<ReviewPrompt[] | null>(null);
  const [promptsError, setPromptsError] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [managing, setManaging] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // review / confirm / result
  const [order, setOrder] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, AiTaskResult>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [applying, setApplying] = useState(false);
  const [discardAction, setDiscardAction] = useState<DiscardAction | null>(null);
  const [codeTaskId, setCodeTaskId] = useState<string | null>(null);
  const codeTaskIdRef = useRef<string | null>(null);
  codeTaskIdRef.current = codeTaskId;

  const promptId = prompts?.some((p) => p.id === selectedPromptId)
    ? selectedPromptId
    : (prompts?.[0]?.id ?? '');
  const selectedPrompt = prompts?.find((p) => p.id === promptId);

  useEffect(() => {
    let cancelled = false;
    listReviewPrompts()
      .then((list) => {
        if (!cancelled) setPrompts(list);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPrompts([]);
          setPromptsError(errorMessage(error, 'Could not load saved prompts.'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    if (discardAction) keepReviewingRef.current?.focus();
  }, [discardAction]);

  useEffect(() => {
    if (codeTaskId) codePaneCloseRef.current?.focus();
  }, [codeTaskId]);

  const restoreDiscardFocus = useCallback(() => {
    const trigger = discardTriggerRef.current;
    discardTriggerRef.current = null;
    if (trigger?.isConnected) trigger.focus();
    else dialogRef.current?.focus();
  }, []);

  const hasReviewResults =
    (step === 'review' || step === 'confirm') && Object.keys(results).length > 0;

  const clearReview = useCallback(() => {
    setResults({});
    setDrafts({});
    setOutcomes({});
    setOrder([]);
  }, []);

  const requestLeave = useCallback(
    (action: DiscardAction, trigger?: EventTarget | null) => {
      if (!hasReviewResults) {
        onClose();
        return;
      }
      discardTriggerRef.current = trigger instanceof HTMLElement ? trigger : null;
      setDiscardAction(action);
    },
    [hasReviewResults, onClose]
  );

  const handleReviewBack = useCallback(
    (trigger: EventTarget | null) => {
      if (hasReviewResults) {
        discardTriggerRef.current = trigger instanceof HTMLElement ? trigger : null;
        setDiscardAction('setup');
        return;
      }
      clearReview();
      setStep('setup');
    },
    [clearReview, hasReviewResults]
  );

  const cancelDiscard = useCallback(() => {
    setDiscardAction(null);
    restoreDiscardFocus();
  }, [restoreDiscardFocus]);

  const confirmDiscard = useCallback(() => {
    const action = discardAction;
    setDiscardAction(null);
    clearReview();
    if (action === 'setup') {
      setStep('setup');
      requestAnimationFrame(restoreDiscardFocus);
    } else {
      onClose();
    }
  }, [clearReview, discardAction, onClose, restoreDiscardFocus]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        applying ||
        !dialogRef.current?.contains(event.target as Node)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (discardAction) {
        cancelDiscard();
      } else if (codeTaskId) {
        codeTaskIdRef.current = null;
        setCodeTaskId(null);
        requestAnimationFrame(() => {
          if (codeTriggerRef.current?.isConnected) codeTriggerRef.current.focus();
        });
      } else {
        requestLeave('close', event.target);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [applying, cancelDiscard, codeTaskId, discardAction, requestLeave]);

  // ---------- prompts ----------

  const openEditor = (prompt?: ReviewPrompt, copy = false) => {
    setEditorError(null);
    setEditor(
      prompt
        ? {
            id: copy ? null : prompt.id,
            name: copy ? `${prompt.name} (copy)`.slice(0, MAX_NAME) : prompt.name,
            content: prompt.content,
          }
        : { id: null, name: '', content: '' }
    );
  };

  const savePrompt = async () => {
    if (!editor) return;
    const name = editor.name.trim();
    const content = editor.content.trim();
    if (!name || !content) {
      setEditorError('Name and prompt text are required.');
      return;
    }
    setSavingPrompt(true);
    setEditorError(null);
    try {
      const saved = editor.id
        ? await updateReviewPrompt(editor.id, { name, content })
        : await createReviewPrompt({ name, content });
      setPrompts((prev) => {
        const list = prev ?? [];
        return editor.id ? list.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...list];
      });
      setSelectedPromptId(saved.id);
      setEditor(null);
    } catch (error) {
      setEditorError(errorMessage(error, 'Could not save the prompt.'));
    } finally {
      setSavingPrompt(false);
    }
  };

  const removePrompt = async (id: string) => {
    try {
      await deleteReviewPrompt(id);
      setPrompts((prev) => (prev ?? []).filter((p) => p.id !== id));
      setConfirmDeleteId(null);
    } catch (error) {
      setPromptsError(errorMessage(error, 'Could not delete the prompt.'));
    }
  };

  // ---------- analysis ----------

  const absorb = useCallback((result: AiTaskResult) => {
    setResults((prev) => ({ ...prev, [result.taskId]: result }));
    if (result.status === 'ok') {
      setDrafts((prev) => ({
        ...prev,
        [result.taskId]: {
          decision: result.recommendation,
          feedback: result.feedback,
          reasoning: result.reasoning,
          evidence: result.evidence,
          provider: result.provider,
          model: result.model,
        },
      }));
    }
  }, []);

  const startAnalysis = async () => {
    const taskIds = snapshot.filter((t) => selected.has(t.taskId)).map((t) => t.taskId);
    const run = ++runRef.current;
    setAnalyzeError(null);
    setStep('running');
    try {
      const response = await analyzeTasks(traineeId, { taskIds, promptId });
      if (runRef.current !== run) return; // cancelled
      setResults({});
      setDrafts({});
      setOutcomes({});
      response.results.forEach(absorb);
      setOrder(taskIds);
      setStep('review');
    } catch (error) {
      if (runRef.current !== run) return;
      setAnalyzeError(errorMessage(error, 'Analysis failed. Please try again.'));
      setStep('setup');
    }
  };

  const cancelAnalysis = () => {
    runRef.current += 1;
    setStep('setup');
  };

  const retryTask = useCallback(
    async (taskId: string) => {
      setRetrying((prev) => new Set(prev).add(taskId));
      try {
        const response = await analyzeTasks(traineeId, { taskIds: [taskId], promptId });
        const result = response.results[0];
        if (result) absorb(result);
      } catch (error) {
        absorb({ taskId, status: 'error', error: errorMessage(error, 'Retry failed.') });
      } finally {
        setRetrying((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    },
    [absorb, promptId, traineeId]
  );

  // ---------- review / apply ----------

  const updateDraft = useCallback(
    (taskId: string, patch: Partial<Draft>) =>
      setDrafts((prev) => {
        const current = prev[taskId];
        return current ? { ...prev, [taskId]: { ...current, ...patch } } : prev;
      }),
    []
  );

  const toggleCodePane = useCallback((taskId: string, trigger: HTMLButtonElement) => {
    codeTriggerRef.current = trigger;
    const closing = codeTaskIdRef.current === taskId;
    const nextTaskId = closing ? null : taskId;
    codeTaskIdRef.current = nextTaskId;
    setCodeTaskId(nextTaskId);
    if (closing) {
      requestAnimationFrame(() => {
        if (trigger.isConnected) trigger.focus();
      });
    }
  }, []);

  const closeCodePane = useCallback(() => {
    codeTaskIdRef.current = null;
    setCodeTaskId(null);
    requestAnimationFrame(() => {
      if (codeTriggerRef.current?.isConnected) codeTriggerRef.current.focus();
    });
  }, []);

  const handleRetryTask = useCallback(
    (taskId: string) => {
      void retryTask(taskId);
    },
    [retryTask]
  );

  const draftIds = order.filter((id) => drafts[id]);
  const toApply = draftIds.filter((id) => drafts[id]?.decision !== 'skip');
  const missingFeedback = toApply.filter(
    (id) => drafts[id]?.decision === 'rework' && !drafts[id]?.feedback.trim()
  );
  const count = (decision: Decision) =>
    draftIds.filter((id) => drafts[id]?.decision === decision).length;

  const applyDecisions = async (ids: string[]) => {
    setApplying(true);
    let anyApplied = false;
    for (const id of ids) {
      const draft = drafts[id];
      if (!draft || draft.decision === 'skip') continue;
      setOutcomes((prev) => ({ ...prev, [id]: { state: 'applying' } }));
      try {
        const feedback = draft.feedback.trim();
        if (draft.decision === 'approve') await approveTask(traineeId, id, feedback);
        else await requestRework(traineeId, id, feedback);
        anyApplied = true;
        setOutcomes((prev) => ({ ...prev, [id]: { state: 'applied' } }));
      } catch (error) {
        setOutcomes((prev) => ({
          ...prev,
          [id]: { state: 'failed', error: errorMessage(error, 'Could not apply this decision.') },
        }));
      }
    }
    setApplying(false);
    setStep('result');
    if (anyApplied) onApplied();
  };

  const failedIds = toApply.filter((id) => outcomes[id]?.state === 'failed');
  const toggleTask = (taskId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });

  // ---------- render ----------

  const renderSetup = () => {
    if (managing) {
      return (
        <>
          <div className={styles.body}>
            {promptsError && <p className={styles.error}>{promptsError}</p>}
            {editor ? (
              <div className={styles.editor}>
                <label className={styles.field}>
                  <span>Name</span>
                  <input
                    value={editor.name}
                    maxLength={MAX_NAME}
                    onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span>Evaluation prompt / rubric</span>
                  <textarea
                    rows={10}
                    value={editor.content}
                    maxLength={MAX_CONTENT}
                    onChange={(e) => setEditor({ ...editor, content: e.target.value })}
                  />
                  <small>
                    {editor.content.length}/{MAX_CONTENT}
                  </small>
                </label>
                {editorError && <p className={styles.error}>{editorError}</p>}
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => setEditor(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={savingPrompt}
                    onClick={() => void savePrompt()}
                  >
                    {savingPrompt ? 'Saving…' : 'Save prompt'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {prompts?.length === 0 && <p className={styles.muted}>No saved prompts yet.</p>}
                <ul className={styles.promptList}>
                  {prompts?.map((p) => (
                    <li key={p.id} className={styles.promptItem}>
                      <div className={styles.promptText}>
                        <strong>{p.name}</strong>
                        <p className={styles.promptPreview}>{p.content}</p>
                      </div>
                      <div className={styles.rowActions}>
                        {confirmDeleteId === p.id ? (
                          <>
                            <button
                              type="button"
                              className={`${styles.promptAction} ${styles.promptActionDanger}`}
                              onClick={() => void removePrompt(p.id)}
                              aria-label={`Confirm delete ${p.name}`}
                              title="Confirm delete"
                            >
                              <Check size={16} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className={styles.promptAction}
                              onClick={() => setConfirmDeleteId(null)}
                              aria-label={`Keep ${p.name}`}
                              title="Keep prompt"
                            >
                              <X size={16} aria-hidden="true" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className={styles.promptAction}
                              onClick={() => openEditor(p)}
                              aria-label={`Edit ${p.name}`}
                              title="Edit prompt"
                            >
                              <Pencil size={16} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className={styles.promptAction}
                              onClick={() => openEditor(p, true)}
                              aria-label={`Duplicate ${p.name}`}
                              title="Duplicate prompt"
                            >
                              <Copy size={16} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className={`${styles.promptAction} ${styles.promptActionDanger}`}
                              onClick={() => setConfirmDeleteId(p.id)}
                              aria-label={`Delete ${p.name}`}
                              title="Delete prompt"
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          {!editor && (
            <div className={styles.footer}>
              <button type="button" className={styles.secondary} onClick={() => setManaging(false)}>
                Back
              </button>
              <button type="button" className={styles.primary} onClick={() => openEditor()}>
                New prompt
              </button>
            </div>
          )}
        </>
      );
    }

    const tooMany = selected.size > MAX_TASKS;
    const canRun = !!promptId && selected.size > 0 && !tooMany;
    return (
      <>
        <div className={styles.body}>
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h3>
                Tasks ({selected.size}/{snapshot.length})
              </h3>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => setSelected(new Set(snapshot.map((t) => t.taskId)))}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => setSelected(new Set())}
                >
                  None
                </button>
              </div>
            </div>
            <ul className={styles.checkList}>
              {snapshot.map((t) => (
                <li key={t.taskId}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.has(t.taskId)}
                      onChange={() => toggleTask(t.taskId)}
                    />
                    <span>{t.title}</span>
                  </label>
                </li>
              ))}
            </ul>
            {tooMany && (
              <p className={styles.error}>Select at most {MAX_TASKS} tasks per analysis.</p>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h3>Prompt</h3>
              <button type="button" className={styles.link} onClick={() => setManaging(true)}>
                Manage prompts
              </button>
            </div>
            {prompts === null && <p className={styles.muted}>Loading prompts…</p>}
            {promptsError && <p className={styles.error}>{promptsError}</p>}
            {prompts?.length === 0 && !promptsError && (
              <p className={styles.muted}>Create a saved prompt first (Manage prompts).</p>
            )}
            {prompts && prompts.length > 0 && (
              <>
                <select
                  className={styles.select}
                  value={promptId}
                  onChange={(e) => setSelectedPromptId(e.target.value)}
                  aria-label="Saved prompt"
                >
                  {prompts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {selectedPrompt && (
                  <p className={styles.preview}>
                    {selectedPrompt.content.slice(0, 240)}
                    {selectedPrompt.content.length > 240 ? '…' : ''}
                  </p>
                )}
              </>
            )}
          </section>
          {analyzeError && <p className={styles.error}>{analyzeError}</p>}
        </div>
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.secondary}
            onClick={(event) => requestLeave('close', event.currentTarget)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={!canRun}
            onClick={() => void startAnalysis()}
          >
            Analyze {selected.size} {selected.size === 1 ? 'task' : 'tasks'}
          </button>
        </div>
      </>
    );
  };

  const renderRunning = () => (
    <>
      <div className={`${styles.body} ${styles.center}`} role="status" aria-live="polite">
        <Loader2 className={styles.spin} aria-hidden="true" />
        <p>
          Analyzing {selected.size} {selected.size === 1 ? 'task' : 'tasks'}…
        </p>
        <p className={styles.muted}>
          This can take a minute. Nothing is changed until you confirm.
        </p>
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.secondary} onClick={cancelAnalysis}>
          Cancel
        </button>
      </div>
    </>
  );

  const renderReview = () => {
    const failed = order.filter((id) => results[id]?.status === 'error').length;
    return (
      <div className={`${styles.reviewSplit} ${codeTaskId ? styles.reviewSplitOpen : ''}`}>
        <section className={styles.reviewColumn} aria-label="AI review results">
          <div className={styles.body}>
            <p className={styles.muted}>
              AI suggestions for {order.length} tasks
              {failed > 0 ? ` (${failed} failed)` : ''}. Edit anything before continuing.
            </p>
            <ul className={styles.results}>
              {order.map((id) => {
                const result = results[id];
                if (!result) return null;
                return (
                  <ReviewCard
                    key={id}
                    result={result}
                    title={titleOf(id)}
                    draft={drafts[id]}
                    retrying={retrying.has(id)}
                    isCodeSelected={codeTaskId === id}
                    onRetry={handleRetryTask}
                    onDraftChange={updateDraft}
                    onToggleCode={toggleCodePane}
                  />
                );
              })}
            </ul>
          </div>
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.secondary}
              onClick={(event) => handleReviewBack(event.currentTarget)}
            >
              Back
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={toApply.length === 0 || missingFeedback.length > 0}
              onClick={() => setStep('confirm')}
            >
              Review {toApply.length} {toApply.length === 1 ? 'decision' : 'decisions'}
            </button>
          </div>
        </section>
        {codeTaskId && (
          <section
            className={styles.codePane}
            role="region"
            aria-label={`Code for ${titleOf(codeTaskId)}`}
          >
            <header className={styles.codePaneHeader}>
              <button type="button" className={styles.codeBack} onClick={closeCodePane}>
                <ArrowLeft size={16} aria-hidden="true" />
                Back to results
              </button>
              <strong title={titleOf(codeTaskId)}>{titleOf(codeTaskId)}</strong>
              <button
                ref={codePaneCloseRef}
                type="button"
                className={styles.iconButton}
                aria-label="Close code"
                onClick={closeCodePane}
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <div className={styles.codePaneBody}>
              <Suspense fallback={<div className={styles.viewerLoading}>Loading code viewer…</div>}>
                <TaskCodeViewer traineeId={traineeId} taskId={codeTaskId} />
              </Suspense>
            </div>
          </section>
        )}
      </div>
    );
  };

  const renderConfirm = () => {
    const approve = toApply.filter((id) => drafts[id]?.decision === 'approve').length;
    const rework = toApply.filter((id) => drafts[id]?.decision === 'rework').length;
    return (
      <>
        <div className={styles.body}>
          <p className={styles.summary}>
            Approve {approve} {approve === 1 ? 'task' : 'tasks'}; request rework on {rework}
            {count('skip') > 0 ? `; skip ${count('skip')}` : ''}.
          </p>
          <p className={styles.muted}>
            These use the same approve and rework actions as manual review
            {traineeName ? ` and will be recorded for ${traineeName}` : ''}.
          </p>
          <ul className={styles.confirmList}>
            {toApply.map((id) => {
              const outcome = outcomes[id];
              return (
                <li key={id}>
                  <span>{titleOf(id)}</span>
                  <span className={styles.chip}>
                    {drafts[id] ? DECISION_LABEL[drafts[id].decision] : ''}
                  </span>
                  {outcome?.state === 'applying' && (
                    <Loader2 className={styles.spinSmall} aria-label="Applying" />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.secondary}
            disabled={applying}
            onClick={() => setStep('review')}
          >
            Back
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={applying}
            onClick={() => void applyDecisions(toApply)}
          >
            {applying ? 'Applying…' : 'Confirm and apply'}
          </button>
        </div>
      </>
    );
  };

  const renderResult = () => (
    <>
      <div className={styles.body}>
        <ul className={styles.confirmList}>
          {toApply.map((id) => {
            const outcome = outcomes[id];
            return (
              <li key={id}>
                <span>{titleOf(id)}</span>
                {outcome?.state === 'applied' && <span className={styles.ok}>Applied</span>}
                {outcome?.state === 'failed' && (
                  <span className={styles.error}>{outcome.error}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div className={styles.footer}>
        {failedIds.length > 0 && (
          <button
            type="button"
            className={styles.secondary}
            disabled={applying}
            onClick={() => void applyDecisions(failedIds)}
          >
            {applying ? 'Retrying…' : `Retry ${failedIds.length} failed`}
          </button>
        )}
        <button type="button" className={styles.primary} onClick={onClose}>
          Done
        </button>
      </div>
    </>
  );

  const titleText = managing ? 'Manage prompts' : 'Analyze with AI';

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) =>
        event.target === event.currentTarget && !applying && requestLeave('close', null)
      }
    >
      <div
        ref={dialogRef}
        className={`${styles.dialog} ${codeTaskId && step === 'review' ? styles.dialogWide : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-review-title"
        tabIndex={-1}
      >
        <header className={styles.header}>
          <h2 id="ai-review-title">{titleText}</h2>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Close"
            disabled={applying}
            onClick={(event) => requestLeave('close', event.currentTarget)}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        {step === 'setup' && renderSetup()}
        {step === 'running' && renderRunning()}
        {step === 'review' && renderReview()}
        {step === 'confirm' && renderConfirm()}
        {step === 'result' && renderResult()}
        {discardAction && (
          <div className={styles.discardOverlay}>
            <section
              className={styles.discardDialog}
              role="alertdialog"
              aria-labelledby="ai-review-discard-title"
              aria-describedby="ai-review-discard-description"
            >
              <h3 id="ai-review-discard-title">Discard AI review?</h3>
              <p id="ai-review-discard-description">
                Going back will discard the AI suggestions and any edits you&apos;ve made.
                You&apos;ll need to analyze again.
              </p>
              <div className={styles.discardActions}>
                <button
                  ref={keepReviewingRef}
                  type="button"
                  className={styles.primary}
                  onClick={cancelDiscard}
                >
                  Keep reviewing
                </button>
                <button type="button" className={styles.discard} onClick={confirmDiscard}>
                  Discard
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
