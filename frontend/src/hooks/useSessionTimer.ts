import { useEffect, useRef, useState } from 'react';

const TICK_MS = 1000;

/**
 * True while the trainee is actually on the page: the tab is visible and the window has focus.
 * `document.hasFocus()` stays true while focus is inside a child iframe (the Preview), so working
 * in the preview doesn't pause the timer.
 */
function isOnPage(): boolean {
  return document.visibilityState !== 'hidden' && document.hasFocus();
}

/**
 * Whole seconds the trainee has been on the page since this hook mounted.
 * Pauses while the tab is hidden or the window doesn't have focus (another app, another window,
 * DevTools), and while `isStopped` is true (the task is submitted). When `isStopped` goes back to
 * false it carries on from the same value. Remount (e.g. with a `key`) to start again from 0.
 * Display only: nothing is saved.
 */
export function useSessionTimer(isStopped = false): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // Refs, not effect variables, so the total survives when `isStopped` changes and the effect re-runs.
  const bankedMs = useRef(0); // ms from finished stretches of counting
  const startedAt = useRef<number | null>(null); // start of the current stretch; null = paused

  useEffect(() => {
    // Time is measured with Date.now(), so a throttled interval can't make the clock drift.
    const shouldCount = () => !isStopped && isOnPage();
    let settleId: number | undefined;

    // Ends the current stretch (if any) and adds it to the total.
    const pause = (now: number) => {
      if (startedAt.current === null) return;
      bankedMs.current += now - startedAt.current;
      startedAt.current = null;
    };

    // Brings the running/paused state up to date, then shows the total.
    const sync = () => {
      const now = Date.now();
      const counting = shouldCount();

      if (!counting) {
        pause(now);
      } else if (startedAt.current === null) {
        startedAt.current = now;
      }

      const running = startedAt.current === null ? 0 : now - startedAt.current;
      setElapsedSeconds(Math.floor((bankedMs.current + running) / 1000));
    };

    // Start counting straight away when we should; the next tick shows the new value.
    if (startedAt.current === null && shouldCount()) startedAt.current = Date.now();

    // On blur, focus may be moving into the Preview iframe; check once it has settled.
    const syncSoon = () => {
      window.clearTimeout(settleId);
      settleId = window.setTimeout(sync, 0);
    };

    const intervalId = window.setInterval(sync, TICK_MS);
    document.addEventListener('visibilitychange', syncSoon);
    window.addEventListener('blur', syncSoon);
    window.addEventListener('focus', syncSoon);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(settleId);
      document.removeEventListener('visibilitychange', syncSoon);
      window.removeEventListener('blur', syncSoon);
      window.removeEventListener('focus', syncSoon);
      // Bank the running stretch, so a stop freezes the clock at this exact moment.
      pause(Date.now());
    };
  }, [isStopped]);

  return elapsedSeconds;
}
