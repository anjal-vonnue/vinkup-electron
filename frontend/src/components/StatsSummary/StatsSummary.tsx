import { type ProfileData, type TypingStats } from '@itp/types';
import styles from './StatsSummary.module.css';
import { formatDurationHM } from '../../lib/formatTime';

type StatsSummaryProps = {
  total: ProfileData['total'];
  typingStats: TypingStats;
};

export default function StatsSummary({ total, typingStats }: StatsSummaryProps) {
  return (
    <section className={styles.summary} aria-label="Training statistics">
      <div className={styles.item}>
        <span className={styles.label}>TOTAL TIME</span>
        <strong className={styles.value}>{formatDurationHM(total.activeSeconds)}</strong>
      </div>

      <div className={styles.item}>
        <span className={styles.label}>ACTIVE CODING</span>
        <strong className={styles.value}>{formatDurationHM(total.codingSeconds)}</strong>
      </div>

      <div className={styles.item}>
        <span className={styles.label}>READING &amp; LESSONS</span>
        <strong className={styles.value}>
          {formatDurationHM(total.activeSeconds - total.codingSeconds)}
        </strong>
      </div>

      <div className={styles.item}>
        <span className={styles.label}>AVERAGE WPM (LAST 10 TESTS)</span>
        <strong className={styles.value}>{typingStats.averageWpm} WPM</strong>
        <span className={styles.accuracy}>{typingStats.averageAccuracy.toFixed(1)}% accuracy</span>
      </div>

      <div className={styles.item}>
        <span className={styles.label}>HIGHEST WPM</span>
        <strong className={styles.value}>
          {typingStats.highestWpm !== null ? `${typingStats.highestWpm} WPM` : '—'}
        </strong>
        {typingStats.highestWpmAccuracy !== null && (
          <span className={styles.accuracy}>
            {typingStats.highestWpmAccuracy.toFixed(1)}% accuracy
          </span>
        )}
      </div>
    </section>
  );
}
