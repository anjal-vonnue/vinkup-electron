import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type {
  CheckpointResult,
  TraineeCheckpointAttempt,
  TraineeCheckpointDetail,
} from '@itp/types';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Info,
  RefreshCw,
  Trophy,
  XCircle,
} from 'lucide-react';
import Header from '../../components/Header';
import LoaderOverlay from '../../components/Common/LoadingState';
import { ErrorState } from '../../components/Common/ErrorState';
import { formatIstDateTime } from '../../lib/formatDateTime';
import { getCheckpointAttempt, getCheckpointResult, getMyCheckpoint } from '../../api/checkpoints';
import { ApiError } from '../../api/errors';
import { checkpointQuestionTypeLabel, submissionReasonLabel } from './checkpointUi';
import WorkspaceFilesViewer from './WorkspaceFilesViewer';
import { useCheckpointRefreshAt } from './useCheckpointRefreshAt';
import styles from './Checkpoints.module.css';

export default function CheckpointSummaryPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState<TraineeCheckpointAttempt | null>(null);
  const [checkpointDetail, setCheckpointDetail] = useState<TraineeCheckpointDetail | null>(null);
  const [result, setResult] = useState<CheckpointResult | null>(null);
  const [resultPending, setResultPending] = useState(false);
  const [resultLoading, setResultLoading] = useState(true);
  const [resultError, setResultError] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;

    getCheckpointAttempt(attemptId)
      .then((loaded) => {
        if (cancelled) return;
        setError(null);
        if (loaded.status === 'IN_PROGRESS') {
          void navigate(`/checkpoints/attempts/${loaded.id}`, { replace: true });
          return;
        }
        setAttempt(loaded);

        return getCheckpointResult(attemptId)
          .then((loadedResult) => {
            if (!cancelled) setResult(loadedResult);
          })
          .catch((caught: unknown) => {
            if (cancelled) return;
            if (
              caught instanceof ApiError &&
              (caught.code === 'CHECKPOINT_RESULTS_NOT_READY' ||
                caught.code === 'FORBIDDEN' ||
                caught.status === 403)
            ) {
              setResultPending(true);
              return;
            }
            setResultError(caught instanceof Error ? caught.message : 'Could not load the result.');
          })
          .finally(() => {
            if (!cancelled) setResultLoading(false);
          });
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught : new Error('Could not load this submission.'));
      });

    return () => {
      cancelled = true;
    };
  }, [attemptId, navigate, reloadKey]);

  // A multi-attempt checkpoint stays open after submitting, so the summary needs
  // the checkpoint state to offer the next attempt and keep the header locked.
  useEffect(() => {
    const checkpointId = attempt?.checkpointId;
    if (!checkpointId) return;

    let cancelled = false;
    getMyCheckpoint(checkpointId)
      .then((detail) => {
        if (!cancelled) setCheckpointDetail(detail);
      })
      .catch(() => {
        // The submission is still readable even if the checkpoint cannot refresh.
      });

    return () => {
      cancelled = true;
    };
  }, [attempt?.checkpointId, reloadKey]);

  // After a submission the checkpoint can still accept another attempt while
  // its entry window is open. Keep the app locked to the checkpoint until then.
  const canStartAnother = checkpointDetail?.canStart === true && checkpointDetail.attemptsUsed > 0;
  const entryWindowClosesAt =
    checkpointDetail && canStartAnother
      ? new Date(checkpointDetail.startAt).getTime() + checkpointDetail.durationMinutes * 60_000
      : null;

  // Re-fetch at the entry-window boundary so the header unlocks and the next
  // attempt disappears exactly when the window closes.
  useCheckpointRefreshAt(entryWindowClosesAt, checkpointDetail?.serverNow, reload);

  if (error) {
    return (
      <>
        <Header />
        <main className={styles.page}>
          <ErrorState
            fullPage
            title="Unable to load submission"
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
          <LoaderOverlay label="Loading your submission…" />
        </main>
      </>
    );
  }

  const passed = result?.passed === true;
  const canShowResult = Boolean(result?.visible);
  const nextAttemptNumber = (checkpointDetail?.attemptsUsed ?? attempt.attemptNumber) + 1;

  return (
    <>
      <Header locked={canStartAnother} />
      <main className={styles.page}>
        <Link to="/checkpoints" className={styles.backLink}>
          <ArrowLeft size={14} /> All checkpoints
        </Link>

        <header className={styles.summaryHero}>
          <div className={styles.summaryIcon} aria-hidden="true">
            <CheckCircle2 size={26} />
          </div>
          <div className={styles.summaryHeading}>
            <span className={styles.summaryEyebrow}>Attempt {attempt.attemptNumber} submitted</span>
            <h1 className={styles.title}>{attempt.checkpointTitle}</h1>
            <p className={styles.subtitle}>
              {submissionReasonLabel(attempt.submissionReason)}
              {attempt.submittedAt && ` · ${formatIstDateTime(attempt.submittedAt)}`}
            </p>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              setResultLoading(true);
              setResultPending(false);
              setResultError(null);
              setReloadKey((value) => value + 1);
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </header>

        <section className={styles.summaryMeta}>
          <div>
            <dt>
              <Clock3 size={13} /> Started
            </dt>
            <dd>{formatIstDateTime(attempt.startedAt)}</dd>
          </div>
          <div>
            <dt>Deadline</dt>
            <dd>{formatIstDateTime(attempt.deadlineAt)}</dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>{attempt.submittedAt ? formatIstDateTime(attempt.submittedAt) : '—'}</dd>
          </div>
          <div>
            <dt>Reason</dt>
            <dd>{submissionReasonLabel(attempt.submissionReason)}</dd>
          </div>
        </section>

        {resultLoading ? (
          <section className={styles.pendingPanel}>
            <div className={styles.pendingIcon} aria-hidden="true">
              <Info size={22} />
            </div>
            <div>
              <h2>Loading your result…</h2>
              <p>Checking whether your manager has finished grading this attempt.</p>
            </div>
          </section>
        ) : canShowResult && result ? (
          <>
            <section
              className={`${styles.resultBanner} ${
                passed ? styles.resultPassed : styles.resultFailed
              }`}
            >
              <div className={styles.scoreCircle}>
                <span className={styles.scoreValue}>{result.score ?? 0}</span>
                <span className={styles.scoreMax}>/ {result.totalMarks}</span>
              </div>
              <div className={styles.resultText}>
                <h2>
                  {passed ? (
                    <>
                      <Trophy size={20} aria-hidden="true" /> Passed
                    </>
                  ) : (
                    <>
                      <XCircle size={20} aria-hidden="true" /> Not passed
                    </>
                  )}
                </h2>
                <p>
                  {result.percentage ?? 0}% · {result.totalMarks} total marks ·{' '}
                  {result.passingMarks} to pass
                </p>
                <p className={styles.muted}>
                  {result.gradedAt
                    ? `Graded ${formatIstDateTime(result.gradedAt)}`
                    : 'Grading complete'}
                  {result.resultPublishedAt &&
                    ` · Results published ${formatIstDateTime(result.resultPublishedAt)}`}
                </p>
              </div>
            </section>

            {result.feedback && (
              <div className={styles.panel}>
                <h2 className={styles.panelTitle}>Manager feedback</h2>
                <p className={styles.feedbackText}>{result.feedback}</p>
              </div>
            )}

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Question breakdown</h2>
                <span className={styles.count}>{result.answers.length}</span>
              </div>

              <div className={styles.reviewList}>
                {result.answers.map((answer, index) => (
                  <article key={answer.questionId} className={styles.reviewCard}>
                    <header className={styles.reviewHeader}>
                      <div>
                        <span className={styles.reviewNumber}>Question {index + 1}</span>
                        <h3>{answer.questionTitle}</h3>
                        <span className={styles.reviewType}>
                          {checkpointQuestionTypeLabel(answer.questionType)}
                        </span>
                      </div>
                      <span
                        className={`${styles.reviewMarks} ${
                          answer.awardedMarks === null
                            ? styles.reviewMarksPending
                            : answer.awardedMarks >= answer.marks
                              ? styles.reviewMarksFull
                              : ''
                        }`}
                      >
                        {answer.awardedMarks === null ? 'Not graded' : answer.awardedMarks} /{' '}
                        {answer.marks}
                      </span>
                    </header>

                    <div className={styles.reviewAnswer}>
                      <span className={styles.reviewAnswerLabel}>Your answer</span>
                      {answer.files && answer.files.length > 0 ? (
                        <WorkspaceFilesViewer files={answer.files} />
                      ) : answer.fileName ? (
                        <p className={styles.fileAnswer}>
                          <FileText size={15} aria-hidden="true" /> {answer.fileName}
                        </p>
                      ) : answer.selectedOption ? (
                        <p className={styles.answerText}>{answer.selectedOption}</p>
                      ) : answer.answerText ? (
                        <pre className={styles.answerPre}>{answer.answerText}</pre>
                      ) : (
                        <p className={styles.unanswered}>No answer submitted.</p>
                      )}
                    </div>

                    {answer.feedback && (
                      <div className={styles.reviewFeedback}>
                        <span>Feedback</span>
                        <p>{answer.feedback}</p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className={styles.pendingPanel}>
            <div className={styles.pendingIcon} aria-hidden="true">
              <Info size={22} />
            </div>
            <div>
              <h2>Your answers are safely submitted</h2>
              <p>
                {resultError
                  ? resultError
                  : resultPending
                    ? 'Your manager is still grading this attempt, or the results have not been published yet.'
                    : 'The score will appear here once grading is complete.'}
              </p>
              <p className={styles.muted}>
                {canStartAnother
                  ? `You have another attempt available. Start attempt ${nextAttemptNumber} before the checkpoint window closes.`
                  : 'You can leave this page. Return to checkpoints later to see the result.'}
              </p>
            </div>
          </section>
        )}

        <div className={styles.summaryActions}>
          {canStartAnother && (
            <Link to={`/checkpoints/${attempt.checkpointId}`} className={styles.primaryButton}>
              Start attempt {nextAttemptNumber} <ArrowRight size={14} />
            </Link>
          )}
          <Link
            to="/checkpoints"
            className={canStartAnother ? styles.secondaryButton : styles.primaryButton}
          >
            <ArrowLeft size={14} /> Back to checkpoints
          </Link>
        </div>
      </main>
    </>
  );
}
