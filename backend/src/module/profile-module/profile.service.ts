import type { ProfileData } from '@itp/types';
import { NotFoundError } from '../../errors/AppError.js';
import { istDateString, istDayStart } from '../../utils/istDate.js';
import { ProgressService } from '../progress-module/progress.service.js';
import { buildDailyActivity, DAILY_ACTIVITY_DAYS } from './profile.daily.js';
import { ProfileRepository } from './profile.repository.js';

const profileRepository = new ProfileRepository();
const progressService = new ProgressService();

export class ProfileService {
  async getProfile(traineeId: string): Promise<ProfileData> {
    const now = new Date();
    const firstDate = istDateString(DAILY_ACTIVITY_DAYS - 1, now);

    const trainee = await profileRepository.findTrainee(traineeId);
    if (!trainee) throw new NotFoundError('Trainee not found.');

    // The current day is the UNLOCKED one. After the last day nothing is unlocked, so the profile
    // shows the last day of the last course. Statuses come in curriculum order.
    const statuses = await progressService.getDayStatuses(traineeId);
    const current =
      statuses.find((day) => day.status === 'UNLOCKED') ?? statuses[statuses.length - 1];
    if (!current) throw new NotFoundError('No curriculum found.');

    const [day, totals, latestTyping, activity, typing] = await Promise.all([
      profileRepository.findDayWithCourse(current.dayId),
      profileRepository.sumActivity(traineeId),
      profileRepository.findLatestTyping(traineeId),
      profileRepository.findActivitySince(traineeId, new Date(`${firstDate}T00:00:00.000Z`)),
      profileRepository.findTypingSince(traineeId, istDayStart(firstDate)),
    ]);
    if (!day) throw new NotFoundError('Day not found.');

    return {
      trainee: {
        name: trainee.name,
        email: trainee.email,
        track: day.course.title,
        currentDay: day.day_number,
        totalDays: day.course._count.days,
      },
      total: {
        activeSeconds: totals._sum.active_seconds ?? 0,
        codingSeconds: totals._sum.coding_seconds ?? 0,
      },
      typing: {
        latestWpm: latestTyping?.wpm ?? null,
        latestAccuracy: latestTyping?.accuracy ?? null,
      },
      dailyActivity: buildDailyActivity(activity, typing, now),
    };
  }
}
