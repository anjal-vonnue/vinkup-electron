import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { TraineeCheckpointAttempt } from '@itp/types';
import {
  AlertCircle,
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
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/Useauth';
import { formatIstDateTime } from '../../lib/formatDateTime';
import { getCheckpointAttempt, submitCheckpointAttempt } from '../../api/checkpoints';
import { ApiError } from '../../api/errors';
import AnswerEditor from './AnswerEditor';
import { isAnswerProvided } from './answerUtils';
import { useAttemptCountdown } from './useAttemptCountdown';
import { useCheckpointAutosave, type AnswerSaveSummary } from './useCheckpointAutosave';
import { useCheckpointDisplayLock } from './useCheckpointDisplayLock';
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
  const toast = useToast();
  const { user } = useAuth();
  const summaryPath = `/checkpoints/attempts/${attempt.id}/summary`;

  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);

  const submitInFlightRef = useRef(false);

  // The second screen shows a good-luck message for the whole attempt so
  // references and resources cannot be used while the checkpoint is running.
  useCheckpointDisplayLock(user?.name);

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

  // Time-left reminders surface as toasts so they don't push the workspace down.
  const warningsShownRef = useRef({ five: false, one: false });
  useEffect(() => {
    if (countdown.warning === 'five-minutes' && !warningsShownRef.current.five) {
      warningsShownRef.current.five = true;
      toast.show({
        message: 'Five minutes remaining. Start wrapping up.',
        variant: 'warning',
        durationMs: 6000,
      });
    } else if (countdown.warning === 'one-minute' && !warningsShownRef.current.one) {
      warningsShownRef.current.one = true;
      toast.show({
        message: 'One minute remaining. Save your final changes now.',
        variant: 'warning',
        durationMs: 8000,
      });
    }
  }, [countdown.warning, toast]);

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
      // Links the header disables during the attempt never navigate, so they
      // must not raise the leave confirmation either.
      if (anchor.getAttribute('aria-disabled') === 'true') return;
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
  const isSinglePractical = questions.length === 1 && currentQuestion?.type === 'PRACTICAL';
  const isPracticalQuestion = currentQuestion?.type === 'PRACTICAL';

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

  const attemptControls: ReactNode = (
    <>
      <div className={`${styles.inlineTimer} ${timerTone}`} aria-live="off">
        <Clock size={16} aria-hidden="true" />
        <span className={styles.timerValue}>{countdown.label}</span>
        <span className={styles.timerLabel}>{countdown.expired ? 'Time is up' : 'remaining'}</span>
      </div>

      <div className={styles.inlineSave}>
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
    </>
  );

  const practicalToolbarTrailing: ReactNode = isSinglePractical ? attemptControls : null;

  return (
    <div className={`${styles.attemptPage} ${isPracticalQuestion ? styles.attemptPageFill : ''}`}>
      <Header
        leading={
          <div className={styles.headerLeading}>
            <h1 className={styles.headerTitle}>{attempt.checkpointTitle}</h1>
            <p className={styles.headerMeta}>
              <Timer size={13} aria-hidden="true" />
              Deadline {formatIstDateTime(attempt.deadlineAt)}
            </p>
          </div>
        }
      />

      <main className={isPracticalQuestion ? styles.pagePractical : styles.page}>
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

        {!isSinglePractical && (
          <div
            className={`${styles.attemptBar} ${isPracticalQuestion ? styles.attemptBarFill : ''}`}
          >
            <div className={styles.questionNav}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => goToQuestion(currentIndex - 1)}
                disabled={currentIndex === 0}
              >
                <ChevronLeft size={15} /> Previous
              </button>
              <div className={styles.questionNavLabel}>
                <span className={styles.questionPosition}>
                  Question {questions.length > 0 ? currentIndex + 1 : 0} of {questions.length}
                </span>
                {currentQuestion && (
                  <span className={styles.questionNavTitle}>{currentQuestion.title}</span>
                )}
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => goToQuestion(currentIndex + 1)}
                disabled={currentIndex >= questions.length - 1}
              >
                Next <ChevronRight size={15} />
              </button>
            </div>

            <div className={styles.attemptBarActions}>{attemptControls}</div>
          </div>
        )}

        {isPracticalQuestion ? (
          <div className={styles.practicalContainer}>
            {!isSinglePractical && currentQuestion && (
              <div className={styles.practicalPrompt}>
                <p className={styles.practicalPromptMeta}>
                  {questionTypeLabel(currentQuestion.type)} · {currentQuestion.marks} marks
                </p>
              </div>
            )}
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
              toolbarTrailing={practicalToolbarTrailing}
            />
            {fileError && (
              <p className={styles.fileError} role="alert">
                {fileError}
              </p>
            )}
          </div>
        ) : (
          <div className={styles.questionContent}>
            <details key={currentQuestion?.id ?? currentIndex} className={styles.instructions} open>
              <summary>Instructions</summary>
              {currentQuestion?.promptMarkdown.trim() ? (
                <MarkdownRenderer markdown={currentQuestion.promptMarkdown} />
              ) : (
                <p className={styles.muted}>No instructions were provided for this question.</p>
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
              </article>
            ) : (
              <p className={styles.muted}>This attempt has no questions.</p>
            )}
          </div>
        )}
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
    </div>
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
