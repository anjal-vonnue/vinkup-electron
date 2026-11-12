import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  createResult: vi.fn(),
  findResults: vi.fn(),
  findHighestResult: vi.fn(),
}));

vi.mock('./typing.repository', () => ({
  TypingRepository: class {
    createResult = repository.createResult;
    findResults = repository.findResults;
    findHighestResult = repository.findHighestResult;
  },
}));

import { TypingService } from './typing.service';

describe('TypingService', () => {
  let service: TypingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TypingService();
  });

  describe('createResult', () => {
    it('rounds accuracy before saving and returns the saved result with an ISO timestamp', async () => {
      const takenAt = new Date('2026-10-03T08:15:30.000Z');

      repository.createResult.mockResolvedValue({
        id: 'result-1',
        wpm: 74,
        accuracy: 96.5,
        taken_at: takenAt,
      });

      await expect(service.createResult('trainee-1', 74, 96.46)).resolves.toEqual({
        id: 'result-1',
        wpm: 74,
        accuracy: 96.5,
        takenAt: '2026-10-03T08:15:30.000Z',
      });

      expect(repository.createResult).toHaveBeenCalledWith('trainee-1', 74, 96.5);
    });
  });

  describe('getResults', () => {
    it("returns the trainee's result history with ISO timestamps", async () => {
      repository.findResults.mockResolvedValue([
        {
          id: 'result-2',
          wpm: 82,
          accuracy: 98.04,
          taken_at: new Date('2026-10-03T08:15:30.000Z'),
        },
        {
          id: 'result-1',
          wpm: 74,
          accuracy: 96.46,
          taken_at: new Date('2026-10-02T08:15:30.000Z'),
        },
      ]);

      await expect(service.getResults('trainee-1')).resolves.toEqual([
        {
          id: 'result-2',
          wpm: 82,
          accuracy: 98,
          takenAt: '2026-10-03T08:15:30.000Z',
        },
        {
          id: 'result-1',
          wpm: 74,
          accuracy: 96.5,
          takenAt: '2026-10-02T08:15:30.000Z',
        },
      ]);

      expect(repository.findResults).toHaveBeenCalledWith('trainee-1');
    });
  });

  describe('getStats', () => {
    it('calculates average WPM and accuracy from recent results and returns the highest result', async () => {
      repository.findResults.mockResolvedValue([
        { wpm: 80, accuracy: 98.5 },
        { wpm: 70, accuracy: 96.5 },
        { wpm: 60, accuracy: 95 },
      ]);

      repository.findHighestResult.mockResolvedValue({
        wpm: 95,
        accuracy: 99.2,
      });

      await expect(service.getStats('trainee-1')).resolves.toEqual({
        averageWpm: 70,
        averageAccuracy: 96.7,
        highestWpm: 95,
        highestWpmAccuracy: 99.2,
      });

      expect(repository.findResults).toHaveBeenCalledWith('trainee-1');
      expect(repository.findHighestResult).toHaveBeenCalledWith('trainee-1');
    });

    it('returns zero averages and null highest values when no results exist', async () => {
      repository.findResults.mockResolvedValue([]);
      repository.findHighestResult.mockResolvedValue(null);

      await expect(service.getStats('trainee-1')).resolves.toEqual({
        averageWpm: 0,
        averageAccuracy: 0,
        highestWpm: null,
        highestWpmAccuracy: null,
      });
    });

    it('rounds average statistics to one decimal place', async () => {
      repository.findResults.mockResolvedValue([
        { wpm: 51, accuracy: 96.46 },
        { wpm: 54, accuracy: 97.04 },
      ]);

      repository.findHighestResult.mockResolvedValue({
        wpm: 90,
        accuracy: 99.26,
      });

      await expect(service.getStats('trainee-1')).resolves.toEqual({
        averageWpm: 52.5,
        averageAccuracy: 96.8,
        highestWpm: 90,
        highestWpmAccuracy: 99.3,
      });
    });
  });
});
