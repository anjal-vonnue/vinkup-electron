import { describe, expect, it } from 'vitest';
import { formatIstDateTime, formatIstTime } from './formatDateTime';

describe('formatIstDateTime', () => {
  it('shows the time in Asia/Kolkata, whatever the machine timezone is', () => {
    expect(formatIstDateTime('2026-10-22T12:12:00.000Z')).toBe('22 Oct 2026, 17:42');
  });

  it('rolls over to the next calendar day in IST', () => {
    expect(formatIstDateTime('2026-10-22T20:00:00.000Z')).toBe('23 Oct 2026, 01:30');
  });

  it('returns a dash for a value that is not a date', () => {
    expect(formatIstDateTime('not a date')).toBe('—');
  });
});

describe('formatIstTime', () => {
  it('shows only the time, in Asia/Kolkata', () => {
    expect(formatIstTime('2026-10-22T12:12:00.000Z')).toBe('17:42');
  });

  it('returns a dash for a value that is not a date', () => {
    expect(formatIstTime('not a date')).toBe('—');
  });
});
