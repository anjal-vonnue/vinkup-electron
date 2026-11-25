import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenLockWatcher } from './screenLockWatcher';

class FakePower extends EventEmitter {
  idleState = 'active';
  getSystemIdleState = vi.fn(() => this.idleState);
}

let power: FakePower;
let onChange: ReturnType<typeof vi.fn<(locked: boolean) => void>>;

beforeEach(() => {
  vi.useFakeTimers();
  power = new FakePower();
  onChange = vi.fn<(locked: boolean) => void>();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ScreenLockWatcher', () => {
  it('reports lock-screen and unlock-screen (macOS / Windows)', () => {
    const watcher = new ScreenLockWatcher(power, onChange);
    watcher.start();

    power.emit('lock-screen');
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(watcher.isLocked()).toBe(true);

    power.emit('unlock-screen');
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(watcher.isLocked()).toBe(false);
  });

  it('treats suspend and resume like lock and unlock', () => {
    new ScreenLockWatcher(power, onChange).start();

    power.emit('suspend');
    power.emit('resume');

    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('only reports real changes', () => {
    new ScreenLockWatcher(power, onChange).start();

    power.emit('lock-screen');
    power.emit('suspend');

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('on Linux, finds a locked screen by polling getSystemIdleState', () => {
    new ScreenLockWatcher(power, onChange, 15_000).start();

    power.idleState = 'locked';
    vi.advanceTimersByTime(15_000);
    expect(onChange).toHaveBeenLastCalledWith(true);

    power.idleState = 'active';
    vi.advanceTimersByTime(15_000);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('stays locked after resume while the screen is still locked', () => {
    new ScreenLockWatcher(power, onChange, 15_000).start();

    power.emit('suspend');
    power.idleState = 'locked';
    power.emit('resume');

    expect(onChange.mock.calls).toEqual([[true]]);
  });

  it('treats a failing getSystemIdleState as unlocked', () => {
    power.getSystemIdleState.mockImplementation(() => {
      throw new Error('not supported');
    });
    new ScreenLockWatcher(power, onChange, 15_000).start();

    vi.advanceTimersByTime(15_000);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops listening after dispose', () => {
    const watcher = new ScreenLockWatcher(power, onChange, 15_000);
    watcher.start();
    watcher.dispose();

    power.emit('lock-screen');
    power.idleState = 'locked';
    vi.advanceTimersByTime(15_000);

    expect(onChange).not.toHaveBeenCalled();
  });
});
