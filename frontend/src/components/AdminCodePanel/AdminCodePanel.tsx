import { lazy, Suspense, useContext, useEffect, useRef, useState } from 'react';
import { Check, Clock, RefreshCw, X } from 'lucide-react';
import type { AdminTaskCode, ReviewStatus, TaskReview } from '@itp/types';
import { approveTask, getAdminTaskReviews, requestRework } from '../../api/admin';
import type { ApiError } from '../../api/errors';
import { TASK_STATUS_LABELS } from '../../lib/adminLabels';
import { formatIstDateTime } from '../../lib/formatDateTime';
import LoaderOverlay from '../Common/LoadingState';
import { ErrorState } from '../Common/ErrorState';
import { ToastContext } from '../Toast';
import styles from './AdminCodePanel.module.css';

// Monaco is heavy; load it only when an admin actually opens some code.
const ReadOnlyCodeViewer = lazy(() => import('../ReadOnlyCodeViewer'));

type AdminCodePanelProps = {
  traineeId: string;
  taskTitle: string;
  code: AdminTaskCode | null;
  isLoading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  onClose: () => void;
  onReviewSuccess?: (taskId: string, decision: 'approved' | 'rework') => void;
};

export default function AdminCodePanel({
  traineeId,
  taskTitle,
  code,
  isLoading,
  error,
  onRetry,
  onClose,
  onReviewSuccess,
}: AdminCodePanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const toastContext = useContext(ToastContext);
  const showToast = toastContext?.show ?? (() => {});

  // Optimistic override for the task on screen; a keyed remount handles task changes.
  const [reviewOverride, setReviewOverride] = useState<{
    taskId: string;
    status: ReviewStatus;
  } | null>(null);
  const currentReviewStatus =
    reviewOverride && reviewOverride.taskId === code?.taskId
      ? reviewOverride.status
      : (code?.reviewStatus ?? null);
  const [isApproving, setIsApproving] = useState(false);
  const [isReworkModalOpen, setIsReworkModalOpen] = useState(false);
  const [reworkFeedback, setReworkFeedback] = useState('');
  const [reworkError, setReworkError] = useState<string | null>(null);
  const [isSubmittingRework, setIsSubmittingRework] = useState(false);

  // Review history
  const [showHistory, setShowHistory] = useState(false);
  const [historyReviews, setHistoryReviews] = useState<TaskReview[] | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Move focus to the panel when it opens, so keyboard users land on the code they asked for.
  useEffect(() => {
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  const handleApprove = async () => {
    if (!code || isApproving) return;
    setIsApproving(true);
    try {
      await approveTask(traineeId, code.taskId);
      setReviewOverride({ taskId: code.taskId, status: 'approved' });
      showToast({ message: 'Task approved successfully', variant: 'success' });
      onReviewSuccess?.(code.taskId, 'approved');
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : 'Failed to approve task.',
        variant: 'error',
      });
    } finally {
      setIsApproving(false);
    }
  };

  const handleOpenReworkModal = () => {
    setReworkFeedback('');
    setReworkError(null);
    setIsReworkModalOpen(true);
  };

  const handleSubmitRework = async () => {
    if (!code || isSubmittingRework) return;
    const feedback = reworkFeedback.trim();
    if (!feedback) {
      setReworkError('Meaningful feedback is required before requesting rework.');
      return;
    }

    setIsSubmittingRework(true);
    setReworkError(null);
    try {
      await requestRework(traineeId, code.taskId, feedback);
      setReviewOverride({ taskId: code.taskId, status: 'rework' });
      setIsReworkModalOpen(false);
      showToast({ message: 'Rework requested with feedback', variant: 'success' });
      onReviewSuccess?.(code.taskId, 'rework');
    } catch (err) {
      setReworkError(err instanceof Error ? err.message : 'Failed to submit rework request.');
    } finally {
      setIsSubmittingRework(false);
    }
  };

  const handleToggleHistory = async () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }

    setShowHistory(true);
    if (historyReviews === null && code) {
      setIsLoadingHistory(true);
      try {
        const reviews = await getAdminTaskReviews(traineeId, code.taskId);
        setHistoryReviews(reviews);
      } catch {
        setHistoryReviews([]);
      } finally {
        setIsLoadingHistory(false);
      }
    }
  };

  const isSubmitted = code?.status === 'completed';
  const isAwaitingReview =
    isSubmitted && currentReviewStatus !== 'approved' && currentReviewStatus !== 'rework';

  return (
    <section className={styles.panel} aria-labelledby="admin-code-heading">
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h3 id="admin-code-heading" ref={headingRef} tabIndex={-1} className={styles.title}>
            {taskTitle}
          </h3>

          {code && (
            <p className={styles.meta}>
              <span>{TASK_STATUS_LABELS[code.status]}</span>
              {code.submissionCount > 0 && <span>Attempt #{code.submissionCount}</span>}
              {code.codeUpdatedAt && <span>Saved {formatIstDateTime(code.codeUpdatedAt)}</span>}
              {code.lastSubmittedAt && (
                <span>Submitted {formatIstDateTime(code.lastSubmittedAt)}</span>
              )}
            </p>
          )}
        </div>

        <div className={styles.headerRight}>
          {code && isSubmitted && (
            <div className={styles.reviewActions}>
              <button
                type="button"
                className={styles.historyToggleBtn}
                onClick={() => void handleToggleHistory()}
                title="View review history for this task"
              >
                <Clock size={14} aria-hidden="true" />
                <span>History</span>
              </button>

              {currentReviewStatus === 'approved' && (
                <span className={`${styles.badge} ${styles.badgeApproved}`}>
                  <Check size={14} aria-hidden="true" /> Approved
                </span>
              )}

              {currentReviewStatus === 'rework' && (
                <span className={`${styles.badge} ${styles.badgeRework}`}>
                  <RefreshCw size={13} aria-hidden="true" /> Rework requested
                </span>
              )}

              {isAwaitingReview && (
                <>
                  <button
                    type="button"
                    className={styles.approveBtn}
                    onClick={() => void handleApprove()}
                    disabled={isApproving}
                  >
                    <Check size={14} aria-hidden="true" />
                    {isApproving ? 'Approving…' : 'Approve'}
                  </button>

                  <button
                    type="button"
                    className={styles.reworkBtn}
                    onClick={handleOpenReworkModal}
                    disabled={isApproving}
                  >
                    <RefreshCw size={13} aria-hidden="true" />
                    Rework
                  </button>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close code viewer"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Review History Box */}
      {showHistory && (
        <div className={styles.historyBox}>
          <div className={styles.historyHeader}>
            <span className={styles.historyTitle}>Task Review History</span>
            <button
              type="button"
              className={styles.close}
              style={{ width: 24, height: 24 }}
              onClick={() => setShowHistory(false)}
              aria-label="Close history"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>

          {isLoadingHistory && <p className={styles.meta}>Loading review history…</p>}

          {!isLoadingHistory && (!historyReviews || historyReviews.length === 0) && (
            <p className={styles.meta}>No previous reviews for this task.</p>
          )}

          {!isLoadingHistory && historyReviews && historyReviews.length > 0 && (
            <div className={styles.historyItems}>
              {historyReviews.map((rev) => (
                <div key={rev.id} className={styles.historyItem}>
                  <div className={styles.historyMeta}>
                    <span>
                      <strong>{rev.decision.toUpperCase()}</strong> by {rev.adminName}
                      {rev.submissionNo > 0 ? ` · Attempt #${rev.submissionNo}` : ''}
                    </span>
                    <span>{formatIstDateTime(rev.reviewedAt)}</span>
                  </div>
                  {rev.feedback ? (
                    <div className={styles.historyFeedback}>{rev.feedback}</div>
                  ) : (
                    <div className={styles.meta}>No feedback written.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {code?.isStarterCode && (
        <p className={styles.starter} role="note">
          Starter code: this trainee hasn&rsquo;t saved any work on this task.
        </p>
      )}

      <div className={styles.body}>
        {isLoading && <LoaderOverlay label="Loading code…" />}

        {error && (
          <ErrorState
            title="Unable to load code"
            message={error.message}
            onRetry={error.code === 'NOT_FOUND' ? undefined : onRetry}
          />
        )}

        {code && (
          <Suspense fallback={<LoaderOverlay label="Opening viewer…" />}>
            <ReadOnlyCodeViewer
              key={code.taskId}
              files={code.files}
              scope={`${traineeId}/${code.taskId}`}
            />
          </Suspense>
        )}
      </div>

      {/* Rework Modal */}
      {isReworkModalOpen && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isSubmittingRework) {
              setIsReworkModalOpen(false);
            }
          }}
        >
          <div
            className={styles.reworkModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rework-dialog-title"
          >
            <h4 id="rework-dialog-title" className={styles.modalTitle}>
              Request Rework: {taskTitle}
            </h4>
            <p className={styles.modalDesc}>
              Provide detailed feedback on what needs to be fixed. The trainee will see this
              feedback and can modify their code to resubmit.
            </p>

            <textarea
              className={styles.textarea}
              placeholder="e.g. Please fix the HTML tags formatting and add the missing section header..."
              value={reworkFeedback}
              onChange={(e) => {
                setReworkFeedback(e.target.value);
                if (reworkError) setReworkError(null);
              }}
              rows={5}
              autoFocus
            />

            {reworkError && <p className={styles.modalError}>{reworkError}</p>}

            <div className={styles.modalButtons}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setIsReworkModalOpen(false)}
                disabled={isSubmittingRework}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.submitReworkBtn}
                onClick={() => void handleSubmitRework()}
                disabled={isSubmittingRework}
              >
                {isSubmittingRework ? 'Submitting…' : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
