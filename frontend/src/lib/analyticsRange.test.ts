import { describe, expect, it } from 'vitest';
import { ANALYTICS_PERIODS, DEFAULT_PERIOD_DAYS, periodRange } from './analyticsRange';

describe('periodRange', () => {
  it('covers the last N days, today included', () => {
    const now = new Date('2026-11-13T06:00:00.000Z'); // 11:30 in India
    expect(periodRange(7, now)).toEqual({ from: '2026-11-07', to: '2026-11-13' });
    expect(periodRange(1, now)).toEqual({ from: '2026-11-13', to: '2026-11-13' });
  });

  it('uses the India calendar day, not UTC', () => {
    // 20:00 UTC on 12 Nov is already 01:30 on 13 Nov in India.
    const now = new Date('2026-11-12T20:00:00.000Z');
    expect(periodRange(7, now)).toEqual({ from: '2026-11-07', to: '2026-11-13' });
  });

  it('crosses month and year boundaries', () => {
    const now = new Date('2026-01-02T06:00:00.000Z');
    expect(periodRange(5, now)).toEqual({ from: '2025-12-29', to: '2026-01-02' });
  });

  it('stays within the backend limit of 366 days for every period', () => {
    for (const period of ANALYTICS_PERIODS) expect(period.days).toBeLessThanOrEqual(366);
    expect(ANALYTICS_PERIODS.some((period) => period.days === DEFAULT_PERIOD_DAYS)).toBe(true);
  });
});
