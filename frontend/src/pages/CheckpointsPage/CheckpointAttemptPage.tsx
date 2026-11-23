import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { TraineeCheckpointAttempt } from '@itp/types';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Send,
  Timer,
} from 'lucide-react';
import Header from '../../components/Header';
import LoaderOverlay from '../../components/Common/LoadingState';
import { ErrorState } from '../../components/Common/ErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import { formatIstDateTime } from '../../lib/formatDateTime';
import { getCheckpointAttempt, submitCheckpointAttempt } from '../../api/checkpoints';
import { ApiError } from '../../api/errors';
import AnswerEditor from './AnswerEditor';
import { isAnswerProvided } from './answerUtils';
import { useAttemptCountdown } from './useAttemptCountdown';
import { useCheckpointAutosave, type AnswerSaveSummary } from './useCheckpointAutosave';
import { checkpointWorkspaceId } from './practicalWorkspaceFiles';
import styles from './CheckpointAttemptPage.module.css';

function questionTypeLabel(type: string): string {
  switch (type) {
    case 'MULTIPLE_CHOICE':
      return 'Multiple choice';
    case 'LONG_TEXT':
      return 'Long answer';
    case 'CODE':
      return 'Code';
    case 'SQL':
      return 'SQL';
    case 'FILE':
      return 'File upload';
    case 'PRACTICAL':
      return 'Practical task';
    default:
      return 'Text';
  }
}

function formatSavedAt(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function SaveSummary({ summary, onRetry }: { summary: AnswerSaveSummary; onRetry: () => void }) {
  if (summary.errorCount > 0) {
    return (
      <span className={`${styles.saveState} ${styles.saveError}`} role="status">
        <AlertCircle size={14} />
        {summary.errorCount} answer{summary.errorCount === 1 ? '' : 's'} failed to save
        <button type="button" className={styles.retryButton} onClick={onRetry}>
          Retry
        </button>
      </span>
    );
  }
  if (summary.savingCount > 0) {
    return (
      <span className={`${styles.saveState} ${styles.saveSaving}`} role="status">
        <Loader2 size={14} className={styles.spin} />
        Saving…
      </span>
    );
  }
  if (summary.dirtyCount > 0) {
    return (
      <span className={`${styles.saveState} ${styles.saveDirty}`} role="status">
        <span className={styles.dirtyDot} />
        Unsaved changes
      </span>
    );
  }
  return (
    <span className={`${styles.saveState} ${styles.saveSaved}`} role="status">
      <CheckCircle2 size={14} />
      {summary.lastSavedAt ? `Saved at ${formatSavedAt(summary.lastSavedAt)}` : 'Autosave ready'}
    </span>
  );
}

function AttemptWorkspace({ attempt }: { attempt: TraineeCheckpointAttempt }) {
  const navigate = useNavigate();
  const summaryPath = `/checkpoints/attempts/${attempt.id}/summary`;

  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(true);

  const submitInFlightRef = useRef(false);

  const goToSummary = useCallback(() => {
    void navigate(summaryPath, { replace: true });
  }, [navigate, summaryPath]);

  const autosave = useCheckpointAutosave({
    attemptId: attempt.id,
    initialAnswers: attempt.answers,
    locked,
    onFinalized: goToSummary,
  });

  const flushAllRef = useRef(autosave.flushAll);
  useEffect(() => {
    flushAllRef.current = autosave.flushAll;
  }, [autosave.flushAll]);

  const performSubmit = useCallback(
    async (source: 'manual' | 'expired') => {
      if (submitInFlightRef.current) return;
      submitInFlightRef.current = true;
      setSubmitError(null);
      setSubmitting(true);

      try {
        if (source === 'manual') {
          const saved = await autosave.flushAll();
          if (!saved) {
            setSubmitError(
              'Some answers could not be saved. Retry the failed saves, then submit again.'
            );
            return;
          }
        }

        setLocked(true);
        await submitCheckpointAttempt(attempt.id);
        goToSummary();
      } catch (error) {
        const apiError = error instanceof ApiError ? error : null;
        if (
          apiError &&
          (apiError.code === 'CHECKPOINT_ATTEMPT_FINALIZED' ||
            apiError.code === 'CHECKPOINT_EXPIRED')
        ) {
          goToSummary();
          return;
        }
        setSubmitError(apiError?.message ?? 'Could not submit the attempt. Please try again.');
        if (source === 'manual') setLocked(false);
      } finally {
        submitInFlightRef.current = false;
        setSubmitting(false);
      }
    },
    [attempt.id, autosave, goToSummary]
  );

  const handleExpire = useCallback(() => {
    setLocked(true);
    void performSubmit('expired');
  }, [performSubmit]);

  const countdown = useAttemptCountdown({
    attemptId: attempt.id,
    deadlineAt: attempt.deadlineAt,
    serverNow: attempt.serverNow,
    remainingSeconds: attempt.remainingSeconds,
    enabled: !locked && !submitting,
    onExpire: handleExpire,
    onAlreadySubmitted: goToSummary,
  });

  // Warn before the browser closes or a link is followed. In-app navigation
  // would leave the attempt running, so the confirmation is intentionally
  // explicit. The backend still blocks every other trainee module.
  useEffect(() => {
    if (locked) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }

    function handleLinkClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      if (href.startsWith(`/checkpoints/attempts/${attempt.id}`)) return;

      const leave = window.confirm(
        'This checkpoint is still in progress. Leaving the page will not submit your attempt. Leave anyway?'
      );
      if (!leave) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      void flushAllRef.current();
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleLinkClick, true);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleLinkClick, true);
    };
  }, [attempt.id, locked]);

  const questions = attempt.questions;
  const currentQuestion = questions[currentIndex];

  const answeredCount = useMemo(
    () =>
      questions.filter((question) => isAnswerProvided(question, autosave.answers[question.id]))
        .length,
    [questions, autosave.answers]
  );

  const currentDraft = currentQuestion ? autosave.answers[currentQuestion.id] : undefined;
  const disabled = locked || submitting;

  function goToQuestion(index: number) {
    if (index < 0 || index >= questions.length) return;
    if (currentQuestion) void autosave.flushQuestion(currentQuestion.id);
    setCurrentIndex(index);
    setFileError(null);
  }

  const timerTone =
    countdown.remainingSeconds <= 60
      ? styles.timerDanger
      : countdown.remainingSeconds <= 300
        ? styles.timerWarning
        : '';

  const warningText =
    countdown.warning === 'one-minute'
      ? 'One minute remaining. Save your final changes now.'
      : countdown.warning === 'five-minutes'
        ? 'Five minutes remaining.'
        : null;

  return (
    <>
      <Header />

      <main className={styles.page}>
        <header className={styles.attemptHeader}>
          <div className={styles.titleBlock}>
            <p className={styles.eyebrow}>
              Checkpoint assessment · Attempt {attempt.attemptNumber}
            </p>
            <h1 className={styles.title}>{attempt.checkpointTitle}</h1>
            <p className={styles.deadline}>
              <Timer size={14} aria-hidden="true" /> Deadline{' '}
              {formatIstDateTime(attempt.deadlineAt)}
            </p>
          </div>

          <div className={styles.toolbar}>
            <div className={`${styles.timer} ${timerTone}`} aria-live="off">
              <Clock size={18} aria-hidden="true" />
              <div>
                <span className={styles.timerValue}>{countdown.label}</span>
                <span className={styles.timerLabel}>
                  {countdown.expired ? 'Time is up' : 'remaining'}
                </span>
              </div>
            </div>

            <div className={styles.saveArea}>
              <SaveSummary summary={autosave.summary} onRetry={autosave.retryAll} />
              <span className={styles.answeredSummary}>
                {answeredCount} of {questions.length} answered
              </span>
            </div>

            <button
              type="button"
              className={styles.submitButton}
              onClick={() => setConfirmOpen(true)}
              disabled={disabled || !attempt.allowEarlySubmission}
              title={
                !attempt.allowEarlySubmission
                  ? 'Early submission is disabled. Your attempt is submitted automatically when time expires.'
                  : undefined
              }
            >
              <Send size={15} />
              {submitting ? 'Submitting…' : 'Submit attempt'}
            </button>
          </div>
        </header>

        {warningText && !locked && (
          <div
            className={`${styles.warning} ${
              countdown.warning === 'one-minute' ? styles.warningUrgent : ''
            }`}
            role="alert"
          >
            <AlertTriangle size={16} aria-hidden="true" />
            {warningText}
          </div>
        )}

        {locked && (
          <div className={styles.lockedBanner} role="alert">
            <Clock size={16} aria-hidden="true" />
            {submitError
              ? 'Time is up. The attempt is locked; submission did not complete.'
              : 'Time is up. Your attempt is being submitted and can no longer be edited.'}
          </div>
        )}

        {!attempt.allowEarlySubmission && !locked && (
          <p className={styles.autoSubmitNote}>
            Early submission is disabled for this checkpoint. Answers save automatically and the
            attempt is submitted when the timer reaches zero.
          </p>
        )}

        {submitError && (
          <div className={styles.submitError} role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{submitError}</span>
            <button
              type="button"
              className={styles.retrySubmit}
              onClick={() => void performSubmit(countdown.expired ? 'expired' : 'manual')}
            >
              Retry submission
            </button>
          </div>
        )}

        <div className={styles.layout}>
          <aside className={styles.navigator} aria-label="Questions">
            <div className={styles.navigatorHeader}>
              <h2>Questions</h2>
              <span>
                {answeredCount}/{questions.length}
              </span>
            </div>
            <ol className={styles.questionList}>
              {questions.map((question, index) => {
                const draft = autosave.answers[question.id];
                const answered = isAnswerProvided(question, draft);
                const failed = draft?.status === 'error';
                const saving = draft?.status === 'saving';
                return (
                  <li key={question.id}>
                    <button
                      type="button"
                      className={`${styles.questionLink} ${
                        index === currentIndex ? styles.questionLinkActive : ''
                      } ${answered ? styles.questionLinkAnswered : ''}`}
                      onClick={() => goToQuestion(index)}
                      aria-current={index === currentIndex ? 'step' : undefined}
                    >
                      <span className={styles.questionNumber}>{index + 1}</span>
                      <span className={styles.questionLabel}>
                        <span className={styles.questionTitle}>{question.title}</span>
                        <span className={styles.questionMeta}>
                          {questionTypeLabel(question.type)} · {question.marks} marks
                        </span>
                      </span>
                      <span className={styles.questionIndicator} aria-hidden="true">
                        {failed ? (
                          <AlertCircle size={14} className={styles.indicatorError} />
                        ) : saving ? (
                          <Loader2 size={14} className={styles.spin} />
                        ) : answered ? (
                          <Check size={14} className={styles.indicatorAnswered} />
                        ) : (
                          <span className={styles.indicatorEmpty} />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className={styles.legend}>
              <span>
                <Check size={12} className={styles.indicatorAnswered} /> Answered
              </span>
              <span>
                <span className={styles.indicatorEmpty} /> Unanswered
              </span>
            </div>
          </aside>

          <section className={styles.questionPanel}>
            <details
              className={styles.instructions}
              open={instructionsOpen}
              onToggle={(event) => setInstructionsOpen(event.currentTarget.open)}
            >
              <summary>Instructions</summary>
              {attempt.instructionsMarkdown.trim() ? (
                <MarkdownRenderer markdown={attempt.instructionsMarkdown} />
              ) : (
                <p className={styles.muted}>No extra instructions were provided.</p>
              )}
            </details>

            {currentQuestion ? (
              <article className={styles.questionCard}>
                <header className={styles.questionHeader}>
                  <div>
                    <p className={styles.questionProgress}>
                      Question {currentIndex + 1} of {questions.length}
                    </p>
                    <h2>{currentQuestion.title}</h2>
                  </div>
                  <span className={styles.marksBadge}>{currentQuestion.marks} marks</span>
                </header>

                <div className={styles.prompt}>
                  <MarkdownRenderer markdown={currentQuestion.promptMarkdown} />
                </div>

                <div className={styles.answerArea}>
                  <p className={styles.answerType}>
                    {questionTypeLabel(currentQuestion.type)} answer
                    {currentQuestion.type === 'FILE' && ' · 2 MB limit'}
                  </p>
                  <AnswerEditor
                    question={currentQuestion}
                    draft={currentDraft}
                    disabled={disabled}
                    workspaceId={checkpointWorkspaceId(attempt.id, currentQuestion.orderIndex)}
                    onChangeText={(text) => {
                      setFileError(null);
                      autosave.updateText(currentQuestion.id, text);
                    }}
                    onSelectOption={(option) => autosave.selectOption(currentQuestion.id, option)}
                    onAttachFile={(file) => {
                      setFileError(null);
                      autosave.attachFile(currentQuestion.id, file);
                    }}
                    onRemoveFile={() => autosave.removeFile(currentQuestion.id)}
                    onChangeFiles={(files) => {
                      setFileError(null);
                      autosave.updateFiles(currentQuestion.id, files);
                    }}
                    onSaveFiles={() => {
                      void autosave.flushQuestion(currentQuestion.id);
                    }}
                    onFileError={setFileError}
                  />
                  {fileError && (
                    <p className={styles.fileError} role="alert">
                      {fileError}
                    </p>
                  )}
                </div>

                <footer className={styles.questionFooter}>
                  <span className={styles.questionSave}>
                    {currentDraft?.status === 'error' ? (
                      <>
                        <AlertCircle size={14} className={styles.indicatorError} /> Not saved
                        <button
                          type="button"
                          className={styles.retryButton}
                          onClick={() => autosave.retryQuestion(currentQuestion.id)}
                        >
                          Retry
                        </button>
                      </>
                    ) : currentDraft?.status === 'saving' ? (
                      <>
                        <Loader2 size={14} className={styles.spin} /> Saving…
                      </>
                    ) : currentDraft?.status === 'dirty' ? (
                      <>
                        <span className={styles.dirtyDot} /> Unsaved changes
                      </>
                    ) : currentDraft?.savedAt ? (
                      <>
                        <CheckCircle2 size={14} className={styles.indicatorAnswered} /> Saved
                      </>
                    ) : (
                      <span className={styles.muted}>Autosaves as you type</span>
                    )}
                  </span>

                  <div className={styles.questionNavButtons}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => goToQuestion(currentIndex - 1)}
                      disabled={currentIndex === 0}
                    >
                      <ChevronLeft size={15} /> Previous
                    </button>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => goToQuestion(currentIndex + 1)}
                      disabled={currentIndex >= questions.length - 1}
                    >
                      Next <ChevronRight size={15} />
                    </button>
                  </div>
                </footer>
              </article>
            ) : (
              <p className={styles.muted}>This attempt has no questions.</p>
            )}
          </section>
        </div>
      </main>

      <ConfirmDialog
        open={confirmOpen}
        title="Submit your attempt?"
        confirmLabel={submitting ? 'Submitting…' : 'Submit attempt'}
        cancelLabel="Keep working"
        tone="danger"
        isConfirming={submitting}
        error={submitError}
        onConfirm={() => {
          setConfirmOpen(false);
          void performSubmit('manual');
        }}
        onCancel={() => {
          if (submitting) return;
          setConfirmOpen(false);
        }}
      >
        <p>
          You have answered <strong>{answeredCount}</strong> of <strong>{questions.length}</strong>{' '}
          questions.
          {answeredCount < questions.length && (
            <>
              {' '}
              <strong>{questions.length - answeredCount}</strong> remain unanswered.
            </>
          )}
        </p>
        <p>Submitting ends the attempt immediately. You will not be able to change your answers.</p>
      </ConfirmDialog>
    </>
  );
}

export default function CheckpointAttemptPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState<TraineeCheckpointAttempt | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    getCheckpointAttempt(attemptId)
      .then((loaded) => {
        if (cancelled) return;
        setError(null);
        if (loaded.status === 'SUBMITTED') {
          void navigate(`/checkpoints/attempts/${loaded.id}/summary`, { replace: true });
          return;
        }
        setAttempt(loaded);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught : new Error('Could not load the attempt.'));
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId, navigate, reloadKey]);

  if (error) {
    return (
      <>
        <Header />
        <main className={styles.page}>
          <ErrorState
            fullPage
            title="Unable to open this attempt"
            message={error.message}
            onRetry={() => setReloadKey((value) => value + 1)}
          />
        </main>
      </>
    );
  }

  if (!attempt) {
    return (
      <>
        <Header />
        <main className={styles.page}>
          <LoaderOverlay label="Opening your checkpoint…" />
        </main>
      </>
    );
  }

  return <AttemptWorkspace attempt={attempt} />;
}
