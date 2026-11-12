import { prisma } from '../../lib/prisma';

export class TypingRepository {
  createResult(traineeId: string, wpm: number, accuracy: number) {
    return prisma.typing_test_result.create({
      data: { trainee_id: traineeId, wpm, accuracy },
      select: { id: true, wpm: true, accuracy: true, taken_at: true },
    });
  }

  findResults(traineeId: string) {
    return prisma.typing_test_result.findMany({
      where: { trainee_id: traineeId },
      orderBy: [{ taken_at: 'desc' }, { id: 'desc' }],
      take: 10,
      select: { id: true, wpm: true, accuracy: true, taken_at: true },
    });
  }
}
