import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { TraineeCheckpointDetail } from '@itp/types';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Info,
  Play,
  Timer,
} from 'lucide-react';
import Header from '../../components/Header';
import LoaderOverlay from '../../components/Common/LoadingState';
import { ErrorState } from '../../components/Common/ErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import { formatIstDateTime } from '../../lib/formatDateTime';
import { getMyCheckpoint, startCheckpoint } from '../../api/checkpoints';
import { ApiError } from '../../api/errors';
import { availabilityMeta, formatDuration, submissionReasonLabel } from './checkpointUi';
import { useCheckpointRefreshAt } from './useCheckpointRefreshAt';
import styles from './Checkpoints.module.css';

/** Mirrors the backend: late entry closes 10 minutes after the scheduled start. */
const LATE_ENTRY_GRACE_MS = 10 * 60 * 1000;

export default function CheckpointDetailPage() {
  const { checkpointId } = useParams<{ checkpointId: string }>();
  const navigate = useNavigate();

  const [checkpoint, setCheckpoint] = useState<TraineeCheckpointDetail | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  // Re-fetch when this checkpoint opens, and again when its entry window closes,
  // so the button and badge change without the trainee leaving the page.
  const refreshAt = useMemo(() => {
    if (!checkpoint) return null;
    const start = new Date(checkpoint.startAt).getTime();
    if (Number.isNaN(start)) return null;
    if (checkpoint.availability === 'UPCOMING') return start;
    if (checkpoint.availability === 'AVAILABLE') {
      const windowEnd = start + checkpoint.durationMinutes * 60_000;
      const lateEntryEnd = start + LATE_ENTRY_GRACE_MS;
      return checkpoint.allowLateEntry ? windowEnd : Math.min(windowEnd, lateEntryEnd);
    }
    return null;
  }, [checkpoint]);

  useCheckpointRefreshAt(refreshAt, checkpoint?.serverNow, reload);

  useEffect(() => {
    if (!checkpointId) return;
    let cancelled = false;
    getMyCheckpoint(checkpointId)
      .then((loaded) => {
        if (cancelled) return;
        setError(null);
        if (loaded.availability === 'IN_PROGRESS' && loaded.attempt) {
          void navigate(`/checkpoints/attempts/${loaded.attempt.id}`, { replace: true });
          return;
        }
        setCheckpoint(loaded);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught : new Error('Could not load this checkpoint.'));
      });
    return () => {
      cancelled = true;
    };
  }, [checkpointId, navigate, reloadKey]);

  async function handleStart() {
    if (!checkpoint) return;
    setStarting(true);
    setStartError(null);
    try {
      const attempt = await startCheckpoint(checkpoint.id);
      void navigate(`/checkpoints/attempts/${attempt.id}`, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'CHECKPOINT_ACTIVE') {
        const details = caught.details as { attemptId?: string } | undefined;
        if (details?.attemptId) {
          void navigate(`/checkpoints/attempts/${details.attemptId}`, { replace: true });
          return;
        }
      }
      setStartError(caught instanceof Error ? caught.message : 'Could not start this checkpoint.');
      setStarting(false);
    }
  }

  if (error) {
    return (
      <>
        <Header />
        <main className={styles.page}>
          <ErrorState
            fullPage
            title="Unable to open checkpoint"
            message={error.message}
            onRetry={reload}
          />
        </main>
      </>
    );
  }

  if (!checkpoint) {
    return (
      <>
        <Header />
        <main className={styles.page}>
          <LoaderOverlay label="Loading checkpoint…" />
        </main>
      </>
    );
  }

  const meta = availabilityMeta(checkpoint.availability);
  const attempt = checkpoint.attempt;
  const openAttempt = attempt?.status === 'IN_PROGRESS' ? attempt : null;
  const canStartNewAttempt = checkpoint.canStart && !openAttempt;
  const remainingAttempts = Math.max(0, checkpoint.maxAttempts - checkpoint.attemptsUsed);
  const nextAttemptNumber = checkpoint.attemptsUsed + 1;
  const deadline = new Date(
    new Date(checkpoint.startAt).getTime() + checkpoint.durationMinutes * 60_000
  );

  return (
    <>
      <Header locked={checkpoint.attemptsUsed > 0 && canStartNewAttempt} />
      <main className={styles.page}>
        <Link to="/checkpoints" className={styles.backLink}>
          <ArrowLeft size={14} /> All checkpoints
        </Link>

        <header className={styles.detailHeader}>
          <div>
            <span className={`${styles.badge} ${styles[`tone${meta.tone}`]}`}>{meta.label}</span>
            <h1 className={styles.title}>{checkpoint.title}</h1>
            {checkpoint.description && <p className={styles.subtitle}>{checkpoint.description}</p>}
          </div>
        </header>

        <div className={styles.detailLayout}>
          <section className={styles.detailMain}>
            {/* The checkpoint instructions stay hidden until the checkpoint opens. */}
            {checkpoint.availability !== 'UPCOMING' && (
              <div className={styles.panel}>
                <h2 className={styles.panelTitle}>Instructions</h2>
                <div className={styles.instructionBody}>
                  {checkpoint.instructionsMarkdown.trim() ? (
                    <MarkdownRenderer markdown={checkpoint.instructionsMarkdown} />
                  ) : (
                    <p className={styles.muted}>No additional instructions were provided.</p>
                  )}
                </div>
              </div>
            )}

            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Assessment details</h2>
              <dl className={styles.metaGrid}>
                <div>
                  <dt>Starts</dt>
                  <dd>{formatIstDateTime(checkpoint.startAt)}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{formatDuration(checkpoint.durationMinutes)}</dd>
                </div>
                <div>
                  <dt>Entry window closes</dt>
                  <dd>{formatIstDateTime(deadline.toISOString())}</dd>
                </div>
                <div>
                  <dt>Total marks</dt>
                  <dd>{checkpoint.totalMarks}</dd>
                </div>
                <div>
                  <dt>Passing marks</dt>
                  <dd>{checkpoint.passingMarks}</dd>
                </div>
                <div>
                  <dt>Attempts</dt>
                  <dd>
                    {checkpoint.attemptsUsed} of {checkpoint.maxAttempts} used
                  </dd>
                </div>
              </dl>
            </div>

            {attempt && (
              <div className={styles.panel}>
                <h2 className={styles.panelTitle}>Your latest attempt</h2>
                <div className={styles.attemptRow}>
                  <div className={styles.attemptInfo}>
                    <strong>Attempt {attempt.attemptNumber}</strong>
                    <span>
                      {attempt.status === 'SUBMITTED'
                        ? `${submissionReasonLabel(attempt.submissionReason)} · ${
                            attempt.submittedAt
                              ? formatIstDateTime(attempt.submittedAt)
                              : 'submitted'
                          }`
                        : 'In progress'}
                    </span>
                  </div>
                  {attempt.status === 'IN_PROGRESS' ? (
                    <Link
                      to={`/checkpoints/attempts/${attempt.id}`}
                      className={styles.primaryButton}
                    >
                      Resume <ArrowRight size={14} />
                    </Link>
                  ) : attempt.resultVisible ? (
                    <Link
                      to={`/checkpoints/attempts/${attempt.id}/summary`}
                      className={styles.secondaryButton}
                    >
                      View result <ArrowRight size={14} />
                    </Link>
                  ) : (
                    <Link
                      to={`/checkpoints/attempts/${attempt.id}/summary`}
                      className={styles.secondaryButton}
                    >
                      View submission <ArrowRight size={14} />
                    </Link>
                  )}
                </div>
              </div>
            )}
          </section>

          <aside className={styles.detailSide}>
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Before you start</h2>
              <ul className={styles.rules}>
                <li>
                  <Timer size={15} aria-hidden="true" />
                  The timer starts as soon as you press start and keeps running if you close the
                  page.
                </li>
                <li>
                  <Clock3 size={15} aria-hidden="true" />
                  Your deadline is {formatDuration(checkpoint.durationMinutes)} after you start.
                </li>
                <li>
                  <ClipboardCheck size={15} aria-hidden="true" />
                  {remainingAttempts === 1
                    ? 'This is your last available attempt.'
                    : `${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.`}
                </li>
                <li>
                  <Info size={15} aria-hidden="true" />
                  {checkpoint.allowEarlySubmission
                    ? 'You may submit before the deadline once you are finished.'
                    : 'Early submission is disabled; the attempt submits automatically at the deadline.'}
                </li>
                <li>
                  <CalendarClock size={15} aria-hidden="true" />
                  {checkpoint.allowLateEntry
                    ? 'Late entry is allowed while the entry window is open.'
                    : 'Late entry closes 10 minutes after the scheduled start.'}
                </li>
                <li>
                  <CheckCircle2 size={15} aria-hidden="true" />
                  Results are{' '}
                  {checkpoint.resultVisibility === 'IMMEDIATE'
                    ? 'visible as soon as grading is complete.'
                    : 'published after your manager reviews the submissions.'}
                </li>
              </ul>
            </div>

            <div
              className={`${styles.notice} ${
                canStartNewAttempt
                  ? styles.noticeSuccess
                  : checkpoint.availability === 'MISSED' || checkpoint.availability === 'CANCELLED'
                    ? styles.noticeDanger
                    : styles.noticeInfo
              }`}
            >
              {checkpoint.availability === 'MISSED' || checkpoint.availability === 'CANCELLED' ? (
                <AlertTriangle size={16} aria-hidden="true" />
              ) : (
                <Info size={16} aria-hidden="true" />
              )}
              <div>
                <strong>
                  {canStartNewAttempt && checkpoint.attemptsUsed > 0
                    ? 'Another attempt is available'
                    : meta.label}
                </strong>
                <p>
                  {canStartNewAttempt
                    ? checkpoint.attemptsUsed > 0
                      ? `You have ${remainingAttempts} attempt${
                          remainingAttempts === 1 ? '' : 's'
                        } left. Start attempt ${nextAttemptNumber} before the entry window closes.`
                      : `You have ${remainingAttempts} attempt${
                          remainingAttempts === 1 ? '' : 's'
                        } available.`
                    : (checkpoint.blockedReason ?? meta.hint)}
                </p>
              </div>
            </div>

            {openAttempt ? (
              <Link to={`/checkpoints/attempts/${openAttempt.id}`} className={styles.startButton}>
                <Play size={16} /> Resume attempt
              </Link>
            ) : canStartNewAttempt ? (
              <button
                type="button"
                className={styles.startButton}
                onClick={() => setConfirmOpen(true)}
                disabled={starting}
              >
                <Play size={16} />
                {starting
                  ? 'Starting…'
                  : checkpoint.attemptsUsed > 0
                    ? `Start attempt ${nextAttemptNumber}`
                    : 'Start checkpoint'}
              </button>
            ) : checkpoint.availability === 'RESULTS_AVAILABLE' && attempt ? (
              <Link
                to={`/checkpoints/attempts/${attempt.id}/summary`}
                className={styles.startButton}
              >
                <ArrowRight size={16} /> View result
              </Link>
            ) : (
              <button type="button" className={styles.startButton} disabled>
                {checkpoint.availability === 'UPCOMING'
                  ? 'Opens at the scheduled time'
                  : checkpoint.availability === 'MISSED'
                    ? 'Entry window closed'
                    : checkpoint.availability === 'CANCELLED'
                      ? 'Checkpoint cancelled'
                      : 'Not available'}
              </button>
            )}
          </aside>
        </div>
      </main>

      <ConfirmDialog
        open={confirmOpen}
        title={
          checkpoint.attemptsUsed > 0
            ? `Start attempt ${nextAttemptNumber}?`
            : 'Start the checkpoint now?'
        }
        confirmLabel={
          starting
            ? 'Starting…'
            : checkpoint.attemptsUsed > 0
              ? `Start attempt ${nextAttemptNumber}`
              : 'Start attempt'
        }
        cancelLabel="Not yet"
        isConfirming={starting}
        error={startError}
        onConfirm={() => void handleStart()}
        onCancel={() => {
          if (starting) return;
          setConfirmOpen(false);
          setStartError(null);
        }}
      >
        <p>
          You are about to start <strong>{checkpoint.title}</strong>
          {checkpoint.attemptsUsed > 0 &&
            ` (attempt ${nextAttemptNumber} of ${checkpoint.maxAttempts})`}
          . The timer begins immediately and will run for{' '}
          <strong>{formatDuration(checkpoint.durationMinutes)}</strong>.
        </p>
        <p>You cannot pause the timer. Make sure you have a stable connection before starting.</p>
      </ConfirmDialog>
    </>
  );
}
