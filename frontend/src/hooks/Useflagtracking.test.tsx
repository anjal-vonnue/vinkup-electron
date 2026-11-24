import { act, renderHook } from '@testing-library/react';
import type { DesktopApi } from '@itp/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logFlagEvent } from '../api/activity';
import { useFlagTracking } from './Useflagtracking';

const { isFullscreenActiveMock } = vi.hoisted(() => ({
  isFullscreenActiveMock: vi.fn(() => true),
}));

vi.mock('../api/activity', () => ({
  logFlagEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/IsfullscreenActive', () => ({
  isFullscreenActive: isFullscreenActiveMock,
}));

describe('useFlagTracking allowed overlay content exception', () => {
  let focusListeners: Array<(isFocused: boolean) => void>;
  let fullscreenListeners: Array<(isFullscreen: boolean) => void>;
  let lockListeners: Array<(locked: boolean) => void>;
  let visibilityDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(logFlagEvent).mockClear();
    focusListeners = [];
    fullscreenListeners = [];
    lockListeners = [];
    isFullscreenActiveMock.mockReturnValue(true);
    visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    const windowApi = {
      isFullscreen: vi.fn(() => Promise.resolve(true)),
      onFullscreenChange: vi.fn((listener: (isFullscreen: boolean) => void) => {
        fullscreenListeners.push(listener);
        return () => {
          fullscreenListeners = fullscreenListeners.filter((registered) => registered !== listener);
        };
      }),
      isAllowedOverlayContentFocused: vi.fn(() => Promise.resolve(false)),
      onAllowedOverlayContentFocusChange: vi.fn((listener: (isFocused: boolean) => void) => {
        focusListeners.push(listener);
        return () => {
          focusListeners = focusListeners.filter((registered) => registered !== listener);
        };
      }),
      onScreenLockChange: vi.fn((listener: (locked: boolean) => void) => {
        lockListeners.push(listener);
        return () => {
          lockListeners = lockListeners.filter((registered) => registered !== listener);
        };
      }),
    } as unknown as DesktopApi['window'];
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: { window: windowApi },
    });
  });

  afterEach(() => {
    delete (window as Partial<Window>).desktop;
    if (visibilityDescriptor) {
      Object.defineProperty(document, 'visibilityState', visibilityDescriptor);
    } else {
      Reflect.deleteProperty(document, 'visibilityState');
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not log or warn when focus moves to approved content on an overlay', async () => {
    const onWarning = vi.fn();
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    renderHook(() => useFlagTracking({ taskId: 'task-1', onWarning }));

    act(() => {
      focusListeners[0]?.(true);
    });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(logFlagEvent).not.toHaveBeenCalled();
    expect(onWarning).not.toHaveBeenCalled();
  });

  it('cancels the pending blur flag when approved overlay content receives focus', async () => {
    const onWarning = vi.fn();
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    renderHook(() => useFlagTracking({ taskId: 'task-1', onWarning }));

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    act(() => {
      focusListeners[0]?.(true);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    hasFocus.mockReturnValue(true);
    act(() => {
      focusListeners[0]?.(false);
      window.dispatchEvent(new Event('focus'));
    });

    expect(logFlagEvent).not.toHaveBeenCalled();
    expect(onWarning).not.toHaveBeenCalled();
  });

  it('continues flagging focus loss when the reference overlay is not focused', async () => {
    const onWarning = vi.fn();
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    renderHook(() => useFlagTracking({ taskId: 'task-1', onWarning }));

    hasFocus.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    hasFocus.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(logFlagEvent).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ type: 'WINDOW_BLUR' })
    );
    expect(onWarning).toHaveBeenCalledOnce();
  });

  it('flags focus moving from the second-screen window to another app', async () => {
    const onWarning = vi.fn();
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    renderHook(() => useFlagTracking({ taskId: 'task-1', onWarning }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // initial focus-state read
    });

    // Into our second-screen window: no flag.
    hasFocus.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('blur'));
      focusListeners[0]?.(true);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(logFlagEvent).not.toHaveBeenCalled();

    // From there to another app: this window still has no focus.
    act(() => {
      focusListeners[0]?.(false);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    hasFocus.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(logFlagEvent).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ type: 'WINDOW_BLUR' })
    );
    expect(onWarning).toHaveBeenCalledOnce();
  });

  it('does not flag focus moving from the second-screen window back to this window', async () => {
    const onWarning = vi.fn();
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    renderHook(() => useFlagTracking({ taskId: 'task-1', onWarning }));

    act(() => {
      focusListeners[0]?.(true);
    });
    hasFocus.mockReturnValue(true);
    act(() => {
      focusListeners[0]?.(false);
      window.dispatchEvent(new Event('focus'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(logFlagEvent).not.toHaveBeenCalled();
    expect(onWarning).not.toHaveBeenCalled();
  });

  it('drops a blur caused by a screen lock and does not warn after unlocking', async () => {
    const onWarning = vi.fn();
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    renderHook(() => useFlagTracking({ taskId: 'task-1', onWarning }));

    // Locking takes focus away; on Linux the lock is noticed a few seconds later.
    hasFocus.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    act(() => {
      lockListeners[0]?.(true);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 60_000);
    });
    hasFocus.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('focus'));
      lockListeners[0]?.(false);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(logFlagEvent).not.toHaveBeenCalled();
    expect(onWarning).not.toHaveBeenCalled();
  });

  it('still logs time away that started well before the screen locked', async () => {
    const onWarning = vi.fn();
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    renderHook(() => useFlagTracking({ taskId: 'task-1', onWarning }));

    hasFocus.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500 + 60_000); // flag starts after 500 ms
    });
    act(() => {
      lockListeners[0]?.(true);
    });

    expect(logFlagEvent).toHaveBeenCalledWith('task-1', {
      type: 'WINDOW_BLUR',
      durationMs: 60_000,
    });

    hasFocus.mockReturnValue(true);
    act(() => {
      lockListeners[0]?.(false);
      window.dispatchEvent(new Event('focus'));
    });
    expect(onWarning).not.toHaveBeenCalled();
  });

  it('flags leaving for another app after unlocking', async () => {
    const onWarning = vi.fn();
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    renderHook(() => useFlagTracking({ taskId: 'task-1', onWarning }));

    act(() => {
      lockListeners[0]?.(true);
    });
    act(() => {
      lockListeners[0]?.(false); // unlocked, but focus is in another app
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    hasFocus.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(logFlagEvent).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ type: 'WINDOW_BLUR' })
    );
    expect(onWarning).toHaveBeenCalledOnce();
  });

  it('does not flag zoom-induced resize in Electron but flags a native fullscreen exit', async () => {
    const onWarning = vi.fn();
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    renderHook(() => useFlagTracking({ taskId: 'task-1', onWarning }));

    await act(async () => {
      await Promise.resolve();
    });
    isFullscreenActiveMock.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(logFlagEvent).not.toHaveBeenCalled();
    expect(onWarning).not.toHaveBeenCalled();

    act(() => {
      fullscreenListeners[0]?.(false);
    });

    expect(logFlagEvent).not.toHaveBeenCalled();
    expect(onWarning).toHaveBeenCalledOnce();
  });
});
