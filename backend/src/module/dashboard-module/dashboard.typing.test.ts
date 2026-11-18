import { describe, expect, it } from 'vitest';
import { buildTypingSummary } from './dashboard.typing.js';

// 2026-10-01 10:00 in India (04:30 UTC).
const NOW = new Date('2026-10-01T04:30:00.000Z');

describe('buildTypingSummary', () => {
  it('returns nulls and an empty trend with no results', () => {
    expect(buildTypingSummary(null, [], NOW)).toEqual({
      latest: null,
      todayAverageWpm: null,
      trend: [],
    });
  });

  it('sends the latest attempt with its time as an ISO string', () => {
    const takenAt = new Date('2026-10-01T04:00:00.000Z');

    const summary = buildTypingSummary({ wpm: 74, accuracy: 96.4, taken_at: takenAt }, [], NOW);

    expect(summary.latest).toEqual({ wpm: 74, accuracy: 96.4, takenAt: takenAt.toISOString() });
  });

  it("rounds today's average and builds one rounded average per day, oldest first", () => {
    const summary = buildTypingSummary(
      null,
      [
        { wpm: 70, taken_at: new Date('2026-10-01T03:00:00.000Z') }, // today
        { wpm: 60, taken_at: new Date('2026-09-29T06:00:00.000Z') },
        { wpm: 73, taken_at: new Date('2026-10-01T04:00:00.000Z') }, // today
        { wpm: 65, taken_at: new Date('2026-09-29T07:00:00.000Z') },
      ],
      NOW
    );

    expect(summary.todayAverageWpm).toBe(72); // (70 + 73) / 2 = 71.5
    expect(summary.trend).toEqual([
      { date: '2026-09-29', averageWpm: 63 }, // (60 + 65) / 2 = 62.5
      { date: '2026-10-01', averageWpm: 72 },
    ]);
  });

  it('groups by the India calendar day, not the UTC day', () => {
    // 2026-09-30 20:00 UTC is 2026-10-01 01:30 in India, so it counts as today.
    const summary = buildTypingSummary(
      null,
      [{ wpm: 50, taken_at: new Date('2026-09-30T20:00:00.000Z') }],
      NOW
    );

    expect(summary.todayAverageWpm).toBe(50);
    expect(summary.trend).toEqual([{ date: '2026-10-01', averageWpm: 50 }]);
  });

  it('leaves todayAverageWpm null when the only results are from earlier days', () => {
    const summary = buildTypingSummary(
      null,
      [{ wpm: 66, taken_at: new Date('2026-09-28T06:00:00.000Z') }],
      NOW
    );

    expect(summary.todayAverageWpm).toBeNull();
    expect(summary.trend).toHaveLength(1);
  });
});
