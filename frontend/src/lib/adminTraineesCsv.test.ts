import { describe, expect, it } from 'vitest';
import type { AdminTraineeSummary } from '@itp/types';
import { toCsv } from './adminTrainees';

const HEADER =
  'Trainee,Email,Progress,Current day,Today,Total active,WPM,Integrity Score,Last active';

function trainee(overrides: Partial<AdminTraineeSummary> = {}): AdminTraineeSummary {
  return {
    id: 't1',
    name: 'Asha Rao',
    email: 'asha.rao@vonnue.com',
    daysCompleted: 12,
    totalDays: 54,
    currentDay: { id: 'js-day-03', courseTitle: 'JavaScript', dayNumber: 3, title: 'Functions' },
    todayActiveSeconds: 5_400,
    totalActiveSeconds: 153_000,
    totalCodingSeconds: 61_800,
    lastActiveDate: '2026-10-07',
    latestWpm: 48,
    flagsLast7Days: 2,
    averageScore: 85,
    daysScored: 23,
    pendingReviewItems: [],
    ...overrides,
  };
}

describe('toCsv', () => {
  it("starts with the header row: the table's columns, plus email", () => {
    expect(toCsv([trainee()]).split('\n')[0]).toBe(HEADER);
  });

  it('writes one row per trainee, with the table values', () => {
    const csv = toCsv([
      trainee(),
      trainee({
        id: 't2',
        name: 'Ben Cole',
        email: 'ben.cole@vonnue.com',
        daysCompleted: 0,
        currentDay: {
          id: 'html-day-01',
          courseTitle: 'HTML',
          dayNumber: 1,
          title: 'Structure',
        },
        todayActiveSeconds: 0,
        totalActiveSeconds: 0,
        totalCodingSeconds: 0,
        lastActiveDate: null,
        latestWpm: null,
        flagsLast7Days: 0,
      }),
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

    expect(
      csv
        .split('\n')
        .slice(1)
        .map((line) => line.split(',')[0])
    ).toEqual(['Zed', 'Amy', 'Mia']);
  });

  it('wraps a value that contains a comma in quotes', () => {
    const csv = toCsv([trainee({ name: 'John, Doe' })]);

    expect(csv.split('\n')[1].startsWith('"John, Doe",asha.rao@vonnue.com,')).toBe(true);
  });

  it('doubles the double quotes in a value and wraps it in quotes', () => {
    const csv = toCsv([trainee({ name: 'John "JD" Doe' })]);

    expect(csv.split('\n')[1].startsWith('"John ""JD"" Doe",')).toBe(true);
  });

  it('escapes a value that has both a comma and quotes', () => {
    const csv = toCsv([trainee({ name: 'Doe, "JD"' })]);

    expect(csv.split('\n')[1].startsWith('"Doe, ""JD""",')).toBe(true);
  });

  it('keeps a line break inside one quoted value', () => {
    const csv = toCsv([trainee({ name: 'Line\nBreak' })]);

    expect(csv).toContain('"Line\nBreak",asha.rao@vonnue.com');
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

    expect(csv.split('\n')[1]).toContain(',54 / 54,Finished,');
  });

  it('shows a dash for a trainee with no typing result, like the table', () => {
    const csv = toCsv([trainee({ latestWpm: null })]);

    expect(csv.split('\n')[1]).toContain(',—,85/100,');
  });

  it('shows a dash for a trainee with no integrity score', () => {
    const csv = toCsv([
      trainee({
        averageScore: null,
        daysScored: 0,
        lastActiveDate: null,
      }),
    ]);

    expect(csv.split('\n')[1]).toContain(',—,Never');
  });

  it('exports the integrity score', () => {
    const csv = toCsv([
      trainee({
        averageScore: 92,
        daysScored: 5,
      }),
    ]);

    expect(csv.split('\n')[1]).toContain(',92/100,');
  });

  it('says Never for a trainee who has not logged any time, like the table', () => {
    const csv = toCsv([trainee({ lastActiveDate: null })]);

    expect(csv.split('\n')[1].endsWith(',Never')).toBe(true);
  });

  it('produces just the header row for an empty list', () => {
    expect(toCsv([])).toBe(HEADER);
  });
});
