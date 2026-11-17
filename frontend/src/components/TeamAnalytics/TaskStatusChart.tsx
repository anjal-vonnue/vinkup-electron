import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { AdminAnalyticsTaskStatus } from '@itp/types';
import ChartCard from './ChartCard';
import { tooltipStyle } from './chartFormat';
import styles from './TaskStatusChart.module.css';

type TaskStatusChartProps = {
  status: AdminAnalyticsTaskStatus;
};

/** Percent of `total`, rounded: 12 of 48 -> 25 */
function percent(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

/** Like percent(), but "<1%" for a small non-zero share, so it never reads as "none". */
function percentLabel(count: number, total: number): string {
  const value = percent(count, total);
  return count > 0 && value === 0 ? '<1%' : `${value}%`;
}

/**
 * Donut chart of the tasks' current status, split by mentor review, with a legend that
 * lists the exact counts. Colours are theme variables, so they work in light and dark mode.
 */
export default function TaskStatusChart({ status }: TaskStatusChartProps) {
  const slices = [
    { name: 'Approved', count: status.approved, color: 'var(--color-status-success)' },
    {
      name: 'Waiting for review',
      count: status.waitingForReview,
      color: 'var(--color-status-warning)',
    },
    { name: 'Sent back to fix', count: status.sentBack, color: 'var(--color-status-error-icon)' },
    { name: 'In progress', count: status.inProgress, color: 'var(--color-accent-purple)' },
    { name: 'Not started', count: status.notStarted, color: 'var(--color-text-muted)' },
  ];
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);

  return (
    <ChartCard
      title="Task status"
      description="Current status of every curriculum task, including mentor reviews. Not affected by the period."
      summary={`${percent(status.approved, total)}% of ${total} tasks approved`}
      isEmpty={total === 0}
      emptyText="There are no tasks to show."
    >
      <div className={styles.layout}>
        <div className={styles.donut}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={slices}
                dataKey="count"
                nameKey="name"
                innerRadius="60%"
                outerRadius="90%"
                stroke="var(--color-bg-card)"
                animationDuration={800}
              >
                {slices.map((slice) => (
                  <Cell key={slice.name} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => [`${String(value)} tasks`]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <ul className={styles.legend}>
          {slices.map((slice) => (
            <li key={slice.name} className={styles.legendItem}>
              <span
                className={styles.swatch}
                style={{ background: slice.color }}
                aria-hidden="true"
              />
              <span className={styles.legendName}>{slice.name}</span>
              <span className={styles.legendValue}>
                {slice.count} ({percentLabel(slice.count, total)})
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className={styles.note}>
        Overdue is not shown: VinkUp does not store due dates. Waiting for review includes tasks
        submitted before mentor reviews existed.
      </p>
    </ChartCard>
  );
}
