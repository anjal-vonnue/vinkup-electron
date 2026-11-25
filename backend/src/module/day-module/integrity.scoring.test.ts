import { describe, expect, it } from 'vitest';
import { buildDayIntegrity, isScoredFlag } from './integrity.scoring';

// Rows as they come from the database, before the idle filter.
type Row = {
  taskId: string;
  type: 'TAB_SWITCH' | 'PASTE_BLOCKED' | 'IDLE';
  reviewPriority: 'LOW' | 'NORMAL' | 'HIGH';
  durationMs: number | null;
};

const idle: Row = {
  taskId: 'task-b',
  type: 'IDLE',
  reviewPriority: 'NORMAL',
  durationMs: 40 * 60_000,
};
const paste: Row = {
  taskId: 'task-a',
  type: 'PASTE_BLOCKED',
  reviewPriority: 'NORMAL',
  durationMs: null,
};

describe('isScoredFlag', () => {
  it('scores every flag type except IDLE', () => {
    expect(isScoredFlag({ type: 'TAB_SWITCH' })).toBe(true);
    expect(isScoredFlag({ type: 'FULLSCREEN_EXIT' })).toBe(true);
    expect(isScoredFlag({ type: 'PASTE_BLOCKED' })).toBe(true);
    expect(isScoredFlag({ type: 'WINDOW_BLUR' })).toBe(true);
    expect(isScoredFlag({ type: 'IDLE' })).toBe(false);
  });
});

describe('idle flags and the day score', () => {
  it('a long idle flag does not lower the score', () => {
    const events = [idle].filter(isScoredFlag);

    expect(buildDayIntegrity({ startedTaskIds: ['task-b'], events })).toEqual({ score: 100 });
  });

  it('an idle-only task does not count as worked on, so it cannot raise the average', () => {
    // task-a: one NORMAL paste = 100 - 15 = 85. task-b only has an idle flag.
    const rows = [paste, idle];
    const scored = rows.filter(isScoredFlag);
    // Same rule as the services: a task counts if it has a (scored) flag.
    const startedTaskIds = [...new Set(scored.map((row) => row.taskId))];

    expect(buildDayIntegrity({ startedTaskIds, events: scored })).toEqual({ score: 85 });
  });

  it('keeps scoring the other flags exactly as before', () => {
    const scored = [paste, idle].filter(isScoredFlag);

    expect(buildDayIntegrity({ startedTaskIds: ['task-a'], events: scored })).toEqual(
      buildDayIntegrity({ startedTaskIds: ['task-a'], events: [paste as (typeof scored)[number]] })
    );
  });
});
