import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AdminAnalyticsProgressPoint } from '@itp/types';
import ChartCard from './ChartCard';
import { axisTick, formatLongDate, formatShortDate, tooltipStyle } from './chartFormat';

type ProgressTrendChartProps = {
  points: AdminAnalyticsProgressPoint[];
  /** true when one trainee is chosen: the line is their own days, not an average. */
  isOneTrainee: boolean;
};

/** Line chart: curriculum days completed so far (average per trainee), day by day. */
export default function ProgressTrendChart({ points, isOneTrainee }: ProgressTrendChartProps) {
  const first = points[0]?.averageDaysCompleted ?? 0;
  const last = points[points.length - 1]?.averageDaysCompleted ?? 0;
  const gained = Math.round((last - first) * 10) / 10;
  const unit = isOneTrainee ? 'days completed' : 'days completed on average';

  return (
    <ChartCard
      title="Team progress"
      description={
        isOneTrainee
          ? 'Curriculum days this trainee had completed by each date.'
          : 'Average curriculum days completed per trainee by each date.'
      }
      summary={`${last} ${unit} (+${gained} in this period)`}
      isEmpty={points.every((point) => point.averageDaysCompleted === 0)}
      emptyText="No curriculum days have been completed yet."
    >
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--color-border-card)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDate}
            tick={axisTick}
            minTickGap={24}
            tickLine={false}
          />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(date) => (typeof date === 'string' ? formatLongDate(date) : '')}
            formatter={(value) => [`${String(value)} days`, isOneTrainee ? 'Completed' : 'Average']}
          />
          <Line
            type="linear"
            dataKey="averageDaysCompleted"
            stroke="var(--color-accent-purple)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
