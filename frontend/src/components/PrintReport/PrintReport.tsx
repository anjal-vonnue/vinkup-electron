import type { AdminFlagEvent, AdminTraineeDetail } from '@itp/types';
import {
  FLAG_PRIORITY_LABELS,
  FLAG_TYPE_LABELS,
  TASK_STATUS_LABELS,
  formatFlagDuration,
} from '../../lib/adminLabels';
import { formatIstDateTime } from '../../lib/formatDateTime';
import type { PrintReportOptions } from '../../lib/printReport';
import AdminDayGrid from '../AdminDayGrid';
import DailyActivityTable from '../DailyActivityTable';
import StatsSummary from '../StatsSummary';
import styles from './PrintReport.module.css';

type PrintReportProps = {
  detail: AdminTraineeDetail;
  /** null = the flags didn't load; the report says so instead of leaving the section out. */
  flags: AdminFlagEvent[] | null;
  /** dayId → "HTML · Day 2" */
  dayLabels: ReadonlyMap<string, string>;
  options: PrintReportOptions;
  mentorName: string | null;
  generatedAt: Date;
};

function dayLabel(dayLabels: ReadonlyMap<string, string>, dayId: string): string {
  return dayLabels.get(dayId) ?? dayId;
}

/**
 * One trainee on paper: profile, stats, course grid, submitted tasks, and optionally the journal
 * and the important flagged events. Rendered only while printing (see usePrintMode); hidden on
 * screen by its CSS, so it never flashes behind the print dialog.
 */
export default function PrintReport({
  detail,
  flags,
  dayLabels,
  options,
  mentorName,
  generatedAt,
}: PrintReportProps) {
  const { profile, typingStats, courses, tasks, journal } = detail;
  const { trainee } = profile;

  // Curriculum order, so tasks read course by course, day by day.
  const dayOrder = new Map<string, number>();
  for (const course of courses) {
    for (const day of course.days) dayOrder.set(day.id, dayOrder.size);
  }

  const orderedTasks = [...tasks].sort(
    (a, b) => (dayOrder.get(a.dayId) ?? 0) - (dayOrder.get(b.dayId) ?? 0)
  );

  // Same default as the Flags tab: low priority is brief, routine behaviour.
  const importantFlags = (flags ?? [])
    .filter((flag) => flag.reviewPriority !== 'LOW')
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  return (
    <article className={styles.report} aria-label="Printable trainee report">
      <header className={styles.header}>
        <p className={styles.kicker}>Vinkup · Trainee progress report</p>
        <h1 className={styles.name}>{trainee.name}</h1>
        <p className={styles.meta}>{trainee.email}</p>
        <p className={styles.meta}>
          Currently on {trainee.track} · Day {trainee.currentDay} of {trainee.totalDays}
        </p>
        <p className={styles.meta}>
          Generated {formatIstDateTime(generatedAt.toISOString())} IST
          {mentorName ? ` · Prepared by ${mentorName}` : ''}
        </p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Summary</h2>
        <div className={styles.block}>
          <StatsSummary total={profile.total} typingStats={typingStats} />
        </div>
        <div className={styles.block}>
          <DailyActivityTable days={profile.dailyActivity} />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Progress by course</h2>
        <AdminDayGrid courses={courses} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Submitted tasks ({orderedTasks.length})</h2>
        {orderedTasks.length === 0 ? (
          <p className={styles.empty}>No submitted tasks yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Task</th>
                <th scope="col">Day</th>
                <th scope="col">Status</th>
                <th scope="col">Last submitted</th>
              </tr>
            </thead>
            <tbody>
              {orderedTasks.map((task) => (
                <tr key={task.taskId}>
                  <td>
                    {task.title}
                    {task.isStretchGoal && <span className={styles.tag}>Stretch</span>}
                  </td>
                  <td>{dayLabel(new Map(), task.dayId)}</td>
                  <td>{TASK_STATUS_LABELS[task.status]}</td>
                  <td>{task.lastSubmittedAt ? formatIstDateTime(task.lastSubmittedAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {options.includeJournal && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Journal ({journal.length})</h2>
          {journal.length === 0 ? (
            <p className={styles.empty}>No journal entries yet.</p>
          ) : (
            <ol className={styles.journal}>
              {journal.map((entry) => (
                <li key={entry.dayId} className={styles.journalEntry}>
                  <h3 className={styles.journalTitle}>
                    {entry.courseTitle} · Day {entry.dayNumber} — {entry.dayTitle}
                  </h3>
                  <p className={styles.journalDate}>{formatIstDateTime(entry.updatedAt)}</p>
                  <p className={styles.journalText}>{entry.responseText}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {options.includeFlags && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Flagged events</h2>
          {flags === null ? (
            <p className={styles.empty}>Flagged events unavailable.</p>
          ) : importantFlags.length === 0 ? (
            <p className={styles.empty}>No important focus events recorded.</p>
          ) : (
            <>
              <p className={styles.note}>
                {importantFlags.length} important of {flags.length} recorded. Focus events are a
                guide for review, not proof.
              </p>
              <table className={styles.table}>
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
                  {importantFlags.map((flag) => (
                    <tr key={flag.id}>
                      <td>{FLAG_TYPE_LABELS[flag.type]}</td>
                      <td>{flag.taskTitle}</td>
                      <td>{dayLabel(dayLabels, flag.dayId)}</td>
                      <td>{formatFlagDuration(flag.durationMs)}</td>
                      <td>{FLAG_PRIORITY_LABELS[flag.reviewPriority]}</td>
                      <td>{formatIstDateTime(flag.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      <footer className={styles.footer}>Confidential — for mentor use only</footer>
    </article>
  );
}
