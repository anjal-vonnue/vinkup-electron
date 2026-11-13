import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartCard from './ChartCard';
import { axisTick, formatLongDate, formatShortDate, tooltipStyle } from './chartFormat';

/** One day with data. Days without data are simply missing (never shown as 0). */
export type TrendPoint = { date: string; value: number; count: number };

type TrendLineChartProps = {
  title: string;
  description: string;
  points: TrendPoint[];
  /** The chosen period, so the time axis always covers all of it. */
  from: string;
  to: string;
  /** Added after values, e.g. " WPM". */
  unit: string;
  /** Says what a point is based on, e.g. 3 -> "latest WPM of 3 trainees". */
  describeCount: (count: number) => string;
  emptyText: string;
  /** Y-axis range, e.g. [0, 100] for scores. Default: from 0 up to the highest value. */
  yDomain?: [number, number | 'auto'];
  /** An optional dashed line, e.g. the low-integrity limit. */
  threshold?: { value: number; label: string };
};

const toTime = (date: string) => Date.parse(`${date}T00:00:00`);
const toDate = (time: number) => new Date(time).toLocaleDateString('en-CA'); // 'YYYY-MM-DD'

/** Line chart of a value over time, with points only on days that have data. */
export default function TrendLineChart({
  title,
  description,
  points,
  from,
  to,
  unit,
  describeCount,
  emptyText,
  yDomain = [0, 'auto'],
  threshold,
}: TrendLineChartProps) {
  const data = points.map((point) => ({ ...point, time: toTime(point.date) }));
  const first = points[0];
  const last = points[points.length - 1];
  const change = first && last ? last.value - first.value : 0;

  return (
    <ChartCard
      title={title}
      description={description}
      summary={
        last &&
        `Latest: ${last.value}${unit} on ${formatLongDate(last.date)}` +
          (points.length > 1 ? ` (${change >= 0 ? '+' : ''}${change} in this period)` : '')
      }
      isEmpty={points.length === 0}
      emptyText={emptyText}
    >
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--color-border-card)" vertical={false} />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={[toTime(from), toTime(to)]}
            tickFormatter={(time: number) => formatShortDate(toDate(time))}
            tick={axisTick}
            minTickGap={24}
            tickLine={false}
          />
          <YAxis
            domain={yDomain}
            allowDecimals={false}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
          />
          {threshold && (
            <ReferenceLine
              y={threshold.value}
              stroke="var(--color-status-warning)"
              strokeDasharray="4 4"
              label={{ value: threshold.label, position: 'insideBottomRight', ...axisTick }}
            />
          )}
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(time) =>
              typeof time === 'number' ? formatLongDate(toDate(time)) : ''
            }
            formatter={(value, _name, item) => {
              const point = item.payload as TrendPoint;
              return [`${String(value)}${unit} (${describeCount(point.count)})`, title];
            }}
          />
          <Line
            type="linear"
            dataKey="value"
            stroke="var(--color-accent-purple)"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
