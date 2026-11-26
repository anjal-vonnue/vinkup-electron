import { useEffect } from 'react';

/**
 * Locks the secondary display to a good-luck screen while a checkpoint attempt
 * is running, so References and Resources cannot be used during it. The normal
 * UI is restored when the attempt page unmounts.
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
