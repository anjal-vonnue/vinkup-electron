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
