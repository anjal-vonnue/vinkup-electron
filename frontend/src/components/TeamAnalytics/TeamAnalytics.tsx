import { useEffect, useId, useState } from 'react';
import type { AdminAnalytics, AdminTraineeSummary } from '@itp/types';
import { getAdminAnalytics } from '../../api/admin';
import { ANALYTICS_PERIODS, DEFAULT_PERIOD_DAYS, periodRange } from '../../lib/analyticsRange';
import { formatDurationHM } from '../../lib/formatTime';
import { INTEGRITY_MID_MIN } from '../../lib/Integrityband';
import LoaderOverlay from '../Common/LoadingState';
import { ErrorState } from '../Common/ErrorState';
import { formatLongDate } from './chartFormat';
import ProgressTrendChart from './ProgressTrendChart';
import TraineeComparisonChart from './TraineeComparisonChart';
import TaskStatusChart from './TaskStatusChart';
import TrendLineChart from './TrendLineChart';
import NeedsAttentionList from './NeedsAttentionList';
import styles from './TeamAnalytics.module.css';

type TeamAnalyticsProps = {
  /** The trainees already loaded by the page: used for the trainee filter. */
  trainees: AdminTraineeSummary[];
  attentionReasons: Record<string, string[]>;
};

/** The answer to one request, remembered together with the filters it was for. */
type Result =
  { key: string; data: AdminAnalytics; error: null } | { key: string; data: null; error: Error };

/** Team analytics between the summary cards and the trainee table on /admin. */
export default function TeamAnalytics({ trainees, attentionReasons }: TeamAnalyticsProps) {
  const titleId = useId();
  const [periodDays, setPeriodDays] = useState<number>(DEFAULT_PERIOD_DAYS);
  const [traineeId, setTraineeId] = useState(''); // '' = whole team
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  // A different key means the filters changed, so the shown result is out of date.
  const requestKey = `${periodDays}|${traineeId}|${attempt}`;
  const isLoading = result?.key !== requestKey;

  useEffect(() => {
    // Ignore an answer that arrives after the filters changed again.
    let isCancelled = false;
    const { from, to } = periodRange(periodDays);

    getAdminAnalytics({ from, to, traineeId: traineeId || undefined })
      .then((data) => {
        if (!isCancelled) setResult({ key: requestKey, data, error: null });
      })
      .catch((caught: unknown) => {
        const error = caught instanceof Error ? caught : new Error('Something went wrong.');
        if (!isCancelled) setResult({ key: requestKey, data: null, error });
      });

    return () => {
      isCancelled = true;
    };
  }, [periodDays, traineeId, attempt, requestKey]);

  const analytics = result?.data ?? null;
  const selectedName = trainees.find((trainee) => trainee.id === traineeId)?.name;

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h2 id={titleId} className={styles.title}>
            Team analytics
          </h2>
          <p className={styles.subtitle}>
            {selectedName ?? 'Whole team'}
            {analytics && ` · ${formatLongDate(analytics.from)} – ${formatLongDate(analytics.to)}`}
          </p>
        </div>

        <div className={styles.filters}>
          <label className={styles.filterLabel}>
            Trainee
            <span className={styles.selectBox}>
              <select
                className={styles.select}
                value={traineeId}
                onChange={(event) => setTraineeId(event.target.value)}
              >
                <option value="">Whole team</option>
                {trainees.map((trainee) => (
                  <option key={trainee.id} value={trainee.id}>
                    {trainee.name}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <label className={styles.filterLabel}>
            Period
            <span className={styles.selectBox}>
              <select
                className={styles.select}
                value={periodDays}
                onChange={(event) => setPeriodDays(Number(event.target.value))}
              >
                {ANALYTICS_PERIODS.map((period) => (
                  <option key={period.days} value={period.days}>
                    {period.label}
                  </option>
                ))}
              </select>
            </span>
          </label>
        </div>
      </div>

      <div className={styles.body} aria-busy={isLoading}>
        {result?.error && !isLoading ? (
          <ErrorState
            title="Unable to load analytics"
            message={result.error.message}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        ) : (
          analytics && (
            <>
              <dl className={styles.totals} aria-label="Totals for this period">
                <div className={styles.total}>
                  <dt>Days completed</dt>
                  <dd>{analytics.totals.daysCompleted}</dd>
                </div>
                <div className={styles.total}>
                  <dt>Tasks submitted</dt>
                  <dd>{analytics.totals.tasksSubmitted}</dd>
                </div>
                <div className={styles.total}>
                  <dt>Active time</dt>
                  <dd>{formatDurationHM(analytics.totals.activeSeconds)}</dd>
                </div>
                <div className={styles.total}>
                  <dt>Coding time</dt>
                  <dd>{formatDurationHM(analytics.totals.codingSeconds)}</dd>
                </div>
                <div className={styles.total}>
                  <dt>Typing tests</dt>
                  <dd>{analytics.totals.typingTests}</dd>
                </div>
              </dl>

              <div className={styles.charts}>
                <ProgressTrendChart
                  points={analytics.progressTrend}
                  isOneTrainee={analytics.traineeId !== null}
                />

                <TraineeComparisonChart
                  rows={analytics.traineeComparison}
                  selectedTraineeId={analytics.traineeId}
                />

                <TaskStatusChart status={analytics.taskStatus} />

                <TrendLineChart
                  title="Typing speed"
                  description="Average of each trainee's latest WPM, like the table's WPM column."
                  points={analytics.typingTrend.map((point) => ({
                    date: point.date,
                    value: point.averageWpm,
                    count: point.traineesIncluded,
                  }))}
                  from={analytics.from}
                  to={analytics.to}
                  unit=" WPM"
                  describeCount={(count) =>
                    `latest WPM of ${count} trainee${count === 1 ? '' : 's'}`
                  }
                  emptyText="No typing tests were taken in this period."
                />
                <TrendLineChart
                  title="Integrity score"
                  description="Average score of all curriculum days completed so far. Days still in progress are not included."
                  points={analytics.integrityTrend.map((point) => ({
                    date: point.date,
                    value: point.averageScore,
                    count: point.daysScored,
                  }))}
                  from={analytics.from}
                  to={analytics.to}
                  unit=""
                  describeCount={(count) =>
                    `average of ${count} completed day${count === 1 ? '' : 's'}`
                  }
                  emptyText="No completed days with a score in this period."
                  yDomain={[0, 100]}
                  threshold={{ value: INTEGRITY_MID_MIN, label: `Low below ${INTEGRITY_MID_MIN}` }}
                />

                <NeedsAttentionList
                  trainees={trainees}
                  attentionReasons={attentionReasons}
                  selectedTraineeId={traineeId}
                  onSelectTrainee={setTraineeId}
                />
              </div>
            </>
          )
        )}

        {isLoading && <LoaderOverlay label="Loading analytics…" />}
      </div>
    </section>
  );
}
