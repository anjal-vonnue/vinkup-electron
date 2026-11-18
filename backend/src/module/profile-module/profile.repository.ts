import { prisma } from '../../lib/prisma.js';

export class ProfileRepository {
  findTrainee = (traineeId: string) => {
    return prisma.trainee.findUnique({
      where: { id: traineeId },
      select: { name: true, email: true },
    });
  };

  /** A day with its course's title and how many days that course has. */
  findDayWithCourse = (dayId: string) => {
    return prisma.curriculum_day.findUnique({
      where: { id: dayId },
      select: {
        day_number: true,
        course: {
          select: {
            title: true,
            _count: { select: { days: true } },
          },
        },
      },
    });
  };

  /** All-time totals. The sums are null when the trainee has no activity rows. */
  sumActivity = (traineeId: string) => {
    return prisma.activity_log.aggregate({
      where: { trainee_id: traineeId },
      _sum: { active_seconds: true, coding_seconds: true },
    });
  };

  findActivitySince = (traineeId: string, since: Date) => {
    return prisma.activity_log.findMany({
      where: { trainee_id: traineeId, date: { gte: since } },
      select: { date: true, active_seconds: true },
    });
  };

  findLatestTyping = (traineeId: string) => {
    return prisma.typing_test_result.findFirst({
      where: { trainee_id: traineeId },
      orderBy: { taken_at: 'desc' },
      select: { wpm: true, accuracy: true },
    });
  };

  findTypingSince = (traineeId: string, since: Date) => {
    return prisma.typing_test_result.findMany({
      where: { trainee_id: traineeId, taken_at: { gte: since } },
      select: { wpm: true, taken_at: true },
    });
  };
}
