import type { TypingResultRecord } from '@itp/types';
import { TypingRepository } from './typing.repository';

const typingRepository = new TypingRepository();

function toTypingResultRecord(row: {
  id: string;
  wpm: number;
  accuracy: number;
  taken_at: Date;
}): TypingResultRecord {
  return {
    id: row.id,
    wpm: row.wpm,
    accuracy: Math.round(row.accuracy * 10) / 10,
    takenAt: row.taken_at.toISOString(),
  };
}

export class TypingService {
  async createResult(traineeId: string, wpm: number, accuracy: number) {
    const roundedAccuracy = Math.round(accuracy * 10) / 10;
    const row = await typingRepository.createResult(traineeId, wpm, roundedAccuracy);
    return toTypingResultRecord(row);
  }

  async getResults(traineeId: string): Promise<TypingResultRecord[]> {
    const rows = await typingRepository.findResults(traineeId);
    return rows.map(toTypingResultRecord);
  }

  async getStats(traineeId: string) {
    const [recentResults, highestResult] = await Promise.all([
      typingRepository.findResults(traineeId),
      typingRepository.findHighestResult(traineeId),
    ]);

    const averageWpm =
      recentResults.length > 0
        ? recentResults.reduce((sum, result) => sum + result.wpm, 0) / recentResults.length
        : 0;

    const averageAccuracy =
      recentResults.length > 0
        ? recentResults.reduce((sum, result) => sum + result.accuracy, 0) / recentResults.length
        : 0;

    return {
      averageWpm: Math.round(averageWpm * 10) / 10,
      averageAccuracy: Math.round(averageAccuracy * 10) / 10,
      highestWpm: highestResult?.wpm ?? null,
      highestWpmAccuracy: highestResult ? Math.round(highestResult.accuracy * 10) / 10 : null,
    };
  }
}
