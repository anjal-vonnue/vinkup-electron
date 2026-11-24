import { describe, expect, it } from 'vitest';
import { IDLE_FLAG_AFTER_MS, idleDurationToReport } from './idleTracker';

describe('idleDurationToReport', () => {
  it('uses a 10-minute threshold', () => {
    expect(IDLE_FLAG_AFTER_MS).toBe(10 * 60_000);
  });

  it('returns null for a stretch shorter than the threshold', () => {
    expect(idleDurationToReport(0, IDLE_FLAG_AFTER_MS - 1)).toBeNull();
  });

  it('reports a stretch of exactly the threshold', () => {
    expect(idleDurationToReport(0, IDLE_FLAG_AFTER_MS)).toBe(IDLE_FLAG_AFTER_MS);
  });

  it('returns the whole stretch, not only the part over the threshold', () => {
    const start = 1_000_000;
    expect(idleDurationToReport(start, start + 18 * 60_000)).toBe(18 * 60_000);
  });
});
