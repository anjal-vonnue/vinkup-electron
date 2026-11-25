import { describe, expect, it } from 'vitest';
import { describeFlag, formatFlagDuration } from './adminLabels';

describe('formatFlagDuration', () => {
  it.each([
    [null, '—'],
    [0, '<1 s'],
    [999, '<1 s'],
    [1000, '1 s'],
    [12_400, '12 s'],
    [59_400, '59 s'],
    [125_000, '2 m 05 s'],
    [3_600_000, '60 m 00 s'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatFlagDuration(input)).toBe(expected);
  });
});

describe('describeFlag', () => {
  // 10:00 UTC = 15:30 IST; the server stamps an idle flag at the END of the stretch.
  const timestamp = '2026-10-05T10:00:00.000Z';

  it('gives an idle flag its length and start time, worded neutrally', () => {
    expect(describeFlag({ type: 'IDLE', durationMs: 18 * 60_000, timestamp })).toBe(
      'Idle for 18 min (from 15:12)'
    );
  });

  it('rounds to whole minutes and uses hours for long stretches', () => {
    expect(describeFlag({ type: 'IDLE', durationMs: 75 * 60_000 + 20_000, timestamp })).toBe(
      'Idle for 1 h 15 min (from 14:14)'
    );
  });

  it('leaves out the start time when the timestamp is not a date', () => {
    expect(describeFlag({ type: 'IDLE', durationMs: 18 * 60_000, timestamp: 'not a date' })).toBe(
      'Idle for 18 min'
    );
  });

  it('uses the plain label for every other flag type', () => {
    expect(describeFlag({ type: 'TAB_SWITCH', durationMs: 12_000, timestamp })).toBe(
      'Switched tab'
    );
  });
});
