import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown, ChevronUp, ClipboardCheck } from 'lucide-react';
import type { AdminTraineeSummary } from '@itp/types';
import { pendingTraineesFromSummaries } from './pendingReviewUtils';
import styles from './PendingReviewPanel.module.css';

function formatSubmittedAt(value: string | null): string {
  if (!value) return 'Submission time unavailable';
  return `Latest submission ${new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))}`;
}

export default function PendingReviewPanel({ trainees }: { trainees: AdminTraineeSummary[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const pendingTrainees = pendingTraineesFromSummaries(trainees);
  const taskCount = pendingTrainees.reduce((total, trainee) => total + trainee.taskCount, 0);

  return (
    <section className={styles.card} aria-labelledby="pending-review-title">
      <button
        type="button"
        className={styles.header}
        onClick={() => setIsExpanded((expanded) => !expanded)}
        aria-expanded={isExpanded}
        aria-controls="pending-review-trainees"
      >
        <span className={styles.heading}>
          <ClipboardCheck size={21} aria-hidden="true" />
          <span id="pending-review-title">Pending review</span>
          <span className={styles.badge}>
            {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
          </span>
        </span>
        <span className={styles.toggle}>
          {isExpanded ? 'Hide details' : 'View trainees'}
          {isExpanded ? (
            <ChevronUp size={18} aria-hidden="true" />
          ) : (
            <ChevronDown size={18} aria-hidden="true" />
          )}
        </span>
      </button>
      {isExpanded && (
        <div id="pending-review-trainees" className={styles.content}>
          <p className={styles.subtitle}>Trainees with submitted tasks waiting for your review.</p>
          {pendingTrainees.length === 0 ? (
            <p className={styles.empty}>You’re all caught up. No tasks are waiting for review.</p>
          ) : (
            <ul className={styles.list}>
              {pendingTrainees.map((trainee) => (
                <li key={trainee.traineeId} className={styles.item}>
                  <div className={styles.info}>
                    <span className={styles.trainee}>{trainee.traineeName}</span>
                    <span className={styles.meta}>
                      {trainee.taskCount} {trainee.taskCount === 1 ? 'task' : 'tasks'} waiting for
                      review
                    </span>
                    <span className={styles.date}>
                      {formatSubmittedAt(trainee.latestSubmissionAt)}
                    </span>
                  </div>
                  <Link
                    className={styles.action}
                    to={`/admin/trainees/${trainee.traineeId}?filter=pending`}
                    aria-label={`Review ${trainee.taskCount} pending ${trainee.taskCount === 1 ? 'task' : 'tasks'} for ${trainee.traineeName}`}
                  >
                    Review tasks <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
