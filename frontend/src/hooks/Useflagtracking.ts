import { useEffect, useRef } from 'react';
import type { FlagEventType } from '@itp/types';
import { logFlagEvent } from '../api/activity';
import { isFullscreenActive } from '../lib/IsfullscreenActive';

export const LEFT_WORKSPACE_WARNING =
  'You left the workspace. This has been noted for your mentor.';

export const LEFT_WORKSPACE_WINDOW_WARNING =
  'You left the workspace window. This has been noted for your mentor.';

type Options = {
  taskId: string;
  onWarning: (message: string) => void;
};
type ActiveFlag = {
  type: FlagEventType;
  startedAt: number;
};

/** FR-9/11/12: logs tab switches and fullscreen exits for this task and warns on return. No penalty. */
export function useFlagTracking({ taskId, onWarning }: Options): void {
  // Keep the latest callback without re-subscribing the listeners
  const onWarningRef = useRef(onWarning);
  useEffect(() => {
    onWarningRef.current = onWarning;
  });

  useEffect(() => {
    const desktopWindow = window.desktop?.window;
    let isAway = document.visibilityState === 'hidden';
    let nativeFullscreen: boolean | null = null;
    let fullscreenStateVersion = 0;
    let wasFullscreen: boolean | null = desktopWindow ? null : isFullscreenActive();
    let isUnfocused = !document.hasFocus();
    let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
    let windowBlurTimeout: ReturnType<typeof setTimeout> | undefined;

    let activeFlag: ActiveFlag | null = null;
    let isAllowedOverlayContentFocused = false;
    let focusStateVersion = 0;
    let skipNextReturnWarning = false;
    function isTrackingFullscreenActive() {
      return desktopWindow ? (nativeFullscreen ?? isFullscreenActive()) : isFullscreenActive();
    }

    function startFlag(type: FlagEventType) {
      if (activeFlag || isAllowedOverlayContentFocused) return;

      activeFlag = {
        type,
        startedAt: Date.now(),
      };
    }
    function endFlag() {
      if (!activeFlag) return;

      const endedAt = Date.now();

      const durationMs = Math.max(0, Math.round(endedAt - activeFlag.startedAt));

      const flag = activeFlag;

      activeFlag = null;

      void logFlagEvent(taskId, {
        type: flag.type,
        durationMs: durationMs,
      }).catch(() => {});
    }

    function handleAllowedOverlayFocusChange(isFocused: boolean) {
      focusStateVersion += 1;
      isAllowedOverlayContentFocused = isFocused;
      if (!isFocused) return;

      if (activeFlag?.type === 'TAB_SWITCH' || document.visibilityState === 'hidden') {
        skipNextReturnWarning = true;
      }
      activeFlag = null;
      isUnfocused = false;
    }

    const removeAllowedOverlayFocusListener = desktopWindow?.onAllowedOverlayContentFocusChange(
      handleAllowedOverlayFocusChange
    );
    if (desktopWindow) {
      const initialFocusStateVersion = focusStateVersion;
      void desktopWindow
        .isAllowedOverlayContentFocused()
        .then((isFocused) => {
          if (focusStateVersion === initialFocusStateVersion) {
            handleAllowedOverlayFocusChange(isFocused);
          }
        })
        .catch((error: unknown) => {
          console.error('[activity] Failed to read allowed overlay focus state', error);
        });
    }

    function handleFullscreenChange(isFullscreen = isFullscreenActive()) {
      if (wasFullscreen === null) {
        wasFullscreen = isFullscreen;
        return;
      }
      if (wasFullscreen && !isFullscreen) {
        if (!isAllowedOverlayContentFocused) {
          startFlag('FULLSCREEN_EXIT');
          onWarningRef.current(LEFT_WORKSPACE_WARNING);
        }
      }
      if (!wasFullscreen && isFullscreen) {
        if (activeFlag?.type === 'FULLSCREEN_EXIT') {
          endFlag();
        }
      }
      wasFullscreen = isFullscreen;
    }

    const removeFullscreenListener = desktopWindow?.onFullscreenChange?.((isFullscreen) => {
      fullscreenStateVersion += 1;
      nativeFullscreen = isFullscreen;
      handleFullscreenChange(isFullscreen);
    });
    if (desktopWindow?.isFullscreen) {
      const initialFullscreenStateVersion = fullscreenStateVersion;
      void desktopWindow
        .isFullscreen()
        .then((isFullscreen) => {
          if (fullscreenStateVersion !== initialFullscreenStateVersion) return;
          nativeFullscreen = isFullscreen;
          wasFullscreen = isFullscreen;
        })
        .catch((error: unknown) => {
          console.error('[activity] Failed to read native fullscreen state', error);
        });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        if (isAway) return; // already logged this hidden period
        isAway = true;
        if (isAllowedOverlayContentFocused) {
          skipNextReturnWarning = true;
          activeFlag = null;
        } else if (isTrackingFullscreenActive()) {
          startFlag('TAB_SWITCH');
        }
      } else if (isAway) {
        isAway = false;
        if (isTrackingFullscreenActive()) {
          endFlag();
          if (!isAllowedOverlayContentFocused && !skipNextReturnWarning) {
            onWarningRef.current(LEFT_WORKSPACE_WARNING);
          }
        }
        skipNextReturnWarning = false;
      }
    }

    // NEW — window-level focus loss. Overlaps with TAB_SWITCH for a full
    // tab/app switch (both will fire), but also catches cases visibilitychange
    // misses entirely: DevTools focus, address bar clicks, a second-monitor
    // window that stays visible but loses OS focus.
    function handleWindowBlur() {
      if (windowBlurTimeout) {
        clearTimeout(windowBlurTimeout);
      }
      windowBlurTimeout = setTimeout(() => {
        if (!isTrackingFullscreenActive()) return;
        if (document.visibilityState === 'hidden') return;
        if (isAllowedOverlayContentFocused) return;

        // Focus just moved into our own preview iframe, not out of the window
        if (document.hasFocus()) return;

        if (isUnfocused) return;
        isUnfocused = true;
        startFlag('WINDOW_BLUR');
      }, 500);
    }
    function handleWindowFocus() {
      if (isAllowedOverlayContentFocused) {
        isUnfocused = false;
        activeFlag = null;
        return;
      }
      if (!isTrackingFullscreenActive()) {
        isUnfocused = false;
        return;
      }
      if (document.visibilityState === 'hidden') {
        return;
      }
      if (isUnfocused) {
        isUnfocused = false;
        endFlag();
        onWarningRef.current(LEFT_WORKSPACE_WINDOW_WARNING);
      }
    }
    function handleResize() {
      // F11 can trigger multiple resize events.
      // Wait until the browser finishes resizing before checking fullscreen state.
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      resizeTimeout = setTimeout(() => {
        handleFullscreenChange();
      }, 150);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    const handleDocumentFullscreenChange = () => handleFullscreenChange(isFullscreenActive());
    if (!desktopWindow) {
      document.addEventListener('fullscreenchange', handleDocumentFullscreenChange);
      window.addEventListener('resize', handleResize);
    }
    window.addEventListener('blur', handleWindowBlur); // NEW
    window.addEventListener('focus', handleWindowFocus); // NEW
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (!desktopWindow) {
        document.removeEventListener('fullscreenchange', handleDocumentFullscreenChange);
        window.removeEventListener('resize', handleResize);
      }
      window.removeEventListener('blur', handleWindowBlur); // NEW
      window.removeEventListener('focus', handleWindowFocus); // NEW
      removeAllowedOverlayFocusListener?.();
      removeFullscreenListener?.();
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      if (windowBlurTimeout) {
        clearTimeout(windowBlurTimeout);
      }
      if (activeFlag) {
        const endedAt = Date.now();

        const durationSeconds = Math.max(0, Math.round((endedAt - activeFlag.startedAt) / 1000));

        void logFlagEvent(taskId, {
          type: activeFlag.type,
          durationMs: durationSeconds,
        }).catch(() => {});

        activeFlag = null;
      }
    };
  }, [taskId]);
}
