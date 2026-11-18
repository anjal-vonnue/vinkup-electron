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

describe('useFlagTracking secondary-reference exception', () => {
  let focusListeners: Array<(isFocused: boolean) => void>;
  let visibilityDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    focusListeners = [];
    visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    const windowApi = {
      isReferenceScreenFocused: vi.fn(() => Promise.resolve(false)),
      onReferenceScreenFocusChange: vi.fn((listener: (isFocused: boolean) => void) => {
        focusListeners.push(listener);
        return () => {
          focusListeners = focusListeners.filter((registered) => registered !== listener);
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

  it('does not log or warn when focus moves to the active reference overlay', async () => {
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
});
