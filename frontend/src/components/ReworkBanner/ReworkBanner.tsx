import { useState } from 'react';
import { AlertCircle, ArrowRight, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import type { ReworkTaskSummary } from '@itp/types';
import styles from './ReworkBanner.module.css';

export type ReworkBannerProps = {
  tasks: ReworkTaskSummary[];
  onOpenFeedback: (task: ReworkTaskSummary) => void;
  onOpenTask: (taskId: string) => void;
  initialExpanded?: boolean;
};

export default function ReworkBanner({
  tasks,
  onOpenFeedback,
  onOpenTask,
  initialExpanded = false,
}: ReworkBannerProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  if (tasks.length === 0) return null;

  return (
    <section className={styles.card} aria-labelledby="rework-banner-title">
      <button
        type="button"
        className={styles.headerButton}
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        aria-controls="rework-banner-list"
      >
        <div className={styles.headerLeft}>
          <AlertCircle className={styles.icon} size={22} aria-hidden="true" />
          <h2 id="rework-banner-title" className={styles.title}>
            Rework Requested
          </h2>
          <span className={styles.badge}>
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.toggleHint}>
            {isExpanded ? 'Hide details' : 'Click to view details'}
          </span>
          {isExpanded ? (
            <ChevronUp size={18} className={styles.chevron} aria-hidden="true" />
          ) : (
            <ChevronDown size={18} className={styles.chevron} aria-hidden="true" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div id="rework-banner-list" className={styles.list}>
          <p className={styles.subtitle}>
            Your mentor requested changes. Review their feedback and resubmit when ready.
          </p>
          {tasks.map((task) => (
            <div key={task.taskId} className={styles.item}>
              <div className={styles.itemInfo}>
                <span className={styles.itemEyebrow}>
                  {task.courseTitle} — DAY {String(task.dayNumber).padStart(2, '0')}
                </span>
                <h3 className={styles.itemTitle}>{task.taskTitle}</h3>
                {task.latestReview?.feedback && (
                  <p className={styles.feedbackSnippet}>
                    <span className={styles.reviewerNote}>
                      {task.latestReview.adminName || 'Mentor'}:
                    </span>{' '}
                    &ldquo;{task.latestReview.feedback}&rdquo;
                  </p>
                )}
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.feedbackButton}
                  onClick={() => onOpenFeedback(task)}
                >
                  <MessageSquare size={15} aria-hidden="true" />
                  <span>View Feedback</span>
                </button>
                <button
                  type="button"
                  className={styles.taskButton}
                  onClick={() => onOpenTask(task.taskId)}
                >
                  <span>Go to Task</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
