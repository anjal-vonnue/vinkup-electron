import { useEffect } from 'react';

/**
 * Locks the secondary display to a good-luck screen while the trainee is in the
 * Checkpoints section (the list, a detail page, an attempt or its summary), so
 * References and Resources cannot be used during a checkpoint. The normal UI is
 * restored when the caller leaves the section or unmounts.
 */
export function useCheckpointDisplayLock(name: string | null | undefined): void {
  useEffect(() => {
    const checkpointDisplay = window.desktop?.checkpoint;
    if (!checkpointDisplay) return;

    checkpointDisplay.setActive(name ?? null);
    return () => {
      checkpointDisplay.setActive(null);
    };
  }, [name]);
}
