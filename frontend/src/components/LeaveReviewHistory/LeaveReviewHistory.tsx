import type { LeaveReview } from '@itp/types';
import { formatIstDateTime } from '../../lib/formatDateTime';
import LeaveStatusBadge from '../LeaveStatusBadge/LeaveStatusBadge';
import styles from './LeaveReviewHistory.module.css';

/** Shared by Trainee, Mentor and Manager views: every decision stays visible. */
export default function LeaveReviewHistory({ reviews }: { reviews: LeaveReview[] }) {
  return (
    <section className={styles.history} aria-label="Review history">
      <h3 className={styles.heading}>Review history</h3>
      {reviews.length === 0 ? (
        <p className={styles.empty}>No reviews yet.</p>
      ) : (
        <ol className={styles.list}>
          {reviews.map((review) => (
            <li key={review.id} className={styles.item}>
              <div className={styles.itemTop}>
                <span className={styles.reviewer}>
                  {review.reviewerName} ({review.reviewerRole.toLowerCase()})
                </span>
                <LeaveStatusBadge status={review.decision} />
              </div>
              <p className={styles.date}>{formatIstDateTime(review.reviewedAt)}</p>
              {review.feedback && (
                <p className={styles.feedback}>
                  <strong>Feedback:</strong> {review.feedback}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
