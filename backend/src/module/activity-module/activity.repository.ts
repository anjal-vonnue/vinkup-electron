import { prisma } from '../../lib/prisma.js';
import type { ActivityTimeBodyType } from './activity.schema.js';

export class ActivityRepository {
  addTime = (traineeId: string, body: ActivityTimeBodyType) => {
    return prisma.activity_log.upsert({
      where: { trainee_id_date: { trainee_id: traineeId, date: body.date } },
      create: {
        trainee_id: traineeId,
        date: body.date,
        active_seconds: body.activeSeconds,
        coding_seconds: body.codingSeconds,
      },
      update: {
        active_seconds: { increment: body.activeSeconds },
        coding_seconds: { increment: body.codingSeconds },
      },
      select: { id: true },
    });
  };
  findDaysSince = (traineeId: string, since: Date) => {
    return prisma.activity_log.findMany({
      where: { trainee_id: traineeId, date: { gte: since }, active_seconds: { gt: 0 } },
      orderBy: { date: 'desc' },
      select: { date: true, active_seconds: true, coding_seconds: true },
    });
  };
}
