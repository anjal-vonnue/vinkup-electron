import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import type { DesktopApi } from '@itp/types';
import { useCheckpointDisplayLock } from './useCheckpointDisplayLock';

const setActive = vi.fn();

function installDesktop(): void {
  window.desktop = {
    checkpoint: { setActive },
  } as unknown as DesktopApi;
}

afterEach(() => {
  cleanup();
  delete (window as { desktop?: DesktopApi }).desktop;
  vi.clearAllMocks();
});

describe('useCheckpointDisplayLock', () => {
  it('shows the trainee name on the secondary display and clears it on unmount', () => {
    installDesktop();
    const { unmount } = renderHook(() => useCheckpointDisplayLock('Rahul Sharma'));

    expect(setActive).toHaveBeenCalledWith('Rahul Sharma');

    unmount();
    expect(setActive).toHaveBeenLastCalledWith(null);
  });

  it('updates the message when the session name loads later', () => {
    installDesktop();
    const { rerender } = renderHook(({ name }) => useCheckpointDisplayLock(name), {
      initialProps: { name: undefined as string | undefined },
    });

    expect(setActive).toHaveBeenLastCalledWith(null);

    rerender({ name: 'Rahul Sharma' });
    expect(setActive).toHaveBeenLastCalledWith('Rahul Sharma');
  });

  it('does nothing outside the desktop shell', () => {
    expect(() => renderHook(() => useCheckpointDisplayLock('Rahul Sharma'))).not.toThrow();
    expect(setActive).not.toHaveBeenCalled();
  });
});
