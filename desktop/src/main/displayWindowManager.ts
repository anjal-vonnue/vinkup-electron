import { BrowserWindow, screen, type Display, type WebContents } from 'electron';
import type { BrowserAvailability, CheckpointDisplayState, UserRole } from '@itp/types';
import path from 'node:path';

const OVERLAY_COLOR = '#10131f';
const DISPLAY_EVENT_DEBOUNCE_MS = 200;
const FOCUS_LOSS_GRACE_MS = 700;
const ALERT_RETRY_DELAY_MS = 1000;
const FULLSCREEN_CHANGE_TIMEOUT_MS = 2000;
function isAlive(window: BrowserWindow | null | undefined): window is BrowserWindow {
  return Boolean(window && !window.isDestroyed());
}

function sameBounds(left: Electron.Rectangle, right: Electron.Rectangle): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function sameDisplayRegion(left: Electron.Rectangle, right: Electron.Rectangle): boolean {
  const leftArea = left.width * left.height;
  const rightArea = right.width * right.height;
  const smallerArea = Math.min(leftArea, rightArea);
  if (smallerArea <= 0) return false;

  const overlapWidth = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x)
  );
  const overlapHeight = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y)
  );
  return (overlapWidth * overlapHeight) / smallerArea >= 0.9;
}

function uniqueDisplayRegions(displays: Display[], preferred?: Display): Display[] {
  const candidates = preferred ? [preferred, ...displays] : displays;
  const regions: Display[] = [];
  for (const display of candidates) {
    if (!regions.some((region) => sameDisplayRegion(region.bounds, display.bounds))) {
      regions.push(display);
    }
  }
  return regions;
}

export class DisplayWindowManager {
  private readonly overlays = new Map<number, BrowserWindow>();
  private readonly overlayReferencesActive = new Map<number, boolean>();
  private readonly overlayResourcesActive = new Map<number, boolean>();
  private readonly alerts = new Map<number, BrowserWindow>();
  private readonly closeAuthorized = new WeakSet<BrowserWindow>();
  private readonly mainWindow: BrowserWindow;
  private readonly onExitChoice: () => void;
  private readonly overlayUrl: string;
  private readonly onAllowedOverlayFocusChange: (isFocused: boolean) => void;
  private readonly onOverlayInput: () => void;
  private appDisplayId: number;
  private reconcileTimer: NodeJS.Timeout | null = null;
  private focusWatchdog: NodeJS.Timeout | null = null;
  private appDisplaySyncTimer: NodeJS.Timeout | null = null;
  private launchFocusTimers: NodeJS.Timeout[] = [];
  private focusLostAt: number | null = null;
  private alertDismissedAt = 0;
  private pendingDisplayId: number | null = null;
  private isMoving = false;
  private isRelocatingByManager = false;
  private isRestoringFromAlert = false;
  private isAuthenticationInProgress = false;
  private isOverlayAuthenticated = true;
  private animateOverlayAuthentication = false;
  private isStaffSession = false;
  private isQuitting = false;
  private isStarted = false;
  private areAlertsOpen = false;
  private isReadyForFocusTracking = false;
  private alertReturnDisplayId: number | null = null;
  private focusedOverlayId: number | null = null;
  private allowedOverlayFocused = false;
  private displayTheme: 'light' | 'dark' = 'light';
  private mainResourcesActive = false;
  private mainResourcesFocused = false;
  private checkpointName: string | null = null;
  private lastDisplayMode: 'single' | 'extended' | 'mirrored' | null = null;

  constructor(
    mainWindow: BrowserWindow,
    onExitChoice: () => void,
    private readonly enabled: boolean,
    initialDisplayId: number | undefined,
    overlayUrl: string,
    onAllowedOverlayFocusChange: (isFocused: boolean) => void = () => {},
    onOverlayInput: () => void = () => {}
  ) {
    this.mainWindow = mainWindow;
    this.onExitChoice = onExitChoice;
    this.overlayUrl = overlayUrl;
    this.onAllowedOverlayFocusChange = onAllowedOverlayFocusChange;
    this.onOverlayInput = onOverlayInput;
    this.appDisplayId = initialDisplayId ?? screen.getPrimaryDisplay().id;
  }

  async start(): Promise<void> {
    if (!this.enabled || this.isStarted) return;
    this.isStarted = true;

    screen.on('display-added', this.onDisplayAdded);
    screen.on('display-removed', this.onDisplayRemoved);
    screen.on('display-metrics-changed', this.onDisplayMetricsChanged);

    this.mainWindow.on('move', this.onMainWindowMove);
    this.mainWindow.on('will-move', this.onMainWindowWillMove);
    this.mainWindow.on('blur', this.onMainWindowBlur);
    this.mainWindow.on('focus', this.onMainWindowFocus);
    this.mainWindow.on('show', this.onMainWindowShown);
    this.mainWindow.on('enter-full-screen', this.onMainWindowFullscreen);
    this.mainWindow.on('leave-full-screen', this.onMainWindowLeaveFullscreen);
    this.mainWindow.on('closed', this.onMainWindowClosed);
    this.mainWindow.once('ready-to-show', this.focusAtLaunch);
    this.mainWindow.webContents.on('did-finish-load', this.reconcile);

    this.focusWatchdog = setInterval(this.checkFocus, 100);
    if (this.isProtectionEnabledForCurrentUser() && !this.isAuthenticationInProgress) {
      if (!this.mainWindow.isFullScreen()) this.mainWindow.setFullScreen(true);
      this.keepOnAllWorkspaces(this.mainWindow);
    } else {
      this.mainWindow.setVisibleOnAllWorkspaces(false);
    }
    this.reconcile();
    await Promise.all([...this.overlays.values()].map((window) => this.waitUntilVisible(window)));
  }

  dispose(): void {
    if (this.isQuitting) return;
    this.isQuitting = true;

    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    if (this.appDisplaySyncTimer) clearTimeout(this.appDisplaySyncTimer);
    if (this.focusWatchdog) clearInterval(this.focusWatchdog);
    for (const timer of this.launchFocusTimers) clearTimeout(timer);
    this.launchFocusTimers = [];

    try {
      screen.removeListener('display-added', this.onDisplayAdded);
      screen.removeListener('display-removed', this.onDisplayRemoved);
      screen.removeListener('display-metrics-changed', this.onDisplayMetricsChanged);
    } catch (error) {
      console.warn('[desktop] Failed to remove screen listeners during dispose', error);
    }

    try {
      if (isAlive(this.mainWindow)) {
        this.mainWindow.removeListener('move', this.onMainWindowMove);
        this.mainWindow.removeListener('will-move', this.onMainWindowWillMove);
        this.mainWindow.removeListener('blur', this.onMainWindowBlur);
        this.mainWindow.removeListener('focus', this.onMainWindowFocus);
        this.mainWindow.removeListener('show', this.onMainWindowShown);
        this.mainWindow.removeListener('enter-full-screen', this.onMainWindowFullscreen);
        this.mainWindow.removeListener('leave-full-screen', this.onMainWindowLeaveFullscreen);
        this.mainWindow.removeListener('closed', this.onMainWindowClosed);

        if (!this.mainWindow.webContents.isDestroyed()) {
          this.mainWindow.webContents.removeListener('did-finish-load', this.reconcile);
        }
      }
    } catch (error) {
      console.warn('[desktop] Failed to remove window listeners during dispose', error);
    }

    try {
      this.clearAlerts();
    } catch (error) {
      console.error('[desktop] Error clearing alerts during dispose', error);
    }

    try {
      this.destroyAllOverlays();
    } catch (error) {
      console.error('[desktop] Error destroying overlays during dispose', error);
    }
  }

  async moveToNextDisplay(): Promise<void> {
    if (!this.isProtectionEnabledForCurrentUser()) return;
    const displays = screen.getAllDisplays();
    const currentDisplay = screen.getDisplayMatching(this.mainWindow.getBounds());
    const regions = uniqueDisplayRegions(displays, currentDisplay);
    if (regions.length < 2) return;

    const currentIndex = regions.findIndex((display) => display.id === currentDisplay.id);
    const nextDisplay = regions[(currentIndex + 1 + regions.length) % regions.length];
    if (nextDisplay) await this.moveToDisplay(nextDisplay);
  }

  ownsAlertSender(sender: WebContents): boolean {
    return [...this.alerts.values()].some(
      (window) => isAlive(window) && window.webContents === sender
    );
  }

  setOverlayReferencesActive(sender: WebContents, active: boolean): void {
    for (const [id, window] of this.overlays) {
      if (!isAlive(window) || window.webContents !== sender) continue;
      this.overlayReferencesActive.set(id, active);
      this.updateAllowedOverlayFocus();
      return;
    }
  }

  ownsOverlaySender(sender: WebContents): boolean {
    return this.getOverlayWindowForSender(sender) !== null;
  }

  getOverlayWindowForSender(sender: WebContents): BrowserWindow | null {
    for (const window of this.overlays.values()) {
      if (isAlive(window) && window.webContents === sender) return window;
    }
    return null;
  }

  setOverlayResourcesActive(sender: WebContents, active: boolean): void {
    for (const [id, window] of this.overlays) {
      if (!isAlive(window) || window.webContents !== sender) continue;
      if (!this.mainResourcesActive) {
        if (active) {
          for (const overlayId of this.overlayResourcesActive.keys()) {
            this.overlayResourcesActive.set(overlayId, false);
          }
        }
        this.overlayResourcesActive.set(id, active);
      }
      this.updateAllowedOverlayFocus();
      this.broadcastBrowserAvailability();
      return;
    }
  }

  setMainResourcesActive(active: boolean): void {
    this.mainResourcesActive = active;
    if (!active) this.mainResourcesFocused = false;
    if (active) {
      for (const id of this.overlayResourcesActive.keys()) {
        this.overlayResourcesActive.set(id, false);
      }
    }
    this.updateAllowedOverlayFocus();
    this.broadcastBrowserAvailability();
  }

  setMainResourcesFocused(focused: boolean): void {
    this.mainResourcesFocused = this.mainResourcesActive && focused;
    if (this.mainResourcesFocused) this.focusLostAt = null;
  }

  getBrowserAvailability(): BrowserAvailability {
    return {
      mainResourcesActive: this.mainResourcesActive,
      secondaryResourcesActive: [...this.overlayResourcesActive.values()].some(Boolean),
    };
  }

  /**
   * Replaces the secondary display's Resources/References UI with a good-luck
   * screen while the trainee is in the Checkpoints section. `null` restores the
   * normal UI.
   */
  setCheckpointActive(name: string | null): void {
    const normalized = typeof name === 'string' && name.trim() ? name.trim() : null;
    if (this.checkpointName === normalized) return;
    this.checkpointName = normalized;
    this.broadcastCheckpointState();
  }

  getCheckpointState(): CheckpointDisplayState {
    return {
      active: this.checkpointName !== null,
      traineeName: this.checkpointName,
    };
  }

  isAllowedOverlayContentFocused(): boolean {
    return this.allowedOverlayFocused;
  }

  handleAlertChoice(choice: unknown): void {
    if (choice === 'back') {
      this.dismissAlerts();
    } else if (choice === 'exit') {
      this.onExitChoice();
    }
  }

  setProtectionContext(
    authenticationInProgress: boolean,
    role: UserRole | null,
    authenticated = role !== null,
    animateAuthentication = false
  ): void {
    if (this.isQuitting) return;
    const wasProtectionSuspended = this.isAuthenticationInProgress || this.isStaffSession;
    this.isAuthenticationInProgress = authenticationInProgress;
    this.isStaffSession = role === 'mentor' || role === 'manager';
    this.setOverlayAuthenticated(authenticated && !this.isStaffSession, animateAuthentication);
    if (!this.enabled) return;

    if (this.isStaffSession) {
      this.focusLostAt = null;
      this.checkpointName = null;
      this.clearAlerts();
      this.destroyAllOverlays();
      for (const timer of this.launchFocusTimers) clearTimeout(timer);
      this.launchFocusTimers = [];
      if (isAlive(this.mainWindow)) {
        if (this.mainWindow.isFullScreen()) this.mainWindow.setFullScreen(false);
        this.mainWindow.setVisibleOnAllWorkspaces(false);
      }
      return;
    }

    if (this.isAuthenticationInProgress) {
      this.focusLostAt = null;
      this.checkpointName = null;
      this.clearAlerts();
      this.destroyAllOverlays();
      if (isAlive(this.mainWindow)) {
        if (this.mainWindow.isFullScreen()) this.mainWindow.setFullScreen(false);
        this.mainWindow.setVisibleOnAllWorkspaces(false);
      }
      return;
    }

    if (!this.isOverlayAuthenticated) {
      this.focusLostAt = null;
      this.checkpointName = null;
      this.clearAlerts();
      this.destroyAllOverlays();
      if (isAlive(this.mainWindow)) {
        if (this.mainWindow.isFullScreen()) this.mainWindow.setFullScreen(false);
        this.mainWindow.setVisibleOnAllWorkspaces(false);
      }
      return;
    }

    if ((!wasProtectionSuspended && !this.isStaffSession) || this.isMoving) return;
    if (isAlive(this.mainWindow)) {
      this.appDisplayId = screen.getDisplayMatching(this.mainWindow.getBounds()).id;
      this.mainWindow.show();
      this.mainWindow.focus();
      void this.restoreProtectionAfterAuthentication();
    }
  }

  isProtectionEnabledForCurrentUser(): boolean {
    return this.enabled && this.isOverlayAuthenticated && !this.isStaffSession;
  }

  shouldPreventMinimize(): boolean {
    return this.isProtectionEnabledForCurrentUser();
  }

  async restoreMainWindowAfterMinimize(): Promise<void> {
    if (!this.isProtectionEnabledForCurrentUser()) return;
    await this.restoreMainWindowForFocus();
    if (!isAlive(this.mainWindow) || this.isQuitting) return;
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  async setDisplayTheme(theme: 'light' | 'dark'): Promise<void> {
    this.displayTheme = theme;
    await Promise.all(
      [...this.overlays.values()].filter(isAlive).map((window) => this.applyDisplayTheme(window))
    );
  }

  private setOverlayAuthenticated(authenticated: boolean, animate = false): void {
    if (this.isOverlayAuthenticated === authenticated) {
      if (authenticated && animate) this.animateOverlayAuthentication = true;
      return;
    }
    this.isOverlayAuthenticated = authenticated;
    this.animateOverlayAuthentication = authenticated && animate;
    for (const window of this.overlays.values()) {
      this.sendOverlayAuthenticationState(window, this.animateOverlayAuthentication);
    }
  }

  private readonly onDisplayAdded = (): void => {
    this.scheduleReconcile();
  };

  private readonly onDisplayMetricsChanged = (): void => {
    this.scheduleReconcile();
  };

  private readonly onDisplayRemoved = (_event: Electron.Event, removed: Display): void => {
    if (this.isStaffSession || !this.isOverlayAuthenticated) return;
    if (removed.id === this.appDisplayId) {
      const currentDisplay = screen.getDisplayMatching(this.mainWindow.getBounds());
      if (currentDisplay.id !== removed.id) {
        this.appDisplayId = currentDisplay.id;
        this.scheduleReconcile();
        return;
      }
      void this.moveToDisplay(screen.getPrimaryDisplay()).catch((error: unknown) => {
        console.error('[desktop] Failed to move the app to the primary display', error);
      });
      return;
    }
    this.scheduleReconcile();
  };

  private readonly onMainWindowWillMove = (): void => {
    if (
      this.isQuitting ||
      !this.isOverlayAuthenticated ||
      this.isStaffSession ||
      this.isMoving ||
      this.isRestoringFromAlert ||
      !isAlive(this.mainWindow)
    ) {
      return;
    }
    this.isMoving = true;
    this.focusLostAt = null;
    this.scheduleAppDisplaySync();
  };

  private readonly onMainWindowMove = (): void => {
    if (
      this.isQuitting ||
      !this.isOverlayAuthenticated ||
      this.isStaffSession ||
      !isAlive(this.mainWindow)
    ) {
      return;
    }
    if (this.isRelocatingByManager) {
      this.keepMainWindowOnCorrectWorkspaces();
      return;
    }
    this.keepMainWindowOnCorrectWorkspaces();
    this.scheduleAppDisplaySync();
  };

  private readonly onMainWindowBlur = (): void => {
    if (this.isAuthenticationInProgress || !this.isOverlayAuthenticated || this.isStaffSession) {
      return;
    }
    if (this.focusLostAt === null) this.focusLostAt = Date.now();
  };

  private readonly onMainWindowFocus = (): void => {
    this.isReadyForFocusTracking = true;
    this.focusLostAt = null;
    if (this.isRestoringFromAlert) return;
    if (this.areAlertsOpen) {
      this.dismissAlerts();
      return;
    }
    this.raiseOverlays();
  };

  private readonly onMainWindowShown = (): void => {
    this.keepMainWindowOnCorrectWorkspaces();
  };

  private readonly onMainWindowFullscreen = (): void => {
    if (!this.isProtectionEnabledForCurrentUser() || this.isAuthenticationInProgress) {
      this.mainWindow.setVisibleOnAllWorkspaces(false);
      return;
    }
    this.keepOnAllWorkspaces(this.mainWindow);
    if (!this.isMoving) this.reconcile();
  };

  private readonly onMainWindowLeaveFullscreen = (): void => {
    if (
      this.isMoving ||
      !this.isOverlayAuthenticated ||
      this.isStaffSession ||
      this.isQuitting ||
      !isAlive(this.mainWindow)
    ) {
      return;
    }
    void this.restoreMainWindowForFocus().catch((error: unknown) => {
      console.error('[desktop] Failed to restore fullscreen after leaving fullscreen', error);
    });
  };

  private readonly onMainWindowClosed = (): void => {
    this.dispose();
  };

  private readonly focusAtLaunch = (): void => {
    if (!isAlive(this.mainWindow) || this.isQuitting) return;
    this.mainWindow.show();
    if (this.isProtectionEnabledForCurrentUser() && !this.isAuthenticationInProgress) {
      if (!this.mainWindow.isFullScreen()) this.mainWindow.setFullScreen(true);
    }
    this.keepMainWindowOnCorrectWorkspaces();
    if (this.isStaffSession || this.isAuthenticationInProgress) return;
    this.mainWindow.focus();

    this.launchFocusTimers.push(
      setTimeout(() => {
        if (
          isAlive(this.mainWindow) &&
          !this.isQuitting &&
          !this.isAuthenticationInProgress &&
          !this.isStaffSession
        ) {
          this.mainWindow.focus();
          this.isReadyForFocusTracking = true;
        }
      }, 800)
    );
  };

  private readonly checkFocus = (): void => {
    if (
      !this.isReadyForFocusTracking ||
      this.isQuitting ||
      this.isAuthenticationInProgress ||
      !this.isOverlayAuthenticated ||
      this.isStaffSession ||
      this.isMoving ||
      this.isRestoringFromAlert ||
      !isAlive(this.mainWindow)
    ) {
      this.focusLostAt = null;
      return;
    }

    if (this.areAlertsOpen) {
      const alertFocused = [...this.alerts.values()].some(
        (window) => isAlive(window) && window.isFocused()
      );
      if (!alertFocused) {
        for (const alert of this.alerts.values()) {
          if (isAlive(alert)) {
            alert.setAlwaysOnTop(true, 'screen-saver');
            alert.show();
            alert.moveTop();
          }
        }
        const cursorPoint = screen.getCursorScreenPoint();
        const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
        const targetAlert = this.getAlertForDisplay(activeDisplay, screen.getAllDisplays());
        if (isAlive(targetAlert)) targetAlert.focus();
      }
      return;
    }

    const ownWindowFocused = [this.mainWindow, ...this.overlays.values()].some(
      (window) => isAlive(window) && window.isFocused()
    );
    if (ownWindowFocused || (this.mainResourcesActive && this.mainResourcesFocused)) {
      this.focusLostAt = null;
      return;
    }

    if (this.focusLostAt === null) this.focusLostAt = Date.now();
    if (Date.now() - this.focusLostAt < FOCUS_LOSS_GRACE_MS) return;
    if (Date.now() - this.alertDismissedAt < ALERT_RETRY_DELAY_MS) return;

    this.openAlerts();
  };

  private scheduleReconcile(): void {
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    this.reconcileTimer = setTimeout(() => {
      this.reconcileTimer = null;
      this.reconcile();
    }, DISPLAY_EVENT_DEBOUNCE_MS);
  }

  private readonly reconcile = (): void => {
    if (this.isQuitting || this.isStaffSession || this.isMoving || !isAlive(this.mainWindow)) {
      return;
    }

    const displays = screen.getAllDisplays();
    const appDisplay = screen.getDisplayMatching(this.mainWindow.getBounds());
    this.appDisplayId = appDisplay.id;
    const regions = uniqueDisplayRegions(displays, appDisplay);
    const displayMode =
      regions.length < displays.length ? 'mirrored' : regions.length < 2 ? 'single' : 'extended';
    if (this.lastDisplayMode !== displayMode) {
      console.info(`[display] Display layout detected: ${displayMode}.`);
      this.lastDisplayMode = displayMode;
    }

    this.reconcileOverlayWindows(regions, appDisplay);
    if (this.isAuthenticationInProgress || !this.isOverlayAuthenticated) {
      this.clearAlerts();
      return;
    }

    this.reconcileAlerts(displays);
  };

  private reconcileOverlayWindows(
    displays = screen.getAllDisplays(),
    appDisplay = screen.getDisplayMatching(this.mainWindow.getBounds())
  ): void {
    if (
      this.isQuitting ||
      this.isStaffSession ||
      !this.isOverlayAuthenticated ||
      !isAlive(this.mainWindow)
    ) {
      this.destroyAllOverlays();
      return;
    }
    this.appDisplayId = appDisplay.id;
    const uniqueRegions = uniqueDisplayRegions(displays, appDisplay);
    const wantedOverlayIds = new Set(
      uniqueRegions
        .filter((display) => !sameDisplayRegion(display.bounds, appDisplay.bounds))
        .map((display) => display.id)
    );

    for (const [id, window] of this.overlays) {
      if (!wantedOverlayIds.has(id)) this.destroyOverlay(id, window);
    }

    for (const display of uniqueRegions) {
      if (sameDisplayRegion(display.bounds, appDisplay.bounds)) continue;
      const existing = this.overlays.get(display.id);
      if (!isAlive(existing)) {
        this.createOverlay(display);
      } else if (!sameBounds(existing.getBounds(), display.bounds)) {
        this.placeWindow(existing, display.bounds);
      }
    }
  }

  private async moveToDisplay(requestedDisplay: Display): Promise<void> {
    if (
      this.isQuitting ||
      !this.isOverlayAuthenticated ||
      this.isStaffSession ||
      !isAlive(this.mainWindow)
    ) {
      return;
    }
    if (this.isMoving) {
      this.pendingDisplayId = requestedDisplay.id;
      return;
    }
    const target =
      screen.getAllDisplays().find((display) => display.id === requestedDisplay.id) ??
      screen.getPrimaryDisplay();
    if (
      screen.getDisplayMatching(this.mainWindow.getBounds()).id === target.id &&
      this.mainWindow.isFullScreen()
    ) {
      this.appDisplayId = target.id;
      return;
    }

    this.isMoving = true;
    this.isRelocatingByManager = true;

    try {
      this.destroyOverlay(target.id);

      await this.setFullscreen(false);
      if (!isAlive(this.mainWindow) || this.isQuitting || this.isStaffSession) return;

      this.mainWindow.setBounds(target.bounds);
      await this.setFullscreen(true);
      if (!isAlive(this.mainWindow) || this.isQuitting || this.isStaffSession) return;

      this.appDisplayId = target.id;
    } catch (error) {
      console.error('[desktop] Failed to move the app between displays', error);
      if (
        isAlive(this.mainWindow) &&
        !this.isQuitting &&
        !this.isStaffSession &&
        !this.mainWindow.isFullScreen()
      ) {
        try {
          await this.setFullscreen(true);
        } catch (fullscreenError) {
          console.error(
            '[desktop] Failed to restore fullscreen after moving displays',
            fullscreenError
          );
        }
      }
      if (isAlive(this.mainWindow)) {
        this.appDisplayId = screen.getDisplayMatching(this.mainWindow.getBounds()).id;
      }
    } finally {
      this.isRelocatingByManager = false;
      this.isMoving = false;
      if (this.isStaffSession && isAlive(this.mainWindow)) {
        if (this.mainWindow.isFullScreen()) this.mainWindow.setFullScreen(false);
        this.mainWindow.setVisibleOnAllWorkspaces(false);
      }
      this.reconcile();
      if (
        isAlive(this.mainWindow) &&
        !this.isQuitting &&
        !this.isAuthenticationInProgress &&
        !this.isStaffSession
      ) {
        this.mainWindow.focus();
      }
      this.moveToPendingDisplay();
    }
  }

  private async setFullscreen(fullscreen: boolean, window = this.mainWindow): Promise<void> {
    if (!isAlive(window) || window.isFullScreen() === fullscreen) return;

    await new Promise<void>((resolve, reject) => {
      const onChanged = (): void => {
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        if (fullscreen) {
          window.removeListener('enter-full-screen', onChanged);
        } else {
          window.removeListener('leave-full-screen', onChanged);
        }
        if (isAlive(window) && window.isFullScreen() === fullscreen) {
          resolve();
        } else {
          reject(new Error(`Timed out waiting for fullscreen=${fullscreen}.`));
        }
      }, FULLSCREEN_CHANGE_TIMEOUT_MS);

      if (fullscreen) {
        window.once('enter-full-screen', onChanged);
      } else {
        window.once('leave-full-screen', onChanged);
      }
      window.setFullScreen(fullscreen);
    });
  }

  private async restoreMinimizedWindow(window: BrowserWindow): Promise<void> {
    if (!window.isMinimized()) return;

    await new Promise<void>((resolve, reject) => {
      const onRestored = (): void => {
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        window.removeListener('restore', onRestored);
        if (isAlive(window) && !window.isMinimized()) {
          resolve();
        } else {
          reject(new Error('Timed out waiting for the window to be restored.'));
        }
      }, FULLSCREEN_CHANGE_TIMEOUT_MS);
      window.once('restore', onRestored);
      window.restore();
    });
  }

  private async restoreMainWindowForFocus(): Promise<void> {
    const window = this.mainWindow;
    if (!isAlive(window) || this.isQuitting) return;

    await this.restoreMinimizedWindow(window);
    if (!isAlive(window) || this.isQuitting || !this.isProtectionEnabledForCurrentUser()) {
      return;
    }

    if (!window.isFullScreen()) await this.setFullscreen(true);
    if (!isAlive(window) || this.isQuitting) return;
    this.keepMainWindowOnCorrectWorkspaces();
  }

  private async restoreProtectionAfterAuthentication(): Promise<void> {
    const window = this.mainWindow;
    if (!isAlive(window) || this.isQuitting || !this.isOverlayAuthenticated) return;

    try {
      if (!window.isFullScreen()) await this.setFullscreen(true);
      if (!isAlive(window) || this.isQuitting || !this.isOverlayAuthenticated) return;

      this.appDisplayId = screen.getDisplayMatching(window.getBounds()).id;
      this.keepOnAllWorkspaces(window);
      this.reconcile();
    } catch (error) {
      console.error('[desktop] Failed to restore fullscreen after authentication', error);
    }
  }

  private scheduleAppDisplaySync(): void {
    if (this.appDisplaySyncTimer) clearTimeout(this.appDisplaySyncTimer);
    this.appDisplaySyncTimer = setTimeout(() => {
      this.appDisplaySyncTimer = null;
      void this.syncAppDisplay().catch((error: unknown) => {
        console.error('[desktop] Failed to synchronize the app display', error);
      });
    }, DISPLAY_EVENT_DEBOUNCE_MS);
  }

  private async syncAppDisplay(): Promise<void> {
    if (
      this.isQuitting ||
      !this.isOverlayAuthenticated ||
      this.isStaffSession ||
      this.isRelocatingByManager ||
      !isAlive(this.mainWindow)
    ) {
      return;
    }
    try {
      const current = screen.getDisplayMatching(this.mainWindow.getBounds());
      if (current.id !== this.appDisplayId) {
        this.appDisplayId = current.id;
        if (!this.mainWindow.isFullScreen()) await this.setFullscreen(true);
        if (!isAlive(this.mainWindow) || this.isQuitting) return;
        if (this.isStaffSession) {
          if (this.mainWindow.isFullScreen()) this.mainWindow.setFullScreen(false);
          this.mainWindow.setVisibleOnAllWorkspaces(false);
          return;
        }
      }
    } finally {
      this.isMoving = false;
      this.reconcile();
      if (
        isAlive(this.mainWindow) &&
        !this.isQuitting &&
        !this.isAuthenticationInProgress &&
        !this.isStaffSession
      ) {
        this.mainWindow.focus();
      }
      this.moveToPendingDisplay();
    }
  }

  private moveToPendingDisplay(): void {
    const pendingDisplayId = this.pendingDisplayId;
    this.pendingDisplayId = null;
    if (pendingDisplayId === null || this.isQuitting) return;

    const pendingDisplay =
      screen.getAllDisplays().find((display) => display.id === pendingDisplayId) ??
      screen.getPrimaryDisplay();
    void this.moveToDisplay(pendingDisplay).catch((error: unknown) => {
      console.error('[desktop] Failed to move to a pending display', error);
    });
  }

  private async waitUntilVisible(window: BrowserWindow): Promise<void> {
    if (!isAlive(window)) throw new Error('A display cover was destroyed before it appeared.');
    if (window.isVisible()) return;

    await new Promise<void>((resolve, reject) => {
      const onShown = (): void => {
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        window.removeListener('show', onShown);
        reject(new Error('Timed out waiting for a display cover to become visible.'));
      }, FULLSCREEN_CHANGE_TIMEOUT_MS);
      window.once('show', onShown);
    });
  }

  private createOverlay(display: Display): BrowserWindow {
    const window = new BrowserWindow({
      ...display.bounds,
      show: false,
      frame: false,
      fullscreen: true,
      skipTaskbar: true,
      backgroundColor: OVERLAY_COLOR,
      webPreferences: {
        preload: path.join(__dirname, '../preload/overlay.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.overlays.set(display.id, window);
    this.overlayReferencesActive.set(display.id, false);
    this.overlayResourcesActive.set(display.id, false);
    this.configureWindow(window, true);
    window.on('will-move', (event) => event.preventDefault());
    window.on('move', () => this.placeWindow(window, display.bounds));
    // Any key, click, scroll or mouse move here, even while the window is not focused
    // (e.g. scrolling a reference with the wheel). The task page counts it as activity.
    window.webContents.on('input-event', () => this.onOverlayInput());
    window.on('focus', () => {
      this.focusedOverlayId = display.id;
      this.updateAllowedOverlayFocus();
      this.focusLostAt = null;
      if (this.areAlertsOpen) this.dismissAlerts();
    });
    window.on('blur', () => {
      if (this.focusedOverlayId === display.id) this.focusedOverlayId = null;
      this.updateAllowedOverlayFocus();
    });
    window.on('close', (event) => {
      if (!this.closeAuthorized.has(window) && !this.isQuitting) event.preventDefault();
    });
    window.on('closed', () => {
      if (this.overlays.get(display.id) !== window) return;
      this.overlays.delete(display.id);
      this.overlayReferencesActive.delete(display.id);
      this.overlayResourcesActive.delete(display.id);
      if (this.focusedOverlayId === display.id) this.focusedOverlayId = null;
      this.updateAllowedOverlayFocus();
      this.broadcastBrowserAvailability();
    });
    window.once('ready-to-show', () => {
      if (!isAlive(window) || this.isQuitting) return;
      this.placeWindow(window, display.bounds);
      window.setFullScreen(true);
      window.setAlwaysOnTop(true, 'screen-saver');
      window.showInactive();
      window.moveTop();
    });
    void window
      .loadURL(this.getOverlayUrl())
      .then(() => this.applyDisplayTheme(window))
      .then(() => this.sendBrowserAvailability(window))
      .then(() => this.sendOverlayAuthenticationState(window, this.animateOverlayAuthentication))
      .then(() => this.sendCheckpointState(window))
      .catch((error: unknown) => console.error('[desktop] Failed to load display overlay', error));
    return window;
  }

  private updateAllowedOverlayFocus(): void {
    const focusedOverlayId = this.focusedOverlayId;
    const isFocused =
      focusedOverlayId !== null &&
      (this.overlayReferencesActive.get(focusedOverlayId) === true ||
        this.overlayResourcesActive.get(focusedOverlayId) === true);
    if (this.allowedOverlayFocused === isFocused) return;
    this.allowedOverlayFocused = isFocused;
    this.onAllowedOverlayFocusChange(isFocused);
  }

  private applyDisplayTheme(window: BrowserWindow): Promise<void> {
    if (!isAlive(window)) return Promise.resolve();
    return window.webContents
      .executeJavaScript(`document.documentElement.dataset.theme = '${this.displayTheme}'`)
      .then(() => undefined);
  }

  private sendBrowserAvailability(window: BrowserWindow): void {
    if (!isAlive(window) || window.webContents.isDestroyed()) return;
    window.webContents.send('browser:availability-changed', this.getBrowserAvailability());
  }

  private sendCheckpointState(window: BrowserWindow): void {
    if (!isAlive(window) || window.webContents.isDestroyed()) return;
    window.webContents.send('display-overlay:checkpoint-state', this.getCheckpointState());
  }

  private getOverlayUrl(): string {
    const url = new URL('overlay.html', `${this.overlayUrl.replace(/\/$/, '')}/`);
    url.searchParams.set(
      'authenticated',
      String(this.isOverlayAuthenticated && !this.animateOverlayAuthentication)
    );
    return url.toString();
  }

  private sendOverlayAuthenticationState(window: BrowserWindow, animate = false): void {
    if (!isAlive(window) || window.webContents.isDestroyed()) return;
    window.webContents.send('display-overlay:auth-state', this.isOverlayAuthenticated, animate);
  }

  private broadcastBrowserAvailability(): void {
    if (isAlive(this.mainWindow) && !this.mainWindow.webContents.isDestroyed()) {
      this.mainWindow.webContents.send(
        'browser:availability-changed',
        this.getBrowserAvailability()
      );
    }
    for (const window of this.overlays.values()) this.sendBrowserAvailability(window);
  }

  private broadcastCheckpointState(): void {
    for (const window of this.overlays.values()) this.sendCheckpointState(window);
  }

  private destroyOverlay(id: number, expectedWindow?: BrowserWindow): void {
    const window = this.overlays.get(id);
    if (!window || (expectedWindow && expectedWindow !== window)) return;
    this.overlays.delete(id);
    this.overlayReferencesActive.delete(id);
    this.overlayResourcesActive.delete(id);
    if (this.focusedOverlayId === id) this.focusedOverlayId = null;
    this.updateAllowedOverlayFocus();
    this.broadcastBrowserAvailability();
    this.closeOwnedWindow(window);
  }

  private destroyAllOverlays(): void {
    for (const [id, window] of this.overlays) this.destroyOverlay(id, window);
  }

  private openAlerts(): void {
    if (
      this.areAlertsOpen ||
      this.isQuitting ||
      this.isAuthenticationInProgress ||
      this.isStaffSession ||
      this.isMoving ||
      !isAlive(this.mainWindow)
    ) {
      return;
    }
    this.areAlertsOpen = true;
    this.alertReturnDisplayId = this.appDisplayId;
    this.reconcileAlerts(screen.getAllDisplays());
    for (const alert of this.alerts.values()) {
      if (isAlive(alert)) {
        alert.setAlwaysOnTop(true, 'screen-saver');
        alert.show();
        alert.moveTop();
      }
    }
    const displays = screen.getAllDisplays();
    const cursorPoint = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
    const targetAlert = this.getAlertForDisplay(activeDisplay, displays);
    if (isAlive(targetAlert)) targetAlert.focus();
  }

  private reconcileAlerts(displays: Display[]): void {
    if (!this.areAlertsOpen || this.isQuitting) return;
    const appDisplay = screen.getDisplayMatching(this.mainWindow.getBounds());
    const regions = uniqueDisplayRegions(displays, appDisplay);
    const wantedIds = new Set(regions.map((display) => display.id));
    for (const [id, window] of this.alerts) {
      if (!wantedIds.has(id)) this.destroyAlert(id, window);
    }
    for (const display of regions) {
      const existing = this.alerts.get(display.id);
      if (!isAlive(existing)) {
        this.createAlert(display);
      } else if (!sameBounds(existing.getBounds(), display.bounds)) {
        this.placeWindow(existing, display.bounds);
      }
    }
  }

  private getAlertForDisplay(display: Display, displays: Display[]): BrowserWindow | null {
    const matchingRegion = uniqueDisplayRegions(displays).find((candidate) =>
      sameDisplayRegion(candidate.bounds, display.bounds)
    );
    const matchingAlert = matchingRegion ? this.alerts.get(matchingRegion.id) : null;
    if (isAlive(matchingAlert)) return matchingAlert;
    const fallback = this.alerts.values().next().value;
    return isAlive(fallback) ? fallback : null;
  }

  private createAlert(display: Display): BrowserWindow {
    const window = new BrowserWindow({
      ...display.bounds,
      show: false,
      frame: false,
      fullscreen: true,
      skipTaskbar: true,
      backgroundColor: OVERLAY_COLOR,
      webPreferences: {
        preload: path.join(__dirname, '../preload/alert.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.alerts.set(display.id, window);
    this.configureWindow(window, true);
    window.on('will-move', (event) => event.preventDefault());
    window.on('move', () => this.placeWindow(window, display.bounds));
    window.on('close', (event) => {
      if (!this.closeAuthorized.has(window) && !this.isQuitting) event.preventDefault();
    });
    window.on('closed', () => {
      if (this.alerts.get(display.id) === window) this.alerts.delete(display.id);
    });
    window.once('ready-to-show', () => {
      if (!isAlive(window) || this.isQuitting) return;
      this.placeWindow(window, display.bounds);
      window.setFullScreen(true);
      window.setAlwaysOnTop(true, 'screen-saver');
      window.show();
      window.moveTop();
      const cursorPoint = screen.getCursorScreenPoint();
      const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
      if (sameDisplayRegion(display.bounds, activeDisplay.bounds)) window.focus();
    });
    void window
      .loadFile(path.join(__dirname, 'alert.html'))
      .catch((error: unknown) => console.error('[desktop] Failed to load focus alert', error));
    return window;
  }

  private dismissAlerts(): void {
    void this.dismissAlertsAndRestore().catch((error: unknown) => {
      console.error('[desktop] Failed to restore the app after the focus alert', error);
    });
  }

  private async dismissAlertsAndRestore(): Promise<void> {
    if (this.isRestoringFromAlert) return;
    this.isRestoringFromAlert = true;
    const displays = screen.getAllDisplays();
    const returnDisplay = displays.find((display) => display.id === this.alertReturnDisplayId);
    try {
      if (!isAlive(this.mainWindow) || this.isQuitting) return;
      await this.restoreMainWindowForFocus();
      if (!isAlive(this.mainWindow) || this.isQuitting) return;

      this.mainWindow.show();
      this.mainWindow.moveTop();
      this.mainWindow.setAlwaysOnTop(true, 'screen-saver');
      this.keepOnAllWorkspaces(this.mainWindow);
      await Promise.all(
        [...this.overlays.values()].map((window) => this.restoreDisplayWindow(window))
      );
      if (!isAlive(this.mainWindow) || this.isQuitting) return;

      const currentDisplay = screen.getDisplayMatching(this.mainWindow.getBounds());
      if (returnDisplay && !sameDisplayRegion(currentDisplay.bounds, returnDisplay.bounds)) {
        this.appDisplayId = returnDisplay.id;
        this.clearAlerts();
        this.alertDismissedAt = Date.now();
        this.focusLostAt = null;
        void this.moveToDisplay(returnDisplay).catch((error: unknown) => {
          console.error('[desktop] Failed to return to the app display', error);
        });
        return;
      }

      if (returnDisplay) this.appDisplayId = currentDisplay.id;
      this.mainWindow.focus();
      this.clearAlerts();
      this.alertDismissedAt = Date.now();
      this.focusLostAt = null;
      this.mainWindow.show();
      this.mainWindow.moveTop();
      this.mainWindow.focus();
      this.raiseOverlays();
    } finally {
      this.isRestoringFromAlert = false;
    }
  }

  private async restoreDisplayWindow(window: BrowserWindow): Promise<void> {
    if (!isAlive(window) || this.isQuitting) return;
    window.restore();
    await this.restoreMinimizedWindow(window);
    if (!isAlive(window) || this.isQuitting) return;
    if (!window.isFullScreen()) await this.setFullscreen(true, window);
    if (!isAlive(window) || this.isQuitting) return;
    window.setAlwaysOnTop(true, 'screen-saver');
    window.showInactive();
    window.moveTop();
  }

  private raiseOverlays(): void {
    if (this.isQuitting || this.isStaffSession || this.isAuthenticationInProgress) return;
    for (const window of this.overlays.values()) {
      if (isAlive(window)) {
        if (window.isMinimized()) window.restore();
        if (!window.isFullScreen()) window.setFullScreen(true);
        window.setAlwaysOnTop(true, 'screen-saver');
        window.showInactive();
        window.moveTop();
      }
    }
  }

  private clearAlerts(): void {
    this.areAlertsOpen = false;
    this.alertReturnDisplayId = null;
    for (const [id, window] of this.alerts) this.destroyAlert(id, window);
  }

  private destroyAlert(id: number, expectedWindow?: BrowserWindow): void {
    const window = this.alerts.get(id);
    if (!window || (expectedWindow && expectedWindow !== window)) return;
    this.alerts.delete(id);
    this.closeOwnedWindow(window);
  }

  private configureWindow(window: BrowserWindow, focusable: boolean): void {
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setFocusable(focusable);
    this.keepOnAllWorkspaces(window);
    window.on('show', () => this.keepOnAllWorkspaces(window));
    window.on('move', () => this.keepOnAllWorkspaces(window));
    window.on('enter-full-screen', () => this.keepOnAllWorkspaces(window));
    window.on('leave-full-screen', () => {
      if (this.isQuitting || !isAlive(window)) return;
      window.setFullScreen(true);
      this.keepOnAllWorkspaces(window);
    });
  }

  private placeWindow(window: BrowserWindow, bounds: Electron.Rectangle): void {
    if (!isAlive(window)) return;
    window.setBounds(bounds);
    this.keepOnAllWorkspaces(window);
  }

  private keepOnAllWorkspaces(window: BrowserWindow): void {
    if (!isAlive(window)) return;
    try {
      window.setVisibleOnAllWorkspaces(true);
    } catch (error) {
      console.warn('[desktop] Could not keep a display window on all workspaces', error);
    }
    setTimeout(() => {
      if (!isAlive(window)) return;
      try {
        window.setVisibleOnAllWorkspaces(true);
      } catch (error) {
        console.warn('[desktop] Could not reapply all-workspaces visibility', error);
      }
    }, 300);
  }

  private keepMainWindowOnCorrectWorkspaces(): void {
    if (!isAlive(this.mainWindow)) return;
    if (this.isProtectionEnabledForCurrentUser() && !this.isAuthenticationInProgress) {
      this.keepOnAllWorkspaces(this.mainWindow);
    } else {
      this.mainWindow.setVisibleOnAllWorkspaces(false);
    }
  }

  private closeOwnedWindow(window: BrowserWindow): void {
    if (!isAlive(window)) return;
    this.closeAuthorized.add(window);
    try {
      window.destroy();
    } catch {
      try {
        window.close();
      } catch {
        // ignore if already destroyed
      }
    }
  }
}
