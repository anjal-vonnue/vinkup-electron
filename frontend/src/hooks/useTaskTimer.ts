import { useCallback, useEffect, useRef, useState } from 'react';
import { recordTaskTime } from '../api/tasks';
import type { DesktopApi } from '@itp/types';

const HEARTBEAT_MS = 5_000;
const IDLE_PAUSE_MS = 3 * 60 * 1_000;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const;

export type UseTaskTimerOptions = {
  taskId: string;
  initialSeconds: number;
  /** Extra activity source for cross-window activity from the Electron shell. */
  activitySignal?: EventTarget | null;
  /** Set false to stop tracking entirely (e.g. task approved and locked). */
  enabled?: boolean;
  /**
   * If true, the timer starts immediately on mount (fresh task).
   * If false, it stays paused until the trainee presses a key in the workspace
   * (rework / already-submitted task). Mouse moves, scrolling and reference-browser
   * activity never start a stopped timer — they only keep a running one alive.
   */
  autoStart?: boolean;
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
  autoStart = false,
}: UseTaskTimerOptions): UseTaskTimerResult {
  const [displayedSeconds, setDisplayedSeconds] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(false);

  const accumulatedMsRef = useRef(initialSeconds * 1000);
  const sessionStartMsRef = useRef<number | null>(null);
  const lastSyncedMsRef = useRef(initialSeconds * 1000);
  const idleTimerRef = useRef<number | null>(null);

  // True once the timer has actually started counting at least once since the
  // last time it was disabled. Distinguishes "never started" (wait for a
  // keystroke to start) from "started then idle-paused" (any activity resumes).
  const hasStartedRef = useRef(autoStart);

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

  // Activity listeners. Only a keystroke STARTS a stopped timer; every other
  // activity CONTINUES an already-started one. When disabled, all listeners
  // are removed and hasStartedRef is reset so the next enable waits for a
  // keystroke again.
  useEffect(() => {
    if (!enabled) {
      hasStartedRef.current = false;
      return;
    }

    const onKeyDown = (): void => {
      hasStartedRef.current = true;
      noteActivity();
    };

    const onAnyActivity = (): void => {
      if (!hasStartedRef.current) return;
      noteActivity();
    };

    window.addEventListener('keydown', onKeyDown, { passive: true });
    ACTIVITY_EVENTS.filter((evt) => evt !== 'keydown').forEach((evt) =>
      window.addEventListener(evt, onAnyActivity, { passive: true })
    );
    window.addEventListener('focus', onAnyActivity);
    activitySignal?.addEventListener('activity', onAnyActivity);

    if (autoStart) {
      hasStartedRef.current = true;
      noteActivity();
    }

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      ACTIVITY_EVENTS.filter((evt) => evt !== 'keydown').forEach((evt) =>
        window.removeEventListener(evt, onAnyActivity)
      );
      window.removeEventListener('focus', onAnyActivity);
      activitySignal?.removeEventListener('activity', onAnyActivity);
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [enabled, noteActivity, activitySignal, autoStart]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      if (sessionStartMsRef.current !== null) void syncDelta();
    }, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [enabled, syncDelta]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setDisplayedSeconds(Math.floor(totalMs() / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [totalMs]);

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

  useEffect(() => {
    if (!enabled) return;
    const desktop = (window as { desktop?: DesktopApi }).desktop;
    if (!desktop?.resources?.onActivity) return;

    const handler = () => noteActivity();
    const unsubscribe = desktop.resources.onActivity(handler);
    return () => unsubscribe();
  }, [enabled, noteActivity]);

  return { displayedSeconds, isRunning };
}
