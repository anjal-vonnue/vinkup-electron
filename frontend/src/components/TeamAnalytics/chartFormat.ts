/** "2026-11-13" -> "13 Nov" (chart axes) */
export function formatShortDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

/** "2026-11-13" -> "13 Nov 2026" (subtitles and tooltips) */
export function formatLongDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * A period for the subtitle, without repeating what is the same:
 * "13 Nov 2026" (one day), "1 Nov – 15 Nov 2026" (same year), "20 Dec 2025 – 5 Jan 2026".
 */
export function formatDateRange(from: string, to: string): string {
  if (from === to) return formatLongDate(from);
  if (from.slice(0, 4) === to.slice(0, 4))
    return `${formatShortDate(from)} – ${formatLongDate(to)}`;
  return `${formatLongDate(from)} – ${formatLongDate(to)}`;
}

const HALF_DAY_MS = 12 * 60 * 60 * 1000;

/**
 * The time axis (local-midnight times) for a chart over the chosen period. A single day would
 * give an axis with no width, so it gets half a day on each side and that day as its only label.
 */
export function timeAxis(from: string, to: string): { domain: [number, number]; ticks?: number[] } {
  const toTime = (date: string) => Date.parse(`${date}T00:00:00`);
  if (from !== to) return { domain: [toTime(from), toTime(to)] };
  const day = toTime(from);
  return { domain: [day - HALF_DAY_MS, day + HALF_DAY_MS], ticks: [day] };
}

/** Tooltip box in the app's colours (light and dark theme). */
export const tooltipStyle = {
  background: 'var(--color-bg-card)',
  border: '1px solid var(--color-border-card)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-text-primary)',
};

/** Axis labels in the app's colours. */
export const axisTick = { fontSize: 12, fill: 'var(--color-text-tertiary)' };
