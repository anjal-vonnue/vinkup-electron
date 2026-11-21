import { describe, expect, it } from 'vitest';
import type { AdminTraineeSummary } from '@itp/types';
import { summarizeCohort, toCsv } from './adminTrainees';

function trainee(overrides: Partial<AdminTraineeSummary> = {}): AdminTraineeSummary {
  return {
    id: 't-1',
    name: 'Trainee',
    email: 'trainee@vonnue.com',
    daysCompleted: 0,
    totalDays: 54,
    currentDay: { id: 'html-day-01', courseTitle: 'HTML', dayNumber: 1, title: 'Structure' },
    todayActiveSeconds: 0,
    totalActiveSeconds: 0,
    totalCodingSeconds: 0,
    lastActiveDate: null,
    latestWpm: null,
    flagsLast7Days: 0,
    averageScore: 85,
    daysScored: 23,
    pendingReviewItems: [],
    ...overrides,
  };
}

describe('summarizeCohort', () => {
  it('returns zeros for an empty list (no division by zero)', () => {
    expect(summarizeCohort([])).toEqual({
      traineeCount: 0,
      finishedCount: 0,
      averageProgressPercent: 0,
      averageDaysCompleted: 0,
      totalDays: 0,
      activeTodayCount: 0,
      flagsThisWeek: 0,
      flaggedTraineeCount: 0,
    });
  });

  it('summarises a mixed cohort', () => {
    const summary = summarizeCohort([
      trainee({ id: 'a', daysCompleted: 27, todayActiveSeconds: 900, flagsLast7Days: 0 }),
      trainee({ id: 'b', daysCompleted: 0, todayActiveSeconds: 0, flagsLast7Days: 3 }),
      trainee({
        id: 'c',
        daysCompleted: 54,
        currentDay: null,
        todayActiveSeconds: 60,
        flagsLast7Days: 2,
      }),
    ]);

    expect(summary).toEqual({
      traineeCount: 3,
      finishedCount: 1,
      averageProgressPercent: 50,
      averageDaysCompleted: 27,
      totalDays: 54,
      activeTodayCount: 2,
      flagsThisWeek: 5,
      flaggedTraineeCount: 2,
    });
  });

  it('rounds average progress to a whole number and average days to one decimal', () => {
    const summary = summarizeCohort([
      trainee({ daysCompleted: 7 }),
      trainee({ daysCompleted: 8 }),
      trainee({ daysCompleted: 7 }),
    ]);

    expect(summary.averageDaysCompleted).toBe(7.3);
    expect(summary.averageProgressPercent).toBe(14);
  });

  it('does not count a trainee with zero seconds today as active', () => {
    const summary = summarizeCohort([
      trainee({ todayActiveSeconds: 0 }),
      trainee({ todayActiveSeconds: 1 }),
    ]);

    expect(summary.activeTodayCount).toBe(1);
  });

  it('uses each trainee’s own curriculum length and never exceeds 100%', () => {
    const summary = summarizeCohort([
      trainee({ daysCompleted: 10, totalDays: 10 }),
      trainee({ daysCompleted: 12, totalDays: 10 }),
    ]);

    expect(summary.averageProgressPercent).toBe(100);
  });

  it('treats a curriculum of 0 days as 0% instead of failing', () => {
    expect(summarizeCohort([trainee({ totalDays: 0 })]).averageProgressPercent).toBe(0);
  });

  it('does not change the list it is given', () => {
    const list = [trainee({ id: 'b' }), trainee({ id: 'a' })];
    const copy = structuredClone(list);

    summarizeCohort(list);

    expect(list).toEqual(copy);
  });
});

describe('toCsv', () => {
  const HEADER =
    'Trainee,Email,Progress,Current day,Today,Total active,WPM,Integrity Score,Last active';

  /** The data rows, one string per trainee. */
  const rowsOf = (csv: string) => csv.split('\n').slice(1);

  it('starts with the header row: the table’s columns, plus email', () => {
    expect(toCsv([trainee()]).split('\n')[0]).toBe(HEADER);
  });

  it('writes one row per trainee, with the values the table shows', () => {
    const csv = toCsv([
      trainee({
        name: 'Asha Rao',
        email: 'asha.rao@vonnue.com',
        daysCompleted: 12,
        currentDay: {
          id: 'js-day-03',
          courseTitle: 'JavaScript',
          dayNumber: 3,
          title: 'Functions',
        },
        todayActiveSeconds: 5_400,
        totalActiveSeconds: 153_000,
        latestWpm: 48,
        lastActiveDate: '2026-10-07',
      }),
      trainee({ name: 'Ben Cole', email: 'ben.cole@vonnue.com' }),
    ]);

    expect(csv.split('\n')).toEqual([
      HEADER,
      'Asha Rao,asha.rao@vonnue.com,12 / 54,JavaScript · Day 3 — Functions,1h 30m,42h 30m,48,85/100,2026-10-07',
      'Ben Cole,ben.cole@vonnue.com,0 / 54,HTML · Day 1 — Structure,0h 0m,0h 0m,—,85/100,Never',
    ]);
  });

  it('keeps the rows in the order it was given', () => {
    const csv = toCsv([
      trainee({ name: 'Zed' }),
      trainee({ name: 'Amy' }),
      trainee({ name: 'Mia' }),
    ]);

    expect(rowsOf(csv).map((line) => line.split(',')[0])).toEqual(['Zed', 'Amy', 'Mia']);
  });

  it('wraps a value that contains a comma in quotes', () => {
    const csv = toCsv([trainee({ name: 'John, Doe' })]);

    expect(rowsOf(csv)[0].startsWith('"John, Doe",trainee@vonnue.com,')).toBe(true);
  });

  it('doubles the double quotes in a value and wraps it in quotes', () => {
    const csv = toCsv([trainee({ name: 'John "JD" Doe' })]);

    expect(rowsOf(csv)[0].startsWith('"John ""JD"" Doe",trainee@vonnue.com,')).toBe(true);
  });

  it('escapes a value that has both a comma and quotes', () => {
    const csv = toCsv([trainee({ name: 'Doe, "JD"' })]);

    expect(rowsOf(csv)[0].startsWith('"Doe, ""JD""",trainee@vonnue.com,')).toBe(true);
  });

  it('keeps a line break inside one quoted value', () => {
    const csv = toCsv([trainee({ name: 'Line\nBreak' })]);

    expect(csv).toContain('"Line\nBreak",trainee@vonnue.com,');
  });

  it('escapes the day title as well, since it is data too', () => {
    const csv = toCsv([
      trainee({
        currentDay: {
          id: 'x',
          courseTitle: 'CSS',
          dayNumber: 2,
          title: 'Boxes, margins & "gaps"',
        },
      }),
    ]);

    expect(csv).toContain(',"CSS · Day 2 — Boxes, margins & ""gaps""",');
  });

  it('says Finished for a trainee who has no day left, like the table', () => {
    const csv = toCsv([trainee({ currentDay: null, daysCompleted: 54 })]);

    expect(rowsOf(csv)[0]).toContain(',54 / 54,Finished,');
  });

  it('shows a dash for a trainee with no typing result, like the table', () => {
    expect(rowsOf(toCsv([trainee({ latestWpm: null })]))[0]).toContain(',0h 0m,—,85/100,');

    expect(rowsOf(toCsv([trainee({ latestWpm: 0 })]))[0]).toContain(',0h 0m,0,85/100,');
  });

  it('says Never for a trainee who has not logged any time, like the table', () => {
    expect(rowsOf(toCsv([trainee({ lastActiveDate: null })]))[0].endsWith(',Never')).toBe(true);
  });

  it('produces just the header row for an empty list', () => {
    expect(toCsv([])).toBe(HEADER);
  });

  it('does not change the list it is given', () => {
    const list = [trainee({ name: 'Zed' }), trainee({ name: 'Amy' })];
    const copy = structuredClone(list);

    toCsv(list);

    expect(list).toEqual(copy);
  });

  it('exports the integrity score like the table', () => {
    expect(rowsOf(toCsv([trainee({ averageScore: 92 })]))[0]).toContain(',92/100,');
  });

  it('shows a dash when the integrity score is unavailable', () => {
    expect(
      rowsOf(
        toCsv([
          trainee({
            averageScore: null,
            daysScored: 0,
            lastActiveDate: null,
          }),
        ])
      )[0]
    ).toContain(',—,Never');
  });
});
