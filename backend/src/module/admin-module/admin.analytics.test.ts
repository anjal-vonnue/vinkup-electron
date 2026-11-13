import { describe, expect, it } from 'vitest';
import {
  buildIntegrityTrend,
  buildProgressTrend,
  buildTaskStatus,
  buildTraineeComparison,
  buildTypingTrend,
  listDates,
} from './admin.analytics';
import type { FlagRow, ProgressRow } from './integrity.overall';

describe('listDates', () => {
  it('lists every day from `from` to `to`, both included', () => {
    expect(listDates('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('returns one day when from and to are the same', () => {
    expect(listDates('2026-11-05', '2026-11-05')).toEqual(['2026-11-05']);
  });
});

describe('buildProgressTrend', () => {
  const dates = ['2026-11-01', '2026-11-02', '2026-11-03'];

  it('averages the days completed so far over all trainees, including older completions', () => {
    // 2 trainees. One completion before the period, one on day 1, two on day 3.
    const completionDates = ['2026-10-20', '2026-11-01', '2026-11-03', '2026-11-03'];

    expect(buildProgressTrend(dates, completionDates, 2)).toEqual([
      { date: '2026-11-01', averageDaysCompleted: 1 },
      { date: '2026-11-02', averageDaysCompleted: 1 },
      { date: '2026-11-03', averageDaysCompleted: 2 },
    ]);
  });

  it('rounds to one decimal place', () => {
    expect(buildProgressTrend(['2026-11-01'], ['2026-11-01'], 3)).toEqual([
      { date: '2026-11-01', averageDaysCompleted: 0.3 },
    ]);
  });

  it('returns 0 for every day when there are no trainees', () => {
    expect(buildProgressTrend(dates, [], 0).map((point) => point.averageDaysCompleted)).toEqual([
      0, 0, 0,
    ]);
  });
});

describe('buildTraineeComparison', () => {
  it('gives every trainee a row, with zeros when they have no data', () => {
    const rows = buildTraineeComparison(
      [
        { id: 't1', name: 'Asha' },
        { id: 't2', name: 'Ravi' },
      ],
      new Map([['t1', 5]]),
      [{ traineeId: 't1', activeSeconds: 3600, codingSeconds: 1800 }],
      54
    );

    expect(rows).toEqual([
      {
        traineeId: 't1',
        name: 'Asha',
        daysCompleted: 5,
        totalDays: 54,
        codingSeconds: 1800,
        activeSeconds: 3600,
      },
      {
        traineeId: 't2',
        name: 'Ravi',
        daysCompleted: 0,
        totalDays: 54,
        codingSeconds: 0,
        activeSeconds: 0,
      },
    ]);
  });
});

describe('buildTaskStatus', () => {
  it('counts tasks nobody opened as not started', () => {
    // 2 trainees x 10 tasks = 20 tasks in total.
    const status = buildTaskStatus(
      [
        { status: 'completed', count: 6 },
        { status: 'in_progress', count: 3 },
        { status: 'not_started', count: 1 },
      ],
      10,
      2
    );

    expect(status).toEqual({ completed: 6, inProgress: 3, notStarted: 11 });
  });

  it('returns all zeros when there are no trainees', () => {
    expect(buildTaskStatus([], 10, 0)).toEqual({ completed: 0, inProgress: 0, notStarted: 0 });
  });
});

describe('buildTypingTrend', () => {
  it("averages each trainee's latest WPM, one point per day with a test", () => {
    const trend = buildTypingTrend(
      [
        { traineeId: 'a', date: '2026-11-01', wpm: 30 },
        { traineeId: 'b', date: '2026-11-03', wpm: 50 },
        { traineeId: 'a', date: '2026-11-03', wpm: 35 },
      ],
      '2026-11-01'
    );

    expect(trend).toEqual([
      { date: '2026-11-01', averageWpm: 30, traineesIncluded: 1 },
      // a's latest is now 35, b's is 50 -> 42.5 rounds to 43
      { date: '2026-11-03', averageWpm: 43, traineesIncluded: 2 },
    ]);
  });

  it('does not swing when a slower trainee tests on a different day', () => {
    // Day 1 only a (90) tests, day 2 only b (40) tests. Both are counted on day 2.
    const trend = buildTypingTrend(
      [
        { traineeId: 'a', date: '2026-11-01', wpm: 90 },
        { traineeId: 'b', date: '2026-11-02', wpm: 40 },
      ],
      '2026-11-01'
    );

    expect(trend.map((point) => point.averageWpm)).toEqual([90, 65]);
  });

  it('starts at the right level by using tests from before the period', () => {
    const trend = buildTypingTrend(
      [
        { traineeId: 'a', date: '2026-10-20', wpm: 60 }, // before the period
        { traineeId: 'b', date: '2026-11-05', wpm: 40 },
      ],
      '2026-11-01'
    );

    expect(trend).toEqual([{ date: '2026-11-05', averageWpm: 50, traineesIncluded: 2 }]);
  });

  it('returns an empty list when there are no results', () => {
    expect(buildTypingTrend([], '2026-11-01')).toEqual([]);
  });
});

describe('buildIntegrityTrend', () => {
  const progress: ProgressRow[] = [
    { traineeId: 't1', taskId: 'task-a', dayId: 'day-1' },
    { traineeId: 't2', taskId: 'task-a', dayId: 'day-1' },
    { traineeId: 't1', taskId: 'task-b', dayId: 'day-2' },
  ];
  // One blocked paste (NORMAL priority = 10 x 1.5 = 15 points) for t2 on day-1.
  const flags: FlagRow[] = [
    {
      traineeId: 't2',
      dayId: 'day-1',
      taskId: 'task-a',
      type: 'PASTE_BLOCKED',
      reviewPriority: 'NORMAL',
      durationMs: null,
    },
  ];

  it('scores a completed day with no flags as 100', () => {
    const trend = buildIntegrityTrend(
      [{ traineeId: 't1', dayId: 'day-1', date: '2026-11-02' }],
      progress,
      [],
      '2026-11-01'
    );

    expect(trend).toEqual([{ date: '2026-11-02', averageScore: 100, daysScored: 1 }]);
  });

  it("averages every completed day so far, using only that trainee's flags for that day", () => {
    const trend = buildIntegrityTrend(
      [
        { traineeId: 't1', dayId: 'day-1', date: '2026-11-02' }, // 100
        { traineeId: 't2', dayId: 'day-1', date: '2026-11-02' }, // 85
        { traineeId: 't1', dayId: 'day-2', date: '2026-11-04' }, // 100
      ],
      progress,
      flags,
      '2026-11-01'
    );

    expect(trend).toEqual([
      { date: '2026-11-02', averageScore: 93, daysScored: 2 }, // (100 + 85) / 2 = 92.5
      { date: '2026-11-04', averageScore: 95, daysScored: 3 }, // (100 + 85 + 100) / 3 = 95
    ]);
  });

  it('counts days completed before the period, but only gives points inside it', () => {
    const trend = buildIntegrityTrend(
      [
        { traineeId: 't2', dayId: 'day-1', date: '2026-10-20' }, // 85, before the period
        { traineeId: 't1', dayId: 'day-1', date: '2026-11-02' }, // 100
      ],
      progress,
      flags,
      '2026-11-01'
    );

    expect(trend).toEqual([{ date: '2026-11-02', averageScore: 93, daysScored: 2 }]);
  });

  it('leaves out a completed day where no task was worked on', () => {
    const trend = buildIntegrityTrend(
      [{ traineeId: 't1', dayId: 'day-9', date: '2026-11-02' }],
      progress,
      [],
      '2026-11-01'
    );

    expect(trend).toEqual([]);
  });
});
