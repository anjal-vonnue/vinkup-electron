import type { ActivityTimeBodyType } from './activity.schema.js';
import { ActivityRepository } from './activity.repository.js';
import type { ActivityTimeDay } from '@itp/types';

const DAY_MS = 86_400_000;
function platformDate(now: Date): Date {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now); // YYYY-MM-DD
  return new Date(`${day}T00:00:00.000Z`);
}

export class ActivityService {
  private readonly repository: ActivityRepository;

  constructor(repository = new ActivityRepository()) {
    this.repository = repository;
  }

  addTime = async (traineeId: string, body: ActivityTimeBodyType) => {
    await this.repository.addTime(traineeId, body);
  };
  /** The last `days` calendar days including today, newest first, only days with activity. */
  listTime = async (traineeId: string, days: number): Promise<ActivityTimeDay[]> => {
    const since = new Date(platformDate(new Date()).getTime() - (days - 1) * DAY_MS);
    const rows = await this.repository.findDaysSince(traineeId, since);

    return rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      activeSeconds: row.active_seconds,
      codingSeconds: row.coding_seconds,
    }));
  };
}
