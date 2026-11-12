import { useEffect, useState } from 'react';
import { ArrowRight, Code, User, X } from 'lucide-react';
import type { TaskReview } from '@itp/types';
import { getTaskReview } from '../../api/tasks';
import { formatIstDateTime } from '../../lib/formatDateTime';
import styles from './TaskFeedbackModal.module.css';

export type TaskFeedbackModalProps = {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  taskTitle: string;
  initialReview?: TaskReview | null;
  onOpenEditor?: () => void;
};

export default function TaskFeedbackModal({
  isOpen,
  onClose,
  taskId,
  taskTitle,
  initialReview = null,
  onOpenEditor,
}: TaskFeedbackModalProps) {
  // Fetched review is keyed by task, so a stale load can never show under another task.
  const [fetched, setFetched] = useState<{ taskId: string; review: TaskReview | null } | null>(
    initialReview ? { taskId, review: initialReview } : null
  );
  const [errorState, setErrorState] = useState<{ taskId: string; message: string } | null>(null);

  const isLoaded = fetched?.taskId === taskId;
  const review = initialReview ?? (isLoaded ? fetched.review : null);
  const error = errorState?.taskId === taskId ? errorState.message : null;
  const isLoading = isOpen && !initialReview && !isLoaded && !error;

  useEffect(() => {
    if (!isOpen || initialReview || !taskId || fetched?.taskId === taskId) return;

    let cancelled = false;

    getTaskReview(taskId)
      .then((summary) => {
        if (!cancelled) {
          setFetched({ taskId, review: summary.latestReview });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorState({
            taskId,
            message: err instanceof Error ? err.message : 'Unable to load review feedback.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, taskId, initialReview, fetched]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isRework = review?.decision === 'rework';
  const isApproved = review?.decision === 'approved';

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
      >
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.eyebrow}>
              <span>Review Feedback</span>
              {isRework && (
                <span className={`${styles.statusBadge} ${styles.reworkBadge}`}>Rework</span>
              )}
              {isApproved && (
                <span className={`${styles.statusBadge} ${styles.approvedBadge}`}>Approved</span>
              )}
            </div>
            <h2 id="feedback-modal-title" className={styles.title}>
              {taskTitle}
            </h2>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close review feedback"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.body}>
          {isLoading && <div className={styles.loadingState}>Loading review details…</div>}

          {error && <div className={styles.errorState}>{error}</div>}

          {!isLoading && !error && !review && (
            <p className={styles.emptyFeedback}>No review feedback is available for this task.</p>
          )}

          {!isLoading && !error && review && (
            <>
              <div className={styles.metaCard}>
                <div className={styles.reviewer}>
                  <User size={15} aria-hidden="true" />
                  <span>Reviewed by {review.adminName || 'Admin'}</span>
                </div>
                <div>{formatIstDateTime(review.reviewedAt)}</div>
                {review.submissionNo > 0 && (
                  <div className={styles.attempt}>Submission attempt #{review.submissionNo}</div>
                )}
              </div>

              <div className={styles.feedbackContainer}>
                <div className={styles.feedbackLabel}>Admin Feedback</div>
                <div className={styles.feedbackContent}>
                  {review.feedback ? review.feedback : 'No written feedback provided.'}
                </div>
              </div>
            </>
          )}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.dismissButton} onClick={onClose}>
            Close
          </button>

          {onOpenEditor && (
            <button
              type="button"
              className={styles.editorButton}
              onClick={() => {
                onClose();
                onOpenEditor();
              }}
            >
              <Code size={15} aria-hidden="true" />
              <span>Go to Editor</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
