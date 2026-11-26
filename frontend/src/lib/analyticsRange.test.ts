import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_PERIODS,
  DEFAULT_PERIOD_DAYS,
  MAX_RANGE_DAYS,
  customRangeError,
  periodRange,
} from './analyticsRange';

describe('customRangeError', () => {
  const today = '2026-11-26';

  it('accepts a normal range', () => {
    expect(customRangeError('2026-11-01', '2026-11-15', today)).toBeNull();
  });

  it('accepts a single day, including today', () => {
    expect(customRangeError('2026-11-13', '2026-11-13', today)).toBeNull();
    expect(customRangeError(today, today, today)).toBeNull();
  });

  it('asks for both dates when one is empty', () => {
    expect(customRangeError('', '2026-11-15', today)).toBe('Choose both dates.');
    expect(customRangeError('2026-11-01', '', today)).toBe('Choose both dates.');
  });

  it('rejects a "To" date in the future', () => {
    expect(customRangeError('2026-11-01', '2026-11-27', today)).toBe('“To” can’t be after today.');
  });

  it('rejects "From" after "To"', () => {
    expect(customRangeError('2026-11-15', '2026-11-01', today)).toBe(
      '“From” must be on or before “To”.'
    );
  });

  it('allows exactly 366 days but not 367', () => {
    // 2025-11-26 .. 2026-11-26 is 366 days, both ends included.
    expect(customRangeError('2025-11-26', today, today)).toBeNull();
    expect(customRangeError('2025-11-25', today, today)).toBe(
      `Choose a range of at most ${MAX_RANGE_DAYS} days.`
    );
  });

  it('uses today in India time by default', () => {
    expect(customRangeError('2020-01-01', '2999-01-01')).toBe('“To” can’t be after today.');
  });
});

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
