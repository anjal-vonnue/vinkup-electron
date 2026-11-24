import { useState } from 'react';
import type { AdminFlagEvent } from '@itp/types';
import { FLAG_PRIORITY_LABELS, describeFlag, formatFlagDuration } from '../../lib/adminLabels';
import { formatIstDateTime } from '../../lib/formatDateTime';
import styles from './AdminFlagTable.module.css';

/** The API returns at most this many events. */
const API_FLAG_LIMIT = 500;

type AdminFlagTableProps = {
  flags: AdminFlagEvent[];
  /** dayId → "HTML · Day 2". A day that isn't in the map shows its id. */
  dayLabels: ReadonlyMap<string, string>;
};

type Filter = 'important' | 'all';

/** Low priority is brief, routine behaviour (a few seconds away). Normal and High deserve a look. */
function isImportant(flag: AdminFlagEvent): boolean {
  return flag.reviewPriority !== 'LOW';
}

export default function AdminFlagTable({ flags, dayLabels }: AdminFlagTableProps) {
  const [filter, setFilter] = useState<Filter>('important');

  if (flags.length === 0) {
    return <p className={styles.empty}>No focus events recorded for this trainee.</p>;
  }

  const importantCount = flags.filter(isImportant).length;
  const shown = filter === 'important' ? flags.filter(isImportant) : flags;

  // Newest first, whatever order the API used.
  const sorted = [...shown].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  return (
    <div>
      <p className={styles.note}>
        Focus events are a guide for review, not proof. Opening DevTools, for example, also counts
        as leaving the window. Idle means no keyboard or mouse input; it can also mean reading or
        thinking.
      </p>

      <div className={styles.filters} role="group" aria-label="Which events to show">
        <button
          type="button"
          className={`${styles.filter} ${filter === 'important' ? styles.filterActive : ''}`}
          aria-pressed={filter === 'important'}
          onClick={() => setFilter('important')}
        >
          Important ({importantCount})
        </button>
        <button
          type="button"
          className={`${styles.filter} ${filter === 'all' ? styles.filterActive : ''}`}
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          All ({flags.length})
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className={styles.empty}>
          No important events. {flags.length} minor {flags.length === 1 ? 'event is' : 'events are'}{' '}
          hidden.
        </p>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>Focus events, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Time (IST)</th>
                <th scope="col">Event</th>
                <th scope="col">Task</th>
                <th scope="col">Day</th>
                <th scope="col">Away for</th>
                <th scope="col">Priority</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((flag) => (
                <tr key={flag.id}>
                  <td className={styles.mono}>{formatIstDateTime(flag.timestamp)}</td>
                  <td>{describeFlag(flag)}</td>
                  <td>{flag.taskTitle}</td>
                  <td>{dayLabels.get(flag.dayId) ?? flag.dayId}</td>
                  <td className={styles.mono}>{formatFlagDuration(flag.durationMs)}</td>
                  <td>
                    <span
                      className={`${styles.priority} ${styles[flag.reviewPriority.toLowerCase()]}`}
                    >
                      {FLAG_PRIORITY_LABELS[flag.reviewPriority]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {flags.length >= API_FLAG_LIMIT && (
        <p className={styles.note}>Showing the {API_FLAG_LIMIT} most recent events.</p>
      )}
    </div>
  );
}
