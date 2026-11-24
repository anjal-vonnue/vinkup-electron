/** The parts of Electron's powerMonitor this file uses (a fake is passed in tests). */
export interface PowerSource {
  on(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
  getSystemIdleState(idleThresholdSeconds: number): string;
}

const LOCK_EVENTS = ['lock-screen', 'suspend'] as const;
const UNLOCK_EVENTS = ['unlock-screen', 'resume'] as const;

/**
 * Tells the app when the screen is locked or the computer sleeps, and when it is back.
 *
 * 'lock-screen' / 'unlock-screen' only fire on macOS and Windows. On Linux, pass `pollMs`:
 * the watcher then asks getSystemIdleState() for 'locked' every `pollMs`
 * (this works only on desktops that report it). 'suspend' / 'resume' work everywhere.
 */
export class ScreenLockWatcher {
  private lockedByEvent = false;
  private lockedByPoll = false;
  private reported = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly power: PowerSource,
    private readonly onChange: (locked: boolean) => void,
    private readonly pollMs?: number
  ) {}

  start(): void {
    LOCK_EVENTS.forEach((name) => this.power.on(name, this.onLock));
    UNLOCK_EVENTS.forEach((name) => this.power.on(name, this.onUnlock));
    if (this.pollMs) this.pollTimer = setInterval(this.poll, this.pollMs);
  }

  dispose(): void {
    LOCK_EVENTS.forEach((name) => this.power.removeListener(name, this.onLock));
    UNLOCK_EVENTS.forEach((name) => this.power.removeListener(name, this.onUnlock));
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  isLocked(): boolean {
    return this.reported;
  }

  private readonly onLock = (): void => {
    this.lockedByEvent = true;
    this.update();
  };

  private readonly onUnlock = (): void => {
    this.lockedByEvent = false;
    // After resume the screen is often still locked: check again before saying "unlocked".
    if (this.pollMs) this.poll();
    else this.update();
  };

  private readonly poll = (): void => {
    try {
      // The threshold only matters for 'idle', which is ignored here.
      this.lockedByPoll = this.power.getSystemIdleState(60) === 'locked';
    } catch {
      this.lockedByPoll = false;
    }
    this.update();
  };

  private update(): void {
    const locked = this.lockedByEvent || this.lockedByPoll;
    if (locked === this.reported) return;
    this.reported = locked;
    this.onChange(locked);
  }
}
