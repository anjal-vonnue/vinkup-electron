import { BrowserWindow, screen, type Display, type WebContents } from 'electron';
import type { UserRole } from '@itp/types';
import path from 'node:path';

const OVERLAY_COLOR = '#10131f';
const DISPLAY_EVENT_DEBOUNCE_MS = 200;
const FOCUS_LOSS_GRACE_MS = 700;
const ALERT_RETRY_DELAY_MS = 1000;
const FULLSCREEN_CHANGE_TIMEOUT_MS = 2000;
const CERTIFICATE_PRINT_TIMEOUT_MS = 120_000;

function isCertificatePageUrl(url: string): boolean {
  try {
    return /^\/certificates\/[^/]+\/?$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

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

export class DisplayWindowManager {
  private readonly overlays = new Map<number, BrowserWindow>();
  private readonly alerts = new Map<number, BrowserWindow>();
  private readonly closeAuthorized = new WeakSet<BrowserWindow>();
  private readonly mainWindow: BrowserWindow;
  private readonly onExitChoice: () => void;
  private appDisplayId: number;
  private reconcileTimer: NodeJS.Timeout | null = null;
  private focusWatchdog: NodeJS.Timeout | null = null;
  private appDisplaySyncTimer: NodeJS.Timeout | null = null;
  private certificatePrintTimer: NodeJS.Timeout | null = null;
  private launchFocusTimers: NodeJS.Timeout[] = [];
  private focusLostAt: number | null = null;
  private alertDismissedAt = 0;
  private pendingDisplayId: number | null = null;
  private isMoving = false;
  private isRelocatingByManager = false;
  private isAuthenticationInProgress = false;
  private isAdminSession = false;
  private isCertificatePrintInProgress = false;
  private isQuitting = false;
  private isStarted = false;
  private areAlertsOpen = false;
  private isReadyForFocusTracking = false;

  constructor(
    mainWindow: BrowserWindow,
    onExitChoice: () => void,
    private readonly enabled: boolean,
    initialDisplayId?: number
  ) {
    this.mainWindow = mainWindow;
    this.onExitChoice = onExitChoice;
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
    this.mainWindow.webContents.on('did-start-navigation', this.onMainFrameNavigationStart);
    this.mainWindow.webContents.on('did-navigate-in-page', this.onMainFrameNavigation);

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
    if (this.certificatePrintTimer) clearTimeout(this.certificatePrintTimer);
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
          this.mainWindow.webContents.removeListener(
            'did-start-navigation',
            this.onMainFrameNavigationStart
          );
          this.mainWindow.webContents.removeListener(
            'did-navigate-in-page',
            this.onMainFrameNavigation
          );
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

  beginCertificatePrint(): void {
    if (
      !this.isProtectionEnabledForCurrentUser() ||
      this.isQuitting ||
      this.isAuthenticationInProgress ||
      !isAlive(this.mainWindow)
    ) {
      return;
    }

    this.isCertificatePrintInProgress = true;
    this.focusLostAt = null;
    if (this.certificatePrintTimer) clearTimeout(this.certificatePrintTimer);
    this.certificatePrintTimer = setTimeout(() => {
      console.warn('[desktop] Certificate print protection exception expired.');
      this.endCertificatePrint();
    }, CERTIFICATE_PRINT_TIMEOUT_MS);
  }

  endCertificatePrint(): void {
    if (!this.isCertificatePrintInProgress) return;
    this.isCertificatePrintInProgress = false;
    if (this.certificatePrintTimer) clearTimeout(this.certificatePrintTimer);
    this.certificatePrintTimer = null;

    if (
      this.isQuitting ||
      this.isAuthenticationInProgress ||
      this.isAdminSession ||
      this.isMoving
    ) {
      return;
    }
    if (isAlive(this.mainWindow)) {
      if (!this.mainWindow.isFullScreen()) this.mainWindow.setFullScreen(true);
      this.keepOnAllWorkspaces(this.mainWindow);
      this.focusLostAt = this.mainWindow.isFocused() ? null : Date.now();
    }
    this.reconcile();
  }

  async moveToNextDisplay(): Promise<void> {
    if (!this.isProtectionEnabledForCurrentUser()) return;
    const displays = screen.getAllDisplays();
    if (displays.length < 2) return;

    const currentIndex = displays.findIndex((display) => display.id === this.appDisplayId);
    const nextDisplay = displays[(currentIndex + 1 + displays.length) % displays.length];
    if (nextDisplay) await this.moveToDisplay(nextDisplay);
  }

  ownsAlertSender(sender: WebContents): boolean {
    return [...this.alerts.values()].some(
      (window) => isAlive(window) && window.webContents === sender
    );
  }

  handleAlertChoice(choice: unknown): void {
    if (choice === 'back') {
      this.dismissAlerts();
    } else if (choice === 'exit') {
      this.onExitChoice();
    }
  }

  setProtectionContext(authenticationInProgress: boolean, role: UserRole | null): void {
    if (this.isQuitting) return;
    const wasProtectionSuspended = this.isAuthenticationInProgress || this.isAdminSession;
    this.isAuthenticationInProgress = authenticationInProgress;
    this.isAdminSession = role === 'admin';
    const isProtectionSuspended = this.isAuthenticationInProgress || this.isAdminSession;
    if (!this.enabled) return;

    if (isProtectionSuspended) {
      this.focusLostAt = null;
      this.clearAlerts();
      this.destroyAllOverlays();
      if (this.isAdminSession) {
        for (const timer of this.launchFocusTimers) clearTimeout(timer);
        this.launchFocusTimers = [];
        if (isAlive(this.mainWindow)) {
          if (this.mainWindow.isFullScreen()) this.mainWindow.setFullScreen(false);
          this.mainWindow.setVisibleOnAllWorkspaces(false);
        }
      }
      return;
    }

    if ((!wasProtectionSuspended && !this.isAdminSession) || this.isMoving) return;
    if (this.isCertificatePrintInProgress) {
      this.reconcile();
      return;
    }

    if (isAlive(this.mainWindow)) {
      this.appDisplayId = screen.getDisplayMatching(this.mainWindow.getBounds()).id;
      if (!this.mainWindow.isFullScreen()) this.mainWindow.setFullScreen(true);
      this.mainWindow.show();
      this.keepOnAllWorkspaces(this.mainWindow);
      this.mainWindow.focus();
    }
    this.reconcile();
  }

  isProtectionEnabledForCurrentUser(): boolean {
    return this.enabled && !this.isAdminSession;
  }

  shouldPreventMinimize(): boolean {
    return this.isProtectionEnabledForCurrentUser();
  }

  private readonly onDisplayAdded = (): void => {
    this.scheduleReconcile();
  };

  private readonly onDisplayMetricsChanged = (): void => {
    this.scheduleReconcile();
  };

  private readonly onDisplayRemoved = (_event: Electron.Event, removed: Display): void => {
    if (this.isAdminSession) return;
    if (removed.id === this.appDisplayId) {
      void this.moveToDisplay(screen.getPrimaryDisplay()).catch((error: unknown) => {
        console.error('[desktop] Failed to move the app to the primary display', error);
      });
      return;
    }
    this.scheduleReconcile();
  };

  private readonly onMainWindowWillMove = (): void => {
    if (this.isQuitting || this.isAdminSession || this.isMoving || !isAlive(this.mainWindow)) {
      return;
    }
    this.isMoving = true;
    this.scheduleAppDisplaySync();
  };

  private readonly onMainWindowMove = (): void => {
    if (this.isQuitting || this.isAdminSession || !isAlive(this.mainWindow)) return;
    if (this.isRelocatingByManager) {
      this.keepMainWindowOnCorrectWorkspaces();
      return;
    }
    this.keepMainWindowOnCorrectWorkspaces();
    this.scheduleAppDisplaySync();
  };

  private readonly onMainWindowBlur = (): void => {
    if (
      this.isAuthenticationInProgress ||
      this.isAdminSession ||
      this.isCertificatePrintInProgress
    ) {
      return;
    }
    if (this.focusLostAt === null) this.focusLostAt = Date.now();
  };

  private readonly onMainWindowFocus = (): void => {
    this.isReadyForFocusTracking = true;
    this.focusLostAt = null;
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
      this.isCertificatePrintInProgress ||
      this.isAdminSession ||
      this.isQuitting ||
      !isAlive(this.mainWindow)
    ) {
      return;
    }
    this.mainWindow.setFullScreen(true);
    this.keepOnAllWorkspaces(this.mainWindow);
  };

  private readonly onMainWindowClosed = (): void => {
    this.dispose();
  };

  private readonly onMainFrameNavigation = (
    _event: Electron.Event,
    url: string,
    isMainFrame: boolean
  ): void => {
    if (isMainFrame && !isCertificatePageUrl(url)) this.endCertificatePrint();
  };

  private readonly onMainFrameNavigationStart = (
    _event: Electron.Event,
    url: string,
    _isInPlace: boolean,
    isMainFrame: boolean
  ): void => {
    if (isMainFrame && !isCertificatePageUrl(url)) this.endCertificatePrint();
  };

  private readonly focusAtLaunch = (): void => {
    if (!isAlive(this.mainWindow) || this.isQuitting) return;
    this.mainWindow.show();
    if (this.isProtectionEnabledForCurrentUser() && !this.isAuthenticationInProgress) {
      if (!this.mainWindow.isFullScreen()) this.mainWindow.setFullScreen(true);
    }
    this.keepMainWindowOnCorrectWorkspaces();
    if (this.isAdminSession || this.isAuthenticationInProgress) return;
    this.mainWindow.focus();

    this.launchFocusTimers.push(
      setTimeout(() => {
        if (
          isAlive(this.mainWindow) &&
          !this.isQuitting &&
          !this.isAuthenticationInProgress &&
          !this.isAdminSession
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
      this.isAdminSession ||
      this.isCertificatePrintInProgress ||
      this.isMoving ||
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
        const targetAlert =
          this.alerts.get(activeDisplay.id) ?? this.alerts.get(screen.getPrimaryDisplay().id);
        if (isAlive(targetAlert)) targetAlert.focus();
      }
      return;
    }

    const ownWindowFocused = [this.mainWindow, ...this.overlays.values()].some(
      (window) => isAlive(window) && window.isFocused()
    );
    if (ownWindowFocused) {
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
    if (
      this.isQuitting ||
      this.isAuthenticationInProgress ||
      this.isAdminSession ||
      this.isMoving ||
      !isAlive(this.mainWindow)
    ) {
      return;
    }

    const displays = screen.getAllDisplays();
    if (!displays.some((display) => display.id === this.appDisplayId)) {
      const current = screen.getDisplayMatching(this.mainWindow.getBounds());
      this.appDisplayId = current.id;
    }

    // Overlays must only exist on displays OTHER than the app's display
    const wantedOverlayIds = new Set(
      displays.filter((display) => display.id !== this.appDisplayId).map((display) => display.id)
    );

    for (const [id, window] of this.overlays) {
      if (!wantedOverlayIds.has(id)) this.destroyOverlay(id, window);
    }

    for (const display of displays) {
      if (display.id === this.appDisplayId) continue;
      const existing = this.overlays.get(display.id);
      if (!isAlive(existing)) {
        this.createOverlay(display);
      } else if (!sameBounds(existing.getBounds(), display.bounds)) {
        this.placeWindow(existing, display.bounds);
      }
    }

    this.reconcileAlerts(displays);
  };

  private async moveToDisplay(requestedDisplay: Display): Promise<void> {
    if (this.isQuitting || this.isAdminSession || !isAlive(this.mainWindow)) return;
    if (this.isMoving) {
      this.pendingDisplayId = requestedDisplay.id;
      return;
    }
    const target =
      screen.getAllDisplays().find((display) => display.id === requestedDisplay.id) ??
      screen.getPrimaryDisplay();
    if (target.id === this.appDisplayId && this.mainWindow.isFullScreen()) return;

    this.isMoving = true;
    this.isRelocatingByManager = true;

    try {
      this.destroyOverlay(target.id);

      await this.setFullscreen(false);
      if (!isAlive(this.mainWindow) || this.isQuitting || this.isAdminSession) return;

      this.mainWindow.setBounds(target.bounds);
      await this.setFullscreen(true);
      if (!isAlive(this.mainWindow) || this.isQuitting || this.isAdminSession) return;

      this.appDisplayId = target.id;
    } catch (error) {
      console.error('[desktop] Failed to move the app between displays', error);
      if (
        isAlive(this.mainWindow) &&
        !this.isQuitting &&
        !this.isAdminSession &&
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
      if (this.isAdminSession && isAlive(this.mainWindow)) {
        if (this.mainWindow.isFullScreen()) this.mainWindow.setFullScreen(false);
        this.mainWindow.setVisibleOnAllWorkspaces(false);
      }
      this.reconcile();
      if (
        isAlive(this.mainWindow) &&
        !this.isQuitting &&
        !this.isAuthenticationInProgress &&
        !this.isAdminSession
      ) {
        this.mainWindow.focus();
      }
      this.moveToPendingDisplay();
    }
  }

  private async setFullscreen(fullscreen: boolean): Promise<void> {
    const window = this.mainWindow;
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
      this.isAdminSession ||
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
        if (this.isAdminSession) {
          if (this.mainWindow.isFullScreen()) this.mainWindow.setFullScreen(false);
          this.mainWindow.setVisibleOnAllWorkspaces(false);
          return;
        }
      }
      if (!this.isAuthenticationInProgress) this.mainWindow.focus();
    } finally {
      this.isMoving = false;
      this.reconcile();
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
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.overlays.set(display.id, window);
    this.configureWindow(window, false);
    window.on('will-move', (event) => event.preventDefault());
    window.on('move', () => this.placeWindow(window, display.bounds));
    window.on('focus', () => {
      if (isAlive(this.mainWindow) && !this.isQuitting) {
        this.mainWindow.focus();
      }
    });
    window.on('close', (event) => {
      if (!this.closeAuthorized.has(window) && !this.isQuitting) event.preventDefault();
    });
    window.on('closed', () => {
      if (this.overlays.get(display.id) === window) this.overlays.delete(display.id);
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
      .loadFile(path.join(__dirname, 'overlay.html'))
      .catch((error: unknown) => console.error('[desktop] Failed to load display overlay', error));
    return window;
  }

  private destroyOverlay(id: number, expectedWindow?: BrowserWindow): void {
    const window = this.overlays.get(id);
    if (!window || (expectedWindow && expectedWindow !== window)) return;
    this.overlays.delete(id);
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
      this.isAdminSession ||
      this.isMoving ||
      !isAlive(this.mainWindow)
    ) {
      return;
    }
    this.areAlertsOpen = true;
    this.reconcileAlerts(screen.getAllDisplays());
    for (const alert of this.alerts.values()) {
      if (isAlive(alert)) {
        alert.setAlwaysOnTop(true, 'screen-saver');
        alert.show();
        alert.moveTop();
      }
    }
    const cursorPoint = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
    const targetAlert =
      this.alerts.get(activeDisplay.id) ?? this.alerts.get(screen.getPrimaryDisplay().id);
    if (isAlive(targetAlert)) targetAlert.focus();
  }

  private reconcileAlerts(displays: Display[]): void {
    if (!this.areAlertsOpen || this.isQuitting) return;
    const wantedIds = new Set(displays.map((display) => display.id));
    for (const [id, window] of this.alerts) {
      if (!wantedIds.has(id)) this.destroyAlert(id, window);
    }
    for (const display of displays) {
      const existing = this.alerts.get(display.id);
      if (!isAlive(existing)) {
        this.createAlert(display);
      } else if (!sameBounds(existing.getBounds(), display.bounds)) {
        this.placeWindow(existing, display.bounds);
      }
    }
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
      if (display.id === activeDisplay.id) window.focus();
    });
    void window
      .loadFile(path.join(__dirname, 'alert.html'))
      .catch((error: unknown) => console.error('[desktop] Failed to load focus alert', error));
    return window;
  }

  private dismissAlerts(): void {
    this.clearAlerts();
    this.alertDismissedAt = Date.now();
    this.focusLostAt = null;
    if (!isAlive(this.mainWindow) || this.isQuitting) return;
    this.mainWindow.show();
    this.keepOnAllWorkspaces(this.mainWindow);
    this.mainWindow.focus();
    this.raiseOverlays();
  }

  private raiseOverlays(): void {
    if (this.isQuitting || this.isAdminSession || this.isAuthenticationInProgress) return;
    for (const window of this.overlays.values()) {
      if (isAlive(window)) {
        window.setAlwaysOnTop(true, 'screen-saver');
        window.showInactive();
        window.moveTop();
      }
    }
  }

  private clearAlerts(): void {
    this.areAlertsOpen = false;
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
