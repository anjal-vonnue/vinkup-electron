import type { AdminFeedbackEntry, AdminFlagEvent, AdminTraineeDetail } from '@itp/types';
import { FLAG_PRIORITY_LABELS, describeFlag, formatFlagDuration } from '../../lib/adminLabels';
import { formatIstDateTime } from '../../lib/formatDateTime';
import type { PrintReportOptions } from '../../lib/printReport';
import StatsSummary from '../StatsSummary';
import styles from './PrintReport.module.css';

type PrintReportProps = {
  detail: AdminTraineeDetail;
  /** null = the flags didn't load; the report says so instead of leaving the section out. */
  flags: AdminFlagEvent[] | null;
  /** null = the feedback didn't load; the report says so instead of leaving the section out. */
  feedback?: AdminFeedbackEntry[] | null;
  /** dayId → "HTML · Day 2" */
  dayLabels: ReadonlyMap<string, string>;
  options: PrintReportOptions;
  mentorName: string | null;
  generatedAt: Date;
};

/** Caps keep the report a summary. Each section says when it is showing a subset. */
const MAX_FLAGS = 8;

function dayLabel(dayLabels: ReadonlyMap<string, string>, dayId: string): string {
  return dayLabels.get(dayId) ?? dayId;
}

export default function PrintReport({
  detail,
  flags,
  dayLabels,
  options,
  mentorName,
  generatedAt,
}: PrintReportProps) {
  const { profile, typingStats, tasks } = detail;
  const { trainee } = profile;

  const progressPct =
    trainee.totalDays > 0
      ? Math.min(100, Math.round((trainee.currentDay / trainee.totalDays) * 100))
      : 0;

  /* Tasks */
  const stretchCount = tasks.filter((task) => task.isStretchGoal).length;

  /* Flags */
  const importantFlags = (flags ?? [])
    .filter((flag) => flag.reviewPriority !== 'LOW')
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const shownFlags = importantFlags.slice(0, MAX_FLAGS);

  return (
    <article className={styles.report} aria-label="Printable trainee report">
      {/* Cover / header */}
      <header className={styles.header}>
        <p className={styles.kicker}>Vinkup trainee report</p>

        <div className={styles.headerTop}>
          <div className={styles.identity}>
            <h1 className={styles.name}>{trainee.name}</h1>
            <p className={styles.email}>{trainee.email}</p>
          </div>

          <div className={styles.dayBadge}>
            <span className={styles.dayBadgeValue}>
              Day {trainee.currentDay}
              <span className={styles.dayBadgeTotal}> of {trainee.totalDays}</span>
            </span>
            <span className={styles.dayBadgeLabel}>{trainee.track}</span>
          </div>
        </div>

        <div className={styles.meta}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Generated</span>
            <span className={styles.metaValue}>
              {formatIstDateTime(generatedAt.toISOString())} IST
            </span>
          </div>

          {mentorName && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Prepared by</span>
              <span className={styles.metaValue}>{mentorName}</span>
            </div>
          )}
        </div>
      </header>

      {/* Key numbers */}
      <section className={styles.section} aria-label="Summary">
        <div className={styles.tiles}>
          <div className={styles.tile}>
            <span className={styles.tileValue}>{progressPct}%</span>
            <span className={styles.tileLabel}>Current Course Progress</span>
            <span className={styles.bar} aria-hidden="true">
              <span className={styles.barFill} style={{ width: `${progressPct}%` }} />
            </span>
          </div>

          <div className={styles.tile}>
            <span className={styles.tileValue}>{tasks.length}</span>
            <span className={styles.tileLabel}>
              Tasks{stretchCount > 0 ? ` (${stretchCount} stretch)` : ''}
            </span>
          </div>

          {options.includeFlags && (
            <div className={styles.tile}>
              <span className={styles.tileValue}>
                {flags === null ? '—' : importantFlags.length}
              </span>
              <span className={styles.tileLabel}>Important flags</span>
            </div>
          )}
        </div>
      </section>

      {/* Performance */}
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2 className={styles.sectionTitle}>Performance</h2>
          <p className={styles.sectionHint}>Totals and typing results</p>
        </div>

        <div className={styles.panel}>
          <StatsSummary total={profile.total} typingStats={typingStats} />
        </div>
      </section>

      {/* Focus monitoring */}
      {options.includeFlags && (
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2 className={styles.sectionTitle}>Focus events</h2>
            {flags !== null && importantFlags.length > 0 && (
              <span className={styles.count}>
                {shownFlags.length} of {importantFlags.length} important
              </span>
            )}
          </div>

          {flags === null ? (
            <p className={styles.empty}>Flagged events unavailable.</p>
          ) : importantFlags.length === 0 ? (
            <p className={styles.empty}>No important focus events recorded.</p>
          ) : (
            <>
              <p className={styles.note}>
                {importantFlags.length} important events out of {flags.length} recorded. Focus
                events are a guide for review, not proof. Idle means no keyboard or mouse input; it
                can also mean reading or thinking.
              </p>

              <div className={styles.tableCard}>
                <table className={`${styles.table} ${styles.flagsTable}`}>
                  <thead>
                    <tr>
                      <th scope="col">Event</th>
                      <th scope="col">Task</th>
                      <th scope="col">Day</th>
                      <th scope="col">Away</th>
                      <th scope="col">Priority</th>
                      <th scope="col">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownFlags.map((flag) => (
                      <tr key={flag.id}>
                        <td>{describeFlag(flag)}</td>
                        <td>{flag.taskTitle}</td>
                        <td>{dayLabel(dayLabels, flag.dayId)}</td>
                        <td>{formatFlagDuration(flag.durationMs)}</td>
                        <td>
                          <span className={styles.priority}>
                            {FLAG_PRIORITY_LABELS[flag.reviewPriority]}
                          </span>
                        </td>
                        <td>{formatIstDateTime(flag.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      <footer className={styles.footer}>
        <span>Vinkup trainee progress report</span>
        <span>Confidential, for mentor use only</span>
      </footer>
    </article>
  );
}
