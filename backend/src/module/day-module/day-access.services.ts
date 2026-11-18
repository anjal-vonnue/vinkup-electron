import { ProgressService } from '../progress-module/progress.service.js'; // adjust path if needed

const progressService = new ProgressService();

/**
 * Throws if the trainee may not open this day.
 * Unknown day -> 404 first, then locked -> 403 (FR-1). The server decides, not the UI.
 *
 * The lock rule itself lives in ProgressService.isDayUnlocked(); do not re-implement it here.
 */
export async function assertDayIsAccessible(traineeId: string, dayId: string): Promise<void> {
  await progressService.assertDayUnlocked(traineeId, dayId);
}

/** Returns lock/completion state without rejecting a locked day. */
export async function getDayAccessStatus(traineeId: string, dayId: string) {
  const status = await progressService.getDayStatus(traineeId, dayId);

  return {
    isLocked: status === 'LOCKED',
    isCompleted: status === 'COMPLETED',
  };
}
