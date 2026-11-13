import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AdminAnalyticsTraineeRow } from '@itp/types';
import { formatDurationHM } from '../../lib/formatTime';
import ChartCard from './ChartCard';
import { axisTick, tooltipStyle } from './chartFormat';
import styles from './TraineeComparisonChart.module.css';

type Metric = 'completion' | 'coding';

type TraineeComparisonChartProps = {
  rows: AdminAnalyticsTraineeRow[];
  /** The trainee picked in the filter, highlighted; null = whole team. */
  selectedTraineeId: string | null;
};

const BAR_HEIGHT = 28;

/** Percent of the curriculum a trainee has completed: 19 of 54 days -> 35 */
function completionPercent(row: AdminAnalyticsTraineeRow): number {
  return row.totalDays === 0 ? 0 : Math.round((row.daysCompleted / row.totalDays) * 100);
}

/** Horizontal bars, one per trainee: curriculum completion (all time) or coding time (period). */
export default function TraineeComparisonChart({
  rows,
  selectedTraineeId,
}: TraineeComparisonChartProps) {
  const [metric, setMetric] = useState<Metric>('completion');

  // value: the bar length. Completion in %, coding time in hours (one decimal).
  const bars = rows
    .map((row) => ({
      ...row,
      value:
        metric === 'completion'
          ? completionPercent(row)
          : Math.round((row.codingSeconds / 3600) * 10) / 10,
    }))
    .sort((a, b) => b.value - a.value);

  const isEmpty = bars.every((bar) => bar.value === 0);
  const top = bars[0];

  return (
    <ChartCard
      title="Trainee comparison"
      description={
        metric === 'completion'
          ? 'Share of the curriculum each trainee has completed (all time).'
          : 'Coding time each trainee recorded in this period.'
      }
      summary={
        top &&
        (metric === 'completion'
          ? `Furthest along: ${top.name}, ${top.value}% (${top.daysCompleted} of ${top.totalDays} days)`
          : `Most coding time: ${top.name}, ${formatDurationHM(top.codingSeconds)}`)
      }
      isEmpty={isEmpty}
      emptyText={
        metric === 'completion'
          ? 'No curriculum days have been completed yet.'
          : 'No coding time was recorded in this period.'
      }
      actions={
        <div className={styles.toggle} role="group" aria-label="Compare by">
          <button
            type="button"
            className={styles.toggleButton}
            aria-pressed={metric === 'completion'}
            onClick={() => setMetric('completion')}
          >
            Completion
          </button>
          <button
            type="button"
            className={styles.toggleButton}
            aria-pressed={metric === 'coding'}
            onClick={() => setMetric('coding')}
          >
            Coding time
          </button>
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={bars.length * BAR_HEIGHT + 40}>
        <BarChart data={bars} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-border-card)" horizontal={false} />
          <XAxis
            type="number"
            tick={axisTick}
            tickLine={false}
            domain={metric === 'completion' ? [0, 100] : [0, 'auto']}
            tickFormatter={(value: number) => (metric === 'completion' ? `${value}%` : `${value}h`)}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: 'var(--color-border-card)' }}
            formatter={(_value, _name, item) => {
              const row = item.payload as (typeof bars)[number];
              return metric === 'completion'
                ? [`${row.value}% (${row.daysCompleted} of ${row.totalDays} days)`, 'Completed']
                : [formatDurationHM(row.codingSeconds), 'Coding time'];
            }}
          />
          <Bar dataKey="value" barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {bars.map((bar) => (
              <Cell
                key={bar.traineeId}
                fill="var(--color-accent-purple)"
                // With one trainee picked, the others fade so the pick stands out.
                fillOpacity={selectedTraineeId && bar.traineeId !== selectedTraineeId ? 0.3 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
