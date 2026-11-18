import type { DayJournal } from '@itp/types';
import type { JournalListResponse } from '@itp/types';
import { journalRepository } from './journal.repository.js';
import { assertDayIsAccessible } from './day-access.services.js';
import { ProgressService } from '../progress-module/progress.service.js';
import { istDateString } from '../../utils/istDate.js';

const progressService = new ProgressService();

const TRACK_LABELS: Record<string, string> = {
  html: 'HTML',
  css: 'CSS',
  js: 'JS',
  ts: 'TS',
  node: 'NODE',
  postgresql: 'SQL',
  prisma: 'PRISMA',
  react: 'REACT',
};

export const journalService = {
  async listJournalEntries(traineeId: string): Promise<JournalListResponse> {
    const [days, statuses] = await Promise.all([
      journalRepository.findEntries(traineeId),
      progressService.getDayStatuses(traineeId),
    ]);
    const statusByDay = new Map(statuses.map(({ dayId, status }) => [dayId, status]));
    const today = istDateString();

    return {
      entries: days
        .filter((day) => statusByDay.get(day.id) !== 'LOCKED')
        .map((day) => {
          const saved = day.journal_responses[0] ?? null;
          const completedAt = day.completions[0]?.completed_at;
          const isEditable = statusByDay.get(day.id) === 'UNLOCKED';
          const date = completedAt?.toISOString().slice(0, 10) ?? today;

          return {
            dayId: day.id,
            dayNumber: day.day_number,
            trackLabel: TRACK_LABELS[day.course.id] ?? day.course.id.toUpperCase(),
            title: day.title,
            date,
            updatedAt: saved?.updated_at.toISOString() ?? null,
            prompts: day.journal_prompt.trim() ? [day.journal_prompt] : [],
            responseText: saved?.response_text ?? '',
            isEditable,
          };
        })
        .reverse(),
    };
  },

  async getJournal(traineeId: string, dayId: string): Promise<DayJournal> {
    await assertDayIsAccessible(traineeId, dayId);

    const entry = await journalRepository.findEntry(traineeId, dayId);

    // No row yet is normal for a new trainee: empty response, not a 404.
    return { responseText: entry ? entry.response_text : null };
  },

  async saveJournal(traineeId: string, dayId: string, responseText: string): Promise<DayJournal> {
    await assertDayIsAccessible(traineeId, dayId);

    const saved = await journalRepository.upsertEntry(traineeId, dayId, responseText);

    return { responseText: saved.response_text };
  },
};
