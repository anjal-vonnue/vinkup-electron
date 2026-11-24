import { useEffect } from 'react';
import type { LogFlagEventRequest } from '@itp/types';
import { logFlagEvent, logFlagEventOnExit } from '../api/activity';
import { idleDurationToReport } from '../lib/idleTracker';

const POINTER_MOVE_THROTTLE_MS = 5000;
/** How often to check whether focus is in the Preview (see isPreviewFocused). */
const PREVIEW_CHECK_MS = 15_000;
const INPUT_EVENTS = ['keydown', 'pointerdown', 'wheel', 'scroll', 'touchstart'] as const;

/** True while the trainee is on the task page: the tab is visible and the window has focus. */
function isWatching(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus();
}

/**
 * Focus is inside the Preview iframe. Input there never reaches this window,
 * so it counts as activity; otherwise testing their own page would look idle.
 */
function isPreviewFocused(): boolean {
  return document.activeElement?.tagName === 'IFRAME';
}

type Options = {
  taskId: string;
};

/**
 * Records long stretches without keyboard/mouse input on the task page as an IDLE flag
 * (one flag per stretch, with its length). Idle is a hint for the mentor, never a penalty:
 * nothing is shown to the trainee and nothing is blocked.
 *
 * A stretch ends when input comes back, the trainee leaves (tab hidden or window unfocused;
 * time away is covered by the other flags), or the page closes. It is only sent if it lasted
 * at least IDLE_FLAG_AFTER_MS.
 *
 * Desktop app only: input in our own second-screen window counts as input here, and a
 * screen lock / sleep drops the current stretch without sending it (locked time never counts).
 */
export function useIdleTracking({ taskId }: Options): void {
  useEffect(() => {
    const desktopWindow = window.desktop?.window;
    let isLocked = false;
    const watching = () => !isLocked && isWatching();

    // Start of the current quiet stretch; null while the trainee is away.
    let idleSince: number | null = watching() ? Date.now() : null;
    let lastPointerMove = 0;
    let settleId: number | undefined;

    // Ends the current stretch and sends it if it was long enough.
    const endStretch = (onExit: boolean) => {
      if (idleSince === null) return;
      const durationMs = idleDurationToReport(idleSince, Date.now());
      idleSince = null;
      if (durationMs === null) return;

      const body: LogFlagEventRequest = { type: 'IDLE', durationMs };
      if (onExit) {
        logFlagEventOnExit(taskId, body);
      } else {
        void logFlagEvent(taskId, body).catch(() => {}); // best effort, never bothers the trainee
      }
    };

    // Any input: the quiet stretch (if any) is over, and a new one starts now.
    const markInput = () => {
      endStretch(false);
      idleSince = watching() ? Date.now() : null;
    };

    const onPointerMove = () => {
      const now = Date.now();
      if (now - lastPointerMove < POINTER_MOVE_THROTTLE_MS) return;
      lastPointerMove = now;
      markInput();
    };

    // Leaving ends the stretch; coming back starts a new one.
    const syncWatching = () => {
      if (!watching()) {
        endStretch(false);
      } else if (idleSince === null) {
        idleSince = Date.now();
      }
    };

    // On blur, focus may be moving into the Preview iframe; check once it has settled.
    const syncSoon = () => {
      window.clearTimeout(settleId);
      settleId = window.setTimeout(syncWatching, 0);
    };

    const checkPreview = () => {
      syncWatching(); // also catches a missed blur / visibility event
      if (idleSince !== null && isPreviewFocused()) markInput();
    };

    const onPageHide = () => endStretch(true);

    // Locked / asleep: drop the stretch unsent. Back: start a fresh one.
    const onScreenLockChange = (locked: boolean) => {
      isLocked = locked;
      idleSince = watching() ? Date.now() : null;
    };
    const removeOwnWindowListener = desktopWindow?.onOwnWindowActivity?.(markInput);
    const removeLockListener = desktopWindow?.onScreenLockChange?.(onScreenLockChange);

    const options = { capture: true, passive: true } as const;
    INPUT_EVENTS.forEach((name) => window.addEventListener(name, markInput, options));
    window.addEventListener('pointermove', onPointerMove, options);
    document.addEventListener('visibilitychange', syncSoon);
    window.addEventListener('blur', syncSoon);
    window.addEventListener('focus', syncSoon);
    window.addEventListener('pagehide', onPageHide);
    const previewTimer = window.setInterval(checkPreview, PREVIEW_CHECK_MS);

    return () => {
      INPUT_EVENTS.forEach((name) => window.removeEventListener(name, markInput, options));
      window.removeEventListener('pointermove', onPointerMove, options);
      document.removeEventListener('visibilitychange', syncSoon);
      window.removeEventListener('blur', syncSoon);
      window.removeEventListener('focus', syncSoon);
      window.removeEventListener('pagehide', onPageHide);
      window.clearInterval(previewTimer);
      window.clearTimeout(settleId);
      removeOwnWindowListener?.();
      removeLockListener?.();
      // Leaving the task page (e.g. back to the day): send a long stretch that was still open.
      endStretch(false);
    };
  }, [taskId]);
}
