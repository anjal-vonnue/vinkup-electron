import { describe, expect, it } from 'vitest';
import { canCancelCheckpoint } from './managerCheckpointUi';

const START = new Date('2026-11-26T10:00:00.000Z');
const DURATION_MINUTES = 60;
const END = START.getTime() + DURATION_MINUTES * 60_000;

function checkpoint(
  overrides: Partial<{
    status: 'DRAFT' | 'SCHEDULED' | 'CANCELLED';
    startAt: string | null;
    durationMinutes: number;
  }> = {}
) {
  return {
    status: 'SCHEDULED' as const,
    startAt: START.toISOString(),
    durationMinutes: DURATION_MINUTES,
    ...overrides,
  };
}

describe('canCancelCheckpoint', () => {
  it('allows cancelling before the window opens', () => {
    expect(canCancelCheckpoint(checkpoint(), START.getTime() - 60_000)).toBe(true);
  });

  it('allows cancelling while the window is live', () => {
    expect(canCancelCheckpoint(checkpoint(), START.getTime() + 30 * 60_000)).toBe(true);
  });

  it('allows cancelling right at the end of the window', () => {
    expect(canCancelCheckpoint(checkpoint(), END)).toBe(true);
  });

  it('refuses to cancel once the window has closed', () => {
    expect(canCancelCheckpoint(checkpoint(), END + 1)).toBe(false);
  });

  it('refuses to cancel drafts and already cancelled checkpoints', () => {
    expect(canCancelCheckpoint(checkpoint({ status: 'DRAFT' }), START.getTime())).toBe(false);
    expect(canCancelCheckpoint(checkpoint({ status: 'CANCELLED' }), START.getTime())).toBe(false);
  });

  it('allows cancelling a scheduled checkpoint without a start date', () => {
    expect(canCancelCheckpoint(checkpoint({ startAt: null }), START.getTime())).toBe(true);
  });
});
