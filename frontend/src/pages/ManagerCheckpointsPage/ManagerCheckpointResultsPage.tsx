import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import type {
  ManagerCheckpointAttemptDetail,
  ManagerCheckpointAttemptSummary,
  ManagerCheckpointDetail,
} from '@itp/types';
import { ArrowLeft, CheckCircle2, Download, FileText, Send, X, XCircle } from 'lucide-react';
import AdminHeader from '../../components/AdminHeader';
import LoaderOverlay from '../../components/Common/LoadingState';
import { ErrorState } from '../../components/Common/ErrorState';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import { useToast } from '../../components/Toast';
import { MANAGER_NAV } from '../../constants/managerNav';
import { formatIstDateTime } from '../../lib/formatDateTime';
import {
  downloadCheckpointAnswerFile,
  getManagerCheckpoint,
  getManagerCheckpointAttempt,
  getManagerCheckpointAttempts,
  gradeManagerCheckpointAttempt,
  publishManagerCheckpointResults,
} from '../../api/checkpoints';
import styles from './ManagerCheckpointResultsPage.module.css';

function reasonLabel(reason: string | null): string {
  if (reason === 'TIME_EXPIRED') return 'Time expired';
  if (reason === 'MANUAL') return 'Manual submission';
  if (reason === 'CANCELLED') return 'Checkpoint cancelled';
  return '—';
}

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
    default:
      return 'Text';
  }
}

export default function ManagerCheckpointResultsPage() {
  const { checkpointId } = useParams<{ checkpointId: string }>();
  const toast = useToast();

  const [checkpoint, setCheckpoint] = useState<ManagerCheckpointDetail | null>(null);
  const [attempts, setAttempts] = useState<ManagerCheckpointAttemptSummary[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [attemptDetail, setAttemptDetail] = useState<ManagerCheckpointAttemptDetail | null>(null);
  const [attemptLoading, setAttemptLoading] = useState(false);
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');
  const [grading, setGrading] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    if (!checkpointId) return;
    let cancelled = false;
    Promise.all([getManagerCheckpoint(checkpointId), getManagerCheckpointAttempts(checkpointId)])
      .then(([detail, rows]) => {
        if (cancelled) return;
        setCheckpoint(detail);
        setAttempts(rows);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught : new Error('Could not load results.'));
      });
    return () => {
      cancelled = true;
    };
  }, [checkpointId, reloadKey]);

  function openAttempt(attemptId: string) {
    setAttemptDetail(null);
    setAttemptError(null);
    setAttemptLoading(true);
    setSelectedAttemptId(attemptId);
  }

  function closeAttempt() {
    setSelectedAttemptId(null);
    setAttemptDetail(null);
    setAttemptError(null);
  }

  useEffect(() => {
    if (!selectedAttemptId) return;
    let cancelled = false;
    getManagerCheckpointAttempt(selectedAttemptId)
      .then((detail) => {
        if (cancelled) return;
        setAttemptDetail(detail);
        const initialMarks: Record<string, string> = {};
        for (const answer of detail.answers) {
          initialMarks[answer.questionId] =
            answer.awardedMarks === null ? '' : String(answer.awardedMarks);
        }
        setMarks(initialMarks);
        setFeedback(detail.feedback ?? '');
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setAttemptError(
          caught instanceof Error ? caught.message : 'Could not load the submission.'
        );
      })
      .finally(() => {
        if (!cancelled) setAttemptLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAttemptId]);

  const stats = useMemo(() => {
    const list = attempts ?? [];
    const submitted = list.filter((attempt) => attempt.status === 'SUBMITTED');
    const graded = submitted.filter((attempt) => attempt.gradedAt !== null);
    const passed = graded.filter((attempt) => attempt.passed === true);
    return { submitted: submitted.length, graded: graded.length, passed: passed.length };
  }, [attempts]);

  async function handlePublishResults() {
    if (!checkpointId) return;
    setPublishing(true);
    try {
      const updated = await publishManagerCheckpointResults(checkpointId);
      setCheckpoint(updated);
      toast.show({ message: 'Results are now visible to trainees.', variant: 'success' });
    } catch (caught) {
      toast.show({
        message: caught instanceof Error ? caught.message : 'Could not publish results.',
        variant: 'error',
      });
    } finally {
      setPublishing(false);
    }
  }

  async function handleGrade() {
    if (!attemptDetail) return;
    const payload = attemptDetail.questions.map((question) => {
      const raw = marks[question.id] ?? '';
      return {
        questionId: question.id,
        awardedMarks: raw.trim() === '' ? 0 : Number(raw),
      };
    });

    const invalid = attemptDetail.questions.find((question) => {
      const value = payload.find((entry) => entry.questionId === question.id)?.awardedMarks ?? 0;
      return Number.isNaN(value) || value < 0 || value > question.marks;
    });
    if (invalid) {
      setAttemptError(`Marks for "${invalid.title}" must be between 0 and ${invalid.marks}.`);
      return;
    }

    setGrading(true);
    setAttemptError(null);
    try {
      const updated = await gradeManagerCheckpointAttempt(attemptDetail.id, {
        marks: payload,
        feedback: feedback.trim() || null,
      });
      setAttemptDetail(updated);
      toast.show({ message: 'Marks and feedback saved.', variant: 'success' });
      reload();
    } catch (caught) {
      setAttemptError(caught instanceof Error ? caught.message : 'Could not save the grading.');
    } finally {
      setGrading(false);
    }
  }

  async function handleDownload(questionId: string) {
    if (!attemptDetail) return;
    try {
      const { blob, fileName } = await downloadCheckpointAnswerFile(attemptDetail.id, questionId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      toast.show({
        message: caught instanceof Error ? caught.message : 'Could not download the file.',
        variant: 'error',
      });
    }
  }

  if (error) {
    return (
      <>
        <AdminHeader
          homePath="/manager"
          badge="Manager view"
          navItems={MANAGER_NAV}
          navLabel="Manager navigation"
        />
        <main className={styles.page}>
          <ErrorState
            fullPage
            title="Unable to load results"
            message={error.message}
            onRetry={reload}
          />
        </main>
      </>
    );
  }

  if (!checkpoint || !attempts) {
    return (
      <>
        <AdminHeader
          homePath="/manager"
          badge="Manager view"
          navItems={MANAGER_NAV}
          navLabel="Manager navigation"
        />
        <main className={styles.page}>
          <LoaderOverlay label="Loading submissions…" />
        </main>
      </>
    );
  }

  return (
    <>
      <AdminHeader
        homePath="/manager"
        badge="Manager view"
        navItems={MANAGER_NAV}
        navLabel="Manager navigation"
      />

      <main className={styles.page}>
        <Link to="/manager/checkpoints" className={styles.backLink}>
          <ArrowLeft size={15} /> Back to checkpoints
        </Link>

        <div className={styles.titleRow}>
          <div>
            <h1 className={styles.title}>{checkpoint.title}</h1>
            <p className={styles.subtitle}>
              {checkpoint.startAt ? formatIstDateTime(checkpoint.startAt) : 'No schedule'} ·{' '}
              {checkpoint.durationMinutes} minutes · {checkpoint.totalMarks} marks ·{' '}
              {checkpoint.passingMarks} to pass
            </p>
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void handlePublishResults()}
            disabled={publishing || stats.graded === 0}
            title={
              stats.graded === 0
                ? 'Grade at least one submission before publishing results.'
                : 'Make results visible according to the checkpoint setting.'
            }
          >
            <Send size={16} /> {publishing ? 'Publishing…' : 'Publish results'}
          </button>
        </div>

        {checkpoint.resultsPublishedAt && (
          <p className={styles.publishedNote}>
            <CheckCircle2 size={15} /> Results were published on{' '}
            {formatIstDateTime(checkpoint.resultsPublishedAt)}. Trainees with graded attempts can
            see their score.
          </p>
        )}

        <section className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{attempts.length}</span>
            <span className={styles.statLabel}>Attempts</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats.submitted}</span>
            <span className={styles.statLabel}>Submitted</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats.graded}</span>
            <span className={styles.statLabel}>Graded</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats.passed}</span>
            <span className={styles.statLabel}>Passed</span>
          </div>
        </section>

        <div className={styles.card}>
          {attempts.length === 0 ? (
            <div className={styles.empty}>
              <FileText size={26} aria-hidden="true" />
              <h2>No attempts yet</h2>
              <p>Submissions appear here once assigned trainees start the checkpoint.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Trainee</th>
                    <th>Attempt</th>
                    <th>Started</th>
                    <th>Submitted</th>
                    <th>Reason</th>
                    <th>Score</th>
                    <th>Result</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td>
                        <div className={styles.traineeCell}>
                          <span>{attempt.traineeName}</span>
                          <small>{attempt.traineeEmail}</small>
                        </div>
                      </td>
                      <td>#{attempt.attemptNumber}</td>
                      <td className={styles.muted}>{formatIstDateTime(attempt.startedAt)}</td>
                      <td className={styles.muted}>
                        {attempt.submittedAt ? formatIstDateTime(attempt.submittedAt) : '—'}
                      </td>
                      <td className={styles.muted}>{reasonLabel(attempt.submissionReason)}</td>
                      <td>
                        {attempt.totalScore === null ? (
                          <span className={styles.muted}>Not graded</span>
                        ) : (
                          <span>
                            {attempt.totalScore}/{checkpoint.totalMarks}
                            {attempt.percentage !== null && (
                              <small className={styles.scorePercent}>{attempt.percentage}%</small>
                            )}
                          </span>
                        )}
                      </td>
                      <td>
                        {attempt.passed === null ? (
                          <span className={styles.muted}>—</span>
                        ) : attempt.passed ? (
                          <span className={styles.pass}>
                            <CheckCircle2 size={14} /> Pass
                          </span>
                        ) : (
                          <span className={styles.fail}>
                            <XCircle size={14} /> Fail
                          </span>
                        )}
                        {attempt.gradedAt && (
                          <small className={styles.scorePercent}>
                            {attempt.resultVisible ? 'Visible' : 'Not published'}
                          </small>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.reviewButton}
                          onClick={() => openAttempt(attempt.id)}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {selectedAttemptId && (
        <div className={styles.drawerOverlay} role="presentation">
          <section
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label="Submission review"
          >
            <header className={styles.drawerHeader}>
              <div>
                <h2>{attemptDetail?.traineeName ?? 'Submission review'}</h2>
                <p>
                  {attemptDetail
                    ? `Attempt #${attemptDetail.attemptNumber} · ${reasonLabel(attemptDetail.submissionReason)}`
                    : 'Loading submission…'}
                </p>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => closeAttempt()}
                aria-label="Close review"
              >
                <X size={18} />
              </button>
            </header>

            {attemptLoading ? (
              <LoaderOverlay label="Loading submission…" />
            ) : attemptError && !attemptDetail ? (
              <div className={styles.drawerBody}>
                <p className={styles.error}>{attemptError}</p>
              </div>
            ) : attemptDetail ? (
              <div className={styles.drawerBody}>
                <div className={styles.attemptMeta}>
                  <div>
                    <span>Started</span>
                    <strong>{formatIstDateTime(attemptDetail.startedAt)}</strong>
                  </div>
                  <div>
                    <span>Deadline</span>
                    <strong>{formatIstDateTime(attemptDetail.deadlineAt)}</strong>
                  </div>
                  <div>
                    <span>Submitted</span>
                    <strong>
                      {attemptDetail.submittedAt
                        ? formatIstDateTime(attemptDetail.submittedAt)
                        : 'In progress'}
                    </strong>
                  </div>
                  <div>
                    <span>Score</span>
                    <strong>
                      {attemptDetail.totalScore ?? 0}/{attemptDetail.checkpointTotalMarks}
                    </strong>
                  </div>
                </div>

                {attemptDetail.events.length > 0 && (
                  <details className={styles.events}>
                    <summary>Assessment events ({attemptDetail.events.length})</summary>
                    <ol>
                      {attemptDetail.events.map((event) => (
                        <li key={event.id}>
                          <span>{formatIstDateTime(event.createdAt)}</span>
                          <strong>{event.type.replaceAll('_', ' ')}</strong>
                          {event.message && <em>{event.message}</em>}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}

                <div className={styles.questions}>
                  {attemptDetail.questions.map((question, index) => {
                    const answer = attemptDetail.answers.find(
                      (row) => row.questionId === question.id
                    );
                    return (
                      <article key={question.id} className={styles.questionCard}>
                        <header className={styles.questionHeader}>
                          <div>
                            <span className={styles.questionNumber}>Question {index + 1}</span>
                            <h3>{question.title}</h3>
                          </div>
                          <span className={styles.marksBadge}>{question.marks} marks</span>
                        </header>

                        <div className={styles.questionPrompt}>
                          <MarkdownRenderer markdown={question.promptMarkdown} />
                        </div>
                        <p className={styles.answerType}>{questionTypeLabel(question.type)}</p>

                        <div className={styles.answerBox}>
                          {answer?.fileName ? (
                            <div className={styles.fileAnswer}>
                              <FileText size={18} />
                              <span>{answer.fileName}</span>
                              <button
                                type="button"
                                className={styles.downloadButton}
                                onClick={() => void handleDownload(question.id)}
                              >
                                <Download size={14} /> Download
                              </button>
                            </div>
                          ) : answer?.selectedOption ? (
                            <p className={styles.selectedOption}>{answer.selectedOption}</p>
                          ) : answer?.answerText ? (
                            <pre className={styles.answerText}>{answer.answerText}</pre>
                          ) : (
                            <p className={styles.unanswered}>No answer submitted.</p>
                          )}
                        </div>

                        <div className={styles.gradeRow}>
                          <label className={styles.marksInput}>
                            <span>Marks awarded</span>
                            <div>
                              <input
                                type="number"
                                min={0}
                                max={question.marks}
                                step={0.5}
                                value={marks[question.id] ?? ''}
                                onChange={(event) =>
                                  setMarks((current) => ({
                                    ...current,
                                    [question.id]: event.target.value,
                                  }))
                                }
                              />
                              <span>/ {question.marks}</span>
                            </div>
                          </label>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <label className={styles.feedbackField}>
                  <span>Overall feedback</span>
                  <textarea
                    rows={4}
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder="Comments visible to the trainee with the result…"
                  />
                </label>

                {attemptError && (
                  <p className={styles.error} role="alert">
                    {attemptError}
                  </p>
                )}

                <div className={styles.drawerActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => closeAttempt()}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => void handleGrade()}
                    disabled={grading || attemptDetail.status !== 'SUBMITTED'}
                  >
                    {grading ? 'Saving…' : 'Save marks & feedback'}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      )}
    </>
  );
}
