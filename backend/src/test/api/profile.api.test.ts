import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ProfileData } from '@itp/types';
import { db } from './helpers/db.js';
import {
  DAY,
  freshTrainees,
  istDate,
  istDateString,
  markDayCompleted,
  minutesAgo,
  seedCurriculum,
  type TestTrainee,
} from './helpers/fixtures.js';
import { api, body } from './helpers/http.js';

let a: TestTrainee;
let b: TestTrainee;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a, b } = await freshTrainees());
});

async function getProfile(trainee: TestTrainee): Promise<ProfileData> {
  const res = await api.get('/api/profile', trainee.cookie);
  expect(res.status).toBe(200);
  return body<ProfileData>(res);
}

describe('GET /api/profile', () => {
  it('returns the trainee, day 1 of the first course, and zeros for a new trainee', async () => {
    const profile = await getProfile(a);

    expect(profile.trainee).toEqual({
      name: 'Trainee A',
      email: a.email,
      track: 'HTML',
      currentDay: 1,
      totalDays: 2,
    });

    expect(profile.total).toEqual({
      activeSeconds: 0,
      codingSeconds: 0,
    });

    expect(profile.typing).toEqual({
      latestWpm: null,
      latestAccuracy: null,
    });
  });

  it('lists the last 7 calendar days newest first, including days with no activity', async () => {
    const { dailyActivity } = await getProfile(a);

    expect(dailyActivity).toHaveLength(7);
    expect(dailyActivity.map((d) => d.date)).toEqual(
      [0, 1, 2, 3, 4, 5, 6].map((n) => istDateString(n))
    );

    expect(dailyActivity.map((d) => d.isToday)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);

    for (const day of dailyActivity) {
      expect(day.timeSpentSeconds).toBe(0);
      expect(day.typingWpm).toBeNull();
    }
  });

  it('fills each day with its active time and rounded average WPM', async () => {
    await db.activity_log.createMany({
      data: [
        {
          trainee_id: a.id,
          date: istDate(0),
          active_seconds: 3600,
          coding_seconds: 2000,
        },
        {
          trainee_id: a.id,
          date: istDate(2),
          active_seconds: 1200,
          coding_seconds: 800,
        },
        {
          trainee_id: a.id,
          date: istDate(10),
          active_seconds: 5000,
          coding_seconds: 2500,
        },
      ],
    });

    await db.typing_test_result.createMany({
      data: [
        { trainee_id: a.id, wpm: 70, accuracy: 95, taken_at: minutesAgo(20) },
        { trainee_id: a.id, wpm: 73, accuracy: 98.4, taken_at: minutesAgo(5) },
      ],
    });

    const profile = await getProfile(a);

    expect(profile.dailyActivity[0]).toEqual({
      date: istDateString(0),
      timeSpentSeconds: 3600,
      typingWpm: 72,
      isToday: true,
    });

    expect(profile.dailyActivity[2]).toMatchObject({
      timeSpentSeconds: 1200,
      typingWpm: null,
    });

    // Totals cover all time, not only the last 7 days.
    // Active time already includes coding time.
    expect(profile.total).toEqual({
      activeSeconds: 9800,
      codingSeconds: 5300,
    });

    expect(profile.typing).toEqual({
      latestWpm: 73,
      latestAccuracy: 98.4,
    });
  });

  it('moves the track to the course of the current day', async () => {
    await markDayCompleted(a.id, DAY.html1);

    expect((await getProfile(a)).trainee).toMatchObject({
      track: 'HTML',
      currentDay: 2,
      totalDays: 2,
    });

    await markDayCompleted(a.id, DAY.html2);

    expect((await getProfile(a)).trainee).toMatchObject({
      track: 'PostgreSQL',
      currentDay: 1,
      totalDays: 1,
    });
  });

  it('shows the last course and its last day once everything is completed', async () => {
    await markDayCompleted(a.id, DAY.html1);
    await markDayCompleted(a.id, DAY.html2);
    await markDayCompleted(a.id, DAY.pg1);

    expect((await getProfile(a)).trainee).toMatchObject({
      track: 'PostgreSQL',
      currentDay: 1,
      totalDays: 1,
    });
  });

  it("never includes another trainee's data", async () => {
    await markDayCompleted(b.id, DAY.html1);

    await db.activity_log.create({
      data: {
        trainee_id: b.id,
        date: istDate(0),
        active_seconds: 999,
        coding_seconds: 500,
      },
    });

    await db.typing_test_result.create({
      data: {
        trainee_id: b.id,
        wpm: 99,
        accuracy: 99,
      },
    });

    const profile = await getProfile(a);

    expect(profile.trainee).toMatchObject({
      name: 'Trainee A',
      currentDay: 1,
    });

    expect(profile.total).toEqual({
      activeSeconds: 0,
      codingSeconds: 0,
    });

    expect(profile.typing.latestWpm).toBeNull();
  });
});
