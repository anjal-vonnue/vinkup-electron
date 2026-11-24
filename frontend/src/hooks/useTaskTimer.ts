import { useCallback, useEffect, useRef, useState } from 'react';
import { recordTaskTime } from '../api/tasks';
import type { DesktopApi } from '@itp/types';

const HEARTBEAT_MS = 1_000;
const IDLE_PAUSE_MS = 3_000;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const;

export type UseTaskTimerOptions = {
  taskId: string;
  initialSeconds: number;
  /**
   * Extra activity source — e.g. an EventTarget that the Electron main process
   * posts `'activity'` events to while the trainee is using the secondary
   * reference window. Keeps the timer running across both windows.
   */
  activitySignal?: EventTarget | null;
  /** Set false to stop tracking entirely (e.g. task approved and locked). */
  enabled?: boolean;
};

export type UseTaskTimerResult = {
  displayedSeconds: number;
  isRunning: boolean;
};

export function useTaskTimer({
  taskId,
  initialSeconds,
  activitySignal = null,
  enabled = true,
}: UseTaskTimerOptions): UseTaskTimerResult {
  const [displayedSeconds, setDisplayedSeconds] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(false);

  const accumulatedMsRef = useRef(initialSeconds * 1000); // committed
  const sessionStartMsRef = useRef<number | null>(null); // set while active
  const lastSyncedMsRef = useRef(initialSeconds * 1000); // server-known total
  const idleTimerRef = useRef<number | null>(null);

  const totalMs = useCallback(
    () =>
      accumulatedMsRef.current +
      (sessionStartMsRef.current !== null ? Date.now() - sessionStartMsRef.current : 0),
    []
  );

  const syncDelta = useCallback(async () => {
    const deltaSeconds = Math.floor((totalMs() - lastSyncedMsRef.current) / 1000);
    if (deltaSeconds <= 0) return;
    const sentMs = deltaSeconds * 1000;
    lastSyncedMsRef.current += sentMs;
    try {
      await recordTaskTime(taskId, { deltaSeconds });
    } catch {
      // Put it back so the next heartbeat retries. Worst case a crash loses ≤1 tick.
      lastSyncedMsRef.current -= sentMs;
    }
  }, [taskId, totalMs]);

  const pause = useCallback(() => {
    if (sessionStartMsRef.current === null) return;
    accumulatedMsRef.current = totalMs();
    sessionStartMsRef.current = null;
    setIsRunning(false);
    void syncDelta();
  }, [syncDelta, totalMs]);

  const resume = useCallback(() => {
    if (sessionStartMsRef.current !== null) return;
    sessionStartMsRef.current = Date.now();
    setIsRunning(true);
  }, []);

  const noteActivity = useCallback(() => {
    if (!enabled) return;
    resume();
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(pause, IDLE_PAUSE_MS);
  }, [enabled, pause, resume]);

  // Activity listeners (main window + optional secondary-window signal).
  useEffect(() => {
    if (!enabled) return;
    const handler = () => noteActivity();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handler, { passive: true }));
    window.addEventListener('focus', handler);
    activitySignal?.addEventListener('activity', handler);
    handler(); // start running on mount
    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handler));
      window.removeEventListener('focus', handler);
      activitySignal?.removeEventListener('activity', handler);
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [enabled, noteActivity, activitySignal]);

  // Heartbeat: push un-synced time to the server while active.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      if (sessionStartMsRef.current !== null) void syncDelta();
    }, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [enabled, syncDelta]);

  // Display tick (only re-renders the component that uses this hook).
  useEffect(() => {
    const id = window.setInterval(() => {
      setDisplayedSeconds(Math.floor(totalMs() / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [totalMs]);

  // Flush on unmount / beforeunload so leaving the workspace or closing the app
  // does not lose the last few seconds.
  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      if (sessionStartMsRef.current !== null) {
        accumulatedMsRef.current = totalMs();
        sessionStartMsRef.current = null;
      }
      void syncDelta();
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [enabled, syncDelta, totalMs]);

  // Activity from the Resources browser (side panel + secondary displays) is
  // forwarded here by main. Treat it exactly like a key press in the main window.
  useEffect(() => {
    if (!enabled) return;
    const desktop = (window as { desktop?: DesktopApi }).desktop;
    if (!desktop?.resources?.onActivity) return;

    // const handler = () => noteActivity();
    const unsubscribe = desktop.resources.onActivity(() => {
      console.log('[timer] resources activity');
      noteActivity();
    });
    return () => unsubscribe();
  }, [enabled, noteActivity]);

  // When the task leaves "in progress / rework" (i.e. it's been submitted
  // and is pending review, or has been approved) stop the current session
  // and flush whatever has accumulated since the last heartbeat.
  useEffect(() => {
    if (enabled) return;
    if (sessionStartMsRef.current === null) return;
    accumulatedMsRef.current = totalMs();
    sessionStartMsRef.current = null;
    setIsRunning(false);
    void syncDelta();
  }, [enabled, syncDelta, totalMs]);

  return { displayedSeconds, isRunning };
}
