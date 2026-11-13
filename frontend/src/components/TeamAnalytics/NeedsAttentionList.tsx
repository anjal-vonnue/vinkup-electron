import type { AdminTraineeSummary } from '@itp/types';
import { BEHIND_BY_MORE_THAN_DAYS, INACTIVE_AFTER_DAYS } from '../../lib/adminTrainees';
import { INTEGRITY_MID_MIN } from '../../lib/Integrityband';
import ChartCard from './ChartCard';
import styles from './NeedsAttentionList.module.css';

type NeedsAttentionListProps = {
  trainees: AdminTraineeSummary[];
  /** Reasons per trainee id, worked out by the page with needsAttention (same as the table). */
  attentionReasons: Record<string, string[]>;
  /** The trainee picked in the analytics filter; '' = whole team. */
  selectedTraineeId: string;
  /** Shows this trainee's analytics. */
  onSelectTrainee: (traineeId: string) => void;
};

/** The trainees the table marks as needing attention, with their reasons. */
export default function NeedsAttentionList({
  trainees,
  attentionReasons,
  selectedTraineeId,
  onSelectTrainee,
}: NeedsAttentionListProps) {
  const flagged = trainees.filter((trainee) => (attentionReasons[trainee.id] ?? []).length > 0);

  return (
    <ChartCard
      title="Needs attention"
      description={
        `Inactive ${INACTIVE_AFTER_DAYS}+ days, more than ${BEHIND_BY_MORE_THAN_DAYS} days ` +
        `behind the team median, or integrity score below ${INTEGRITY_MID_MIN}. ` +
        'Same rules as the table; not affected by the period.'
      }
      summary={`${flagged.length} of ${trainees.length} trainees`}
      isEmpty={flagged.length === 0}
      emptyText="No trainee needs attention right now."
    >
      <ul className={styles.list}>
        {flagged.map((trainee) => (
          <li key={trainee.id} className={styles.item}>
            <button
              type="button"
              className={styles.name}
              aria-pressed={selectedTraineeId === trainee.id}
              onClick={() => onSelectTrainee(trainee.id)}
            >
              {trainee.name}
            </button>
            <span className={styles.reasons}>{attentionReasons[trainee.id].join(' · ')}</span>
          </li>
        ))}
      </ul>
      <p className={styles.hint}>Select a name to see that trainee&apos;s analytics.</p>
    </ChartCard>
  );
}
