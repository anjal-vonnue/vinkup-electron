import { describe, expect, it } from 'vitest';
import { istDateString, istDateValue, istDayStart, toIstDateString } from './istDate.js';

describe('istDate', () => {
  // 20:00 UTC on 14 Oct is 01:30 on 15 Oct in India.
  const now = new Date('2026-10-14T20:00:00.000Z');

  it('uses the Asia/Kolkata calendar day, not the UTC one', () => {
    expect(istDateString(0, now)).toBe('2026-10-15');
  });

  it('counts days back from there', () => {
    expect(istDateString(1, now)).toBe('2026-10-14');
    expect(istDateString(6, now)).toBe('2026-10-09');
  });

  it('gives the calendar day that contains a moment', () => {
    expect(toIstDateString(new Date('2026-10-14T18:29:59.000Z'))).toBe('2026-10-14');
    expect(toIstDateString(new Date('2026-10-14T18:30:00.000Z'))).toBe('2026-10-15');
  });

  it('gives midnight UTC for a @db.Date column', () => {
    expect(istDateValue(0, now).toISOString()).toBe('2026-10-15T00:00:00.000Z');
  });

  it('gives the moment a calendar day began in India', () => {
    expect(istDayStart('2026-10-15').toISOString()).toBe('2026-10-14T18:30:00.000Z');
  });
});
