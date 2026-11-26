import { describe, expect, it } from 'vitest';
import { formatDateRange, timeAxis } from './chartFormat';

describe('timeAxis', () => {
  const midnight = (date: string) => Date.parse(`${date}T00:00:00`);

  it('runs from the first to the last day of a normal period', () => {
    expect(timeAxis('2026-11-01', '2026-11-15')).toEqual({
      domain: [midnight('2026-11-01'), midnight('2026-11-15')],
    });
  });

  it('gives a single day some width and one label', () => {
    const day = midnight('2026-11-13');
    const halfDay = 12 * 60 * 60 * 1000;
    expect(timeAxis('2026-11-13', '2026-11-13')).toEqual({
      domain: [day - halfDay, day + halfDay],
      ticks: [day],
    });
  });
});

describe('formatDateRange', () => {
  it('shows a single day once', () => {
    expect(formatDateRange('2026-11-13', '2026-11-13')).toBe('13 Nov 2026');
  });

  it('shows the year once when both dates are in the same year', () => {
    expect(formatDateRange('2026-11-01', '2026-11-15')).toBe('1 Nov – 15 Nov 2026');
  });

  it('shows both years when the range crosses a new year', () => {
    expect(formatDateRange('2025-12-20', '2026-01-05')).toBe('20 Dec 2025 – 5 Jan 2026');
  });
});
