import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionTimer } from './useSessionTimer';

let visibility: DocumentVisibilityState = 'visible';
let focused = true;

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Changes visibility, then lets the hook's settle timeout run. */
function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  advance(0);
}

/** Moves focus away from / back to the window, then lets the settle timeout run. */
function setFocus(hasFocus: boolean) {
  focused = hasFocus;
  act(() => {
    window.dispatchEvent(new Event(hasFocus ? 'focus' : 'blur'));
  });
  advance(0);
}

beforeEach(() => {
  vi.useFakeTimers();
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

describe('useSessionTimer', () => {
  it('starts at 0', () => {
    const { result } = renderHook(() => useSessionTimer());
    expect(result.current).toBe(0);
  });

  it('counts whole seconds while the trainee is on the page', () => {
    const { result } = renderHook(() => useSessionTimer());

    advance(1000);
    expect(result.current).toBe(1);

    advance(64_000);
    expect(result.current).toBe(65);
  });

  it('pauses while the tab is hidden and resumes from the same value', () => {
    const { result } = renderHook(() => useSessionTimer());
    advance(10_000);

    setVisibility('hidden');
    advance(30_000);
    expect(result.current).toBe(10);

    setVisibility('visible');
    advance(5000);
    expect(result.current).toBe(15);
  });

  it('pauses while the window has lost focus (another app or window)', () => {
    const { result } = renderHook(() => useSessionTimer());
    advance(10_000);

    setFocus(false);
    advance(30_000);
    expect(result.current).toBe(10);

    setFocus(true);
    advance(5000);
    expect(result.current).toBe(15);
  });

  it('keeps counting when the blur is only focus moving into the preview iframe', () => {
    const { result } = renderHook(() => useSessionTimer());
    advance(10_000);

    // The window fires blur, but the document still has focus (it's inside a child iframe).
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    advance(5000);

    expect(result.current).toBe(15);
  });

  it('catches a missed event on the next tick', () => {
    const { result } = renderHook(() => useSessionTimer());
    advance(10_000);

    focused = false; // no blur event fired
    advance(1000); // the tick notices and pauses
    advance(20_000);

    expect(result.current).toBeLessThanOrEqual(11);
  });

  it('does not count when it mounts without focus', () => {
    focused = false;
    const { result } = renderHook(() => useSessionTimer());

    advance(20_000);
    expect(result.current).toBe(0);

    setFocus(true);
    advance(3000);
    expect(result.current).toBe(3);
  });

  it('freezes when it is stopped (the task was submitted)', () => {
    const { result, rerender } = renderHook(({ isStopped }) => useSessionTimer(isStopped), {
      initialProps: { isStopped: false },
    });
    advance(18_000);

    rerender({ isStopped: true });
    advance(60_000);

    expect(result.current).toBe(18);
  });

  it('does not count when it mounts already stopped (an already submitted task)', () => {
    const { result } = renderHook(() => useSessionTimer(true));

    advance(60_000);

    expect(result.current).toBe(0);
  });

  it('carries on from the frozen value when it is started again (rework)', () => {
    const { result, rerender } = renderHook(({ isStopped }) => useSessionTimer(isStopped), {
      initialProps: { isStopped: false },
    });
    advance(10_000);
    rerender({ isStopped: true });
    advance(30_000);

    rerender({ isStopped: false });
    advance(5000);

    expect(result.current).toBe(15);
  });

  it('still pauses on blur after it is started again', () => {
    const { result, rerender } = renderHook(({ isStopped }) => useSessionTimer(isStopped), {
      initialProps: { isStopped: true },
    });
    rerender({ isStopped: false });
    advance(10_000);

    setFocus(false);
    advance(30_000);

    expect(result.current).toBe(10);
  });

  it('stops its interval and listeners on unmount', () => {
    const clearSpy = vi.spyOn(window, 'clearInterval');
    const removeDocSpy = vi.spyOn(document, 'removeEventListener');
    const removeWinSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useSessionTimer());

    unmount();

    expect(clearSpy).toHaveBeenCalled();
    expect(removeDocSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(removeWinSpy).toHaveBeenCalledWith('blur', expect.any(Function));
    expect(removeWinSpy).toHaveBeenCalledWith('focus', expect.any(Function));
  });
});
