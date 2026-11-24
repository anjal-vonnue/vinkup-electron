import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logFlagEvent, logFlagEventOnExit } from '../api/activity';
import { IDLE_FLAG_AFTER_MS } from '../lib/idleTracker';
import { useIdleTracking } from './useIdleTracking';

vi.mock('../api/activity', () => ({
  logFlagEvent: vi.fn(() => Promise.resolve()),
  logFlagEventOnExit: vi.fn(),
}));

const MINUTE = 60_000;
const TASK_ID = 'html-day-01-t-1';

let visibility: DocumentVisibilityState = 'visible';
let focused = true;

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function fire(target: EventTarget, name: string) {
  act(() => {
    target.dispatchEvent(new Event(name));
  });
}

/** A key press: the trainee is active again. */
function type() {
  fire(window, 'keydown');
}

/** Changes visibility, then lets the hook's settle timeout run. */
function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  fire(document, 'visibilitychange');
  advance(0);
}

/** Moves focus away from / back to the window, then lets the settle timeout run. */
function setFocus(hasFocus: boolean) {
  focused = hasFocus;
  fire(window, hasFocus ? 'focus' : 'blur');
  advance(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  visibility = 'visible';
  focused = true;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // Drop the override so jsdom's own property is used again.
  delete (document as { visibilityState?: unknown }).visibilityState;
});

describe('useIdleTracking', () => {
  it('sends one IDLE flag with the whole length when input comes back after 10+ minutes', () => {
    renderHook(() => useIdleTracking({ taskId: TASK_ID }));

    advance(18 * MINUTE);
    type();

    expect(logFlagEvent).toHaveBeenCalledTimes(1);
    expect(logFlagEvent).toHaveBeenCalledWith(TASK_ID, { type: 'IDLE', durationMs: 18 * MINUTE });
  });

  it('sends nothing for a stretch under 10 minutes', () => {
    renderHook(() => useIdleTracking({ taskId: TASK_ID }));

    advance(9 * MINUTE);
    type();

    expect(logFlagEvent).not.toHaveBeenCalled();
  });

  it('starts counting again from 0 on every input', () => {
    renderHook(() => useIdleTracking({ taskId: TASK_ID }));

    advance(9 * MINUTE);
    type();
    advance(9 * MINUTE);
    fire(window, 'pointerdown');
    advance(9 * MINUTE);
    fire(window, 'wheel');

    expect(logFlagEvent).not.toHaveBeenCalled();
  });

  it('does not count time while the tab is hidden', () => {
    renderHook(() => useIdleTracking({ taskId: TASK_ID }));

    advance(5 * MINUTE);
    setVisibility('hidden');
    advance(30 * MINUTE);
    setVisibility('visible');
    advance(6 * MINUTE);
    type();

    // 5 min before leaving and 6 min after: neither stretch reaches 10 minutes.
    expect(logFlagEvent).not.toHaveBeenCalled();
  });

  it('does not count time while the window has lost focus', () => {
    renderHook(() => useIdleTracking({ taskId: TASK_ID }));

    advance(5 * MINUTE);
    setFocus(false);
    advance(30 * MINUTE);
    setFocus(true);
    advance(6 * MINUTE);
    type();

    expect(logFlagEvent).not.toHaveBeenCalled();
  });

  it('ends a long stretch when the trainee leaves, and sends it then', () => {
    renderHook(() => useIdleTracking({ taskId: TASK_ID }));

    advance(12 * MINUTE);
    setVisibility('hidden');

    expect(logFlagEvent).toHaveBeenCalledWith(TASK_ID, { type: 'IDLE', durationMs: 12 * MINUTE });
  });

  it('counts focus inside the Preview iframe as activity', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(iframe);

    renderHook(() => useIdleTracking({ taskId: TASK_ID }));
    advance(30 * MINUTE);
    type();

    expect(logFlagEvent).not.toHaveBeenCalled();
    iframe.remove();
  });

  it('sends a long stretch that is still open when the task page closes', () => {
    const { unmount } = renderHook(() => useIdleTracking({ taskId: TASK_ID }));

    advance(11 * MINUTE);
    unmount();

    expect(logFlagEvent).toHaveBeenCalledWith(TASK_ID, { type: 'IDLE', durationMs: 11 * MINUTE });
  });

  it('uses the keepalive request when the app or page is closed', () => {
    renderHook(() => useIdleTracking({ taskId: TASK_ID }));

    advance(15 * MINUTE);
    fire(window, 'pagehide');

    expect(logFlagEventOnExit).toHaveBeenCalledWith(TASK_ID, {
      type: 'IDLE',
      durationMs: 15 * MINUTE,
    });
    expect(logFlagEvent).not.toHaveBeenCalled();
  });

  it('works without the desktop app (web version)', () => {
    expect(window.desktop).toBeUndefined();
    renderHook(() => useIdleTracking({ taskId: TASK_ID }));

    advance(IDLE_FLAG_AFTER_MS + MINUTE);
    type();

    expect(logFlagEvent).toHaveBeenCalledTimes(1);
  });

  it('never sends the same stretch twice', () => {
    const { unmount } = renderHook(() => useIdleTracking({ taskId: TASK_ID }));

    advance(15 * MINUTE);
    fire(window, 'pagehide');
    unmount();

    expect(logFlagEventOnExit).toHaveBeenCalledTimes(1);
    expect(logFlagEvent).not.toHaveBeenCalled();
  });
});

describe('useIdleTracking in the desktop app', () => {
  let ownWindowListener: (() => void) | undefined;
  let lockListener: ((locked: boolean) => void) | undefined;
  const removeOwnWindow = vi.fn();
  const removeLock = vi.fn();

  beforeEach(() => {
    ownWindowListener = undefined;
    lockListener = undefined;
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: {
        window: {
          onOwnWindowActivity: (listener: () => void) => {
            ownWindowListener = listener;
            return removeOwnWindow;
          },
          onScreenLockChange: (listener: (locked: boolean) => void) => {
            lockListener = listener;
            return removeLock;
          },
        },
      },
    });
  });

  afterEach(() => {
    delete (window as Partial<Window>).desktop;
  });

  // Just under the threshold, so the tests pass whatever IDLE_FLAG_AFTER_MS is set to.
  const ALMOST = IDLE_FLAG_AFTER_MS - 1000;

  function ownWindowInput() {
    act(() => ownWindowListener?.());
  }

  function setLocked(locked: boolean) {
    act(() => lockListener?.(locked));
  }

  it('counts input in our second-screen reference window as activity', () => {
    renderHook(() => useIdleTracking({ taskId: TASK_ID }));

    advance(ALMOST);
    ownWindowInput(); // e.g. scrolling a reference without clicking it
    advance(ALMOST);
    ownWindowInput();
    advance(ALMOST);
    type();

    expect(logFlagEvent).not.toHaveBeenCalled();
  });

  it('drops the open stretch without sending it when the screen locks', () => {
    renderHook(() => useIdleTracking({ taskId: TASK_ID }));

    advance(3 * IDLE_FLAG_AFTER_MS);
    setLocked(true);

    expect(logFlagEvent).not.toHaveBeenCalled();
    expect(logFlagEventOnExit).not.toHaveBeenCalled();
  });

  it('does not count locked or sleeping time, and starts fresh after unlocking', () => {
    renderHook(() => useIdleTracking({ taskId: TASK_ID }));

    setLocked(true);
    advance(60 * MINUTE);
    type(); // input while locked is ignored
    advance(60 * MINUTE);
    setLocked(false);
    advance(IDLE_FLAG_AFTER_MS + MINUTE);
    type();

    expect(logFlagEvent).toHaveBeenCalledTimes(1);
    expect(logFlagEvent).toHaveBeenCalledWith(TASK_ID, {
      type: 'IDLE',
      durationMs: IDLE_FLAG_AFTER_MS + MINUTE,
    });
  });

  it('sends nothing when the page closes while locked', () => {
    const { unmount } = renderHook(() => useIdleTracking({ taskId: TASK_ID }));

    advance(2 * IDLE_FLAG_AFTER_MS);
    setLocked(true);
    unmount();

    expect(logFlagEvent).not.toHaveBeenCalled();
  });

  it('stops listening to the desktop app when the task page closes', () => {
    const { unmount } = renderHook(() => useIdleTracking({ taskId: TASK_ID }));

    unmount();

    expect(removeOwnWindow).toHaveBeenCalledTimes(1);
    expect(removeLock).toHaveBeenCalledTimes(1);
  });
});
