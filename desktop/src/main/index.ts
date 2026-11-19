import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  safeStorage,
  session,
  shell,
  screen,
  type IpcMainInvokeEvent,
} from 'electron';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  BrowserAvailability,
  DesktopAppInfo,
  DesktopAuthState,
  DesktopPlatform,
  ResourcesAllowlist,
  ResourcesBrowserBounds,
} from '@itp/types';
import { APP_NAME, DEV_RENDERER_URL, getApiUrl, getResourcesAllowlistUrl } from './config';
import { startLocalServer, type LocalServer } from './server';
import { DesktopAuthManager, type DesktopAuthCookieStore } from './auth/manager';
import { HttpDesktopAuthApi } from './auth/api';
import { SecureDesktopCredentialStorage } from './auth/storage';
import { DisplayWindowManager } from './displayWindowManager';
import { GnomeShortcutProtection } from './gnomeShortcutProtection';
import { startOverlayServer, type OverlayServer } from './overlayServer';
import { getScreenProtectionDisabled } from './screenProtectionConfig';
import { BUNDLED_ALLOWLIST } from './resources/allowlist';
import { loadResourcesAllowlist } from './resources/allowlist-source';
import { ResourcesBrowser } from './resources/browser';
import { registerWorkspaceIpc } from './workspace/ipc';
import { WorkspaceManager } from './workspace/manager';
import {
  assertTrustedSender as assertTrustedSenderForOrigin,
  isAllowedExternalUrl,
  isSameOrigin,
  isTrustedUrl,
} from './security';

const isDev = process.env.NODE_ENV === 'development';
const AUTH_COOKIE_NAME = 'auth_token';
const DISABLE_SCREEN_PROTECTION = getScreenProtectionDisabled();

let mainWindow: BrowserWindow | null = null;
let localServer: LocalServer | null = null;
let overlayServer: OverlayServer | null = null;
let trustedOrigin: string | null = null;
let authManager: DesktopAuthManager | null = null;
let displayWindowManager: DisplayWindowManager | null = null;
let gnomeShortcutProtection: GnomeShortcutProtection | null = null;
let resourcesBrowser: ResourcesBrowser | null = null;
const secondaryResourcesBrowsers = new Map<BrowserWindow, ResourcesBrowser>();
let workspaceManager: WorkspaceManager | null = null;
let activeResourcesAllowlist: ResourcesAllowlist = BUNDLED_ALLOWLIST;
let loginPendingForOverlayTransition = false;

/** Quitting waits for workspace folders to be removed, but never longer than this. */
const SHUTDOWN_CLEANUP_TIMEOUT_MS = 5_000;
let isShutdownStarted = false;
let isQuitReady = false;

// Set the name before `ready` so userData, cache and config use the product name.
app.setName(APP_NAME);

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(bootstrap).catch(handleStartupError);
}

async function bootstrap(): Promise<void> {
  installMenu();
  gnomeShortcutProtection = new GnomeShortcutProtection(app.getPath('userData'));
  try {
    await gnomeShortcutProtection.restorePreviousSession();
  } catch (error) {
    console.error('[desktop] Failed to restore GNOME shortcuts from a previous session', error);
  }

  // The desktop shell does not need camera, microphone, location, notifications or
  // clipboard-read permissions. Add specific permissions here only when a feature needs them.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  if (isDev) {
    trustedOrigin = new URL(DEV_RENDERER_URL).origin;
  } else {
    localServer = await startLocalServer();
    trustedOrigin = new URL(localServer.url).origin;
  }
  overlayServer = await startOverlayServer(__dirname);

  authManager = createDesktopAuthManager();
  authManager.onChange(broadcastAuthState);
  workspaceManager = createWorkspaceManager();
  registerIpcHandlers();

  // Restore in the background so a slow/offline backend never blocks the
  // window. The renderer subscribes to `auth:state-changed` and shows a loader
  // while the status is `loading`.
  void authManager.initialize().catch((error: unknown) => {
    console.error('[auth] Failed to restore the session', error);
  });

  const window = createMainWindow();
  mainWindow = window;
  const primaryDisplay = screen.getPrimaryDisplay();
  displayWindowManager = createDisplayWindowManager(window, primaryDisplay.id);
  updateProtectionContext(authManager.getState());
  await displayWindowManager.start();

  resourcesBrowser = createResourcesBrowser(window);

  // The shared allowlist can be updated without shipping a release. This never
  // blocks startup: the bundled copy is already in use.
  void refreshResourcesAllowlist();

  await loadRenderer(window);
}

function createResourcesBrowser(
  window: BrowserWindow,
  sendEvent: (channel: string, payload?: unknown) => void = (channel, payload) => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
): ResourcesBrowser {
  return new ResourcesBrowser(window, activeResourcesAllowlist, {
    onState: (state) => sendEvent('resources:state-changed', state),
    onFocusAddress: () => sendEvent('resources:focus-address'),
    onOpenFind: () => sendEvent('resources:open-find'),
    onFindResult: (result) => sendEvent('resources:find-result', result),
    onEscape: () => sendEvent('resources:escape'),
  });
}

function createDisplayWindowManager(
  window: BrowserWindow,
  initialDisplayId: number
): DisplayWindowManager {
  if (!overlayServer) throw new Error('The display overlay server is not available.');
  return new DisplayWindowManager(
    window,
    handleExitChoice,
    !DISABLE_SCREEN_PROTECTION,
    initialDisplayId,
    overlayServer.url,
    (isFocused) => {
      if (!window.isDestroyed()) {
        window.webContents.send('window:reference-screen-focus-changed', isFocused);
      }
    }
  );
}

async function refreshResourcesAllowlist(): Promise<void> {
  try {
    const { allowlist, source } = await loadResourcesAllowlist({
      bundled: BUNDLED_ALLOWLIST,
      remoteUrl: getResourcesAllowlistUrl(),
      cacheFile: path.join(app.getPath('userData'), 'resources', 'allowlist.json'),
    });
    activeResourcesAllowlist = allowlist;
    resourcesBrowser?.setAllowlist(allowlist);
    for (const browser of secondaryResourcesBrowsers.values()) browser.setAllowlist(allowlist);
    if (source !== 'bundled') {
      console.info(`[resources] Using the ${source} allowlist (v${allowlist.version}).`);
    }
  } catch (error) {
    console.warn('[resources] Failed to refresh the allowlist', error);
  }
}

function createDesktopAuthManager(): DesktopAuthManager {
  const apiUrl = getApiUrl();
  const apiOrigin = new URL(apiUrl).origin;
  const origin = trustedOrigin;
  if (!origin) throw new Error('The renderer origin is not available.');

  const cookies: DesktopAuthCookieStore = {
    set: async (accessToken, expiresAt) => {
      await session.defaultSession.cookies.set({
        url: origin,
        name: AUTH_COOKIE_NAME,
        value: accessToken,
        httpOnly: true,
        secure: false, // both the dev renderer and the packaged app use loopback HTTP
        sameSite: 'lax',
        expirationDate: Math.floor(new Date(expiresAt).getTime() / 1000),
        path: '/',
      });
    },
    clear: async () => {
      await session.defaultSession.cookies.remove(origin, AUTH_COOKIE_NAME).catch(() => undefined);
    },
  };

  const storage = new SecureDesktopCredentialStorage(
    path.join(app.getPath('userData'), 'auth', 'session.json'),
    safeStorage
  );

  return new DesktopAuthManager({
    api: new HttpDesktopAuthApi(apiUrl),
    cookies,
    storage,
    apiOrigin,
    openExternal: async (url) => {
      // Only the configured backend may be opened for sign-in. This keeps a
      // compromised backend response from becoming an arbitrary URL opener.
      if (!isAllowedExternalUrl(url) || !isSameOrigin(url, apiOrigin)) {
        throw new Error('Refusing to open an untrusted sign-in URL.');
      }
      await shell.openExternal(url);
    },
  });
}

function broadcastAuthState(state: DesktopAuthState): void {
  const isTrainee = state.status === 'authenticated' && state.user?.role === 'trainee';
  void gnomeShortcutProtection?.setTraineeActive(isTrainee).catch((error: unknown) => {
    console.error('[desktop] Failed to update GNOME trainee shortcuts', error);
  });
  if (state.status === 'pending') loginPendingForOverlayTransition = true;
  const shouldTransitionOverlay =
    state.status === 'authenticated' && loginPendingForOverlayTransition;
  updateProtectionContext(state, shouldTransitionOverlay);
  if (state.status === 'authenticated' || state.status === 'unauthenticated') {
    loginPendingForOverlayTransition = false;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('auth:state-changed', state);
}

function updateProtectionContext(state: DesktopAuthState, animateLogin = false): void {
  displayWindowManager?.setProtectionContext(
    state.status === 'loading' || state.status === 'pending',
    state.status === 'authenticated' ? (state.user?.role ?? null) : null,
    state.status === 'authenticated',
    animateLogin
  );
}
function sendToRenderer(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function createWorkspaceManager(): WorkspaceManager {
  return new WorkspaceManager({
    baseDir: path.join(app.getPath('userData'), 'workspaces'),
    emitEvent: (event) => sendToRenderer('workspace:event', event),
    emitTerminalData: (event) => sendToRenderer('terminal:data', event),
    emitTerminalExit: (event) => sendToRenderer('terminal:exit', event),
  });
}

function createMainWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;
  const window = new BrowserWindow({
    x,
    y,
    width,
    height,
    fullscreen: false,
    useContentSize: true,
    frame: false,
    title: APP_NAME,
    backgroundColor: '#10131f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.on('minimize', () => {
    if (displayWindowManager?.shouldPreventMinimize() ?? !DISABLE_SCREEN_PROTECTION) {
      window.restore();
      void displayWindowManager?.restoreMainWindowAfterMinimize().catch((error: unknown) => {
        console.error('[desktop] Failed to restore fullscreen after minimizing', error);
      });
    }
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  window.on('closed', () => {
    displayWindowManager?.dispose();
    displayWindowManager = null;
    mainWindow = null;
    app.quit();
  });

  window.on('close', () => {
    resourcesBrowser?.dispose();
    resourcesBrowser = null;
    void workspaceManager?.closeAll();
  });

  window.on('resize', () => {
    resourcesBrowser?.handleWindowResize();
  });

  window.on('enter-full-screen', () => {
    window.webContents.send('window:fullscreen-changed', true);
  });

  window.on('leave-full-screen', () => {
    window.webContents.send('window:fullscreen-changed', false);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (isTrusted(url)) return;
    event.preventDefault();
    openExternal(url);
  });

  window.webContents.on('before-input-event', (event, input) => {
    const key = input.key.toLowerCase();
    const moveToNextDisplay =
      (displayWindowManager?.isProtectionEnabledForCurrentUser() ?? !DISABLE_SCREEN_PROTECTION) &&
      input.type === 'keyDown' &&
      input.control &&
      input.shift &&
      input.alt &&
      key === 'm';
    if (moveToNextDisplay) {
      event.preventDefault();
      void displayWindowManager?.moveToNextDisplay().catch((error: unknown) => {
        console.error('[desktop] Failed to move to the next display', error);
      });
      return;
    }

    if (!isDevToolsShortcut(input)) return;
    event.preventDefault();
    // The custom menu below replaces Electron's default menu, so the built-in
    // DevTools accelerator does not exist. In development we bind it ourselves;
    // production deliberately blocks it.
    if (isDev) window.webContents.toggleDevTools();
  });

  return window;
}

async function loadRenderer(window: BrowserWindow, attempts = 0): Promise<void> {
  const url = isDev ? DEV_RENDERER_URL : localServer?.url;
  if (!url) throw new Error('The renderer URL is not available.');

  try {
    await window.loadURL(url);
  } catch (error) {
    if (!isDev) throw error;

    // In development the Vite server may still be starting. Retry for ~30 seconds.
    if (attempts >= 30) {
      dialog.showErrorBox(
        `${APP_NAME} could not open the frontend`,
        `Start it with "npm run dev:desktop", then try again.\n\n${String(error)}`
      );
      return;
    }

    setTimeout(() => {
      if (!window.isDestroyed()) void loadRenderer(window, attempts + 1);
    }, 1000);
  }
}

function registerIpcHandlers(): void {
  registerWorkspaceIpc({ manager: getWorkspaceManager(), assertTrustedSender });

  ipcMain.handle('app:get-info', (event) => {
    assertTrustedSender(event);
    return getAppInfo();
  });

  ipcMain.handle('window:set-fullscreen', (event, value: unknown) => {
    assertTrustedSender(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return false;
    window.setFullScreen(Boolean(value));
    return window.isFullScreen();
  });

  ipcMain.handle('window:is-fullscreen', (event) => {
    assertTrustedSender(event);
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false;
  });

  ipcMain.handle('window:set-display-theme', (event, theme: unknown) => {
    assertTrustedSender(event);
    assertMainWindowSender(event);
    if (theme !== 'light' && theme !== 'dark') {
      throw new Error('Invalid display theme.');
    }
    return displayWindowManager?.setDisplayTheme(theme);
  });

  ipcMain.handle('window:is-reference-screen-focused', (event) => {
    assertTrustedSender(event);
    assertMainWindowSender(event);
    return displayWindowManager?.isReferenceScreenFocused() ?? false;
  });

  ipcMain.handle('window:begin-certificate-print', (event) => {
    assertTrustedSender(event);
    assertMainWindowSender(event);
    const frameUrl = event.senderFrame?.url;
    if (!frameUrl || !isCertificatePageUrl(frameUrl)) {
      throw new Error('Certificate printing can only start from the certificate page.');
    }
    displayWindowManager?.beginCertificatePrint();
  });

  ipcMain.handle('window:end-certificate-print', (event) => {
    assertTrustedSender(event);
    assertMainWindowSender(event);
    displayWindowManager?.endCertificatePrint();
  });

  ipcMain.handle('certificate:save-pdf', async (event, fileName: unknown) => {
    assertTrustedSender(event);

    displayWindowManager?.beginCertificatePrint();
    try {
      return await savePdf(event, fileName, {
        label: 'certificate',
        fallbackFileName: 'certificate',
        landscape: true,
      });
    } finally {
      displayWindowManager?.endCertificatePrint();
    }
  });
  ipcMain.handle('report:save-pdf', async (event, fileName: unknown) => {
    assertTrustedSender(event);
    return savePdf(event, fileName, {
      label: 'report',
      fallbackFileName: 'trainee-report',
      landscape: false,
    });
  });

  ipcMain.handle('auth:get-state', (event) => {
    assertTrustedSender(event);
    return getAuthManager().getState();
  });

  ipcMain.handle('auth:login', (event) => {
    assertTrustedSender(event);
    return getAuthManager().login();
  });

  ipcMain.handle('auth:cancel', async (event) => {
    assertTrustedSender(event);
    await getAuthManager().cancel();
  });

  ipcMain.handle('auth:refresh', (event) => {
    assertTrustedSender(event);
    return getAuthManager().refresh();
  });

  ipcMain.handle('auth:logout', async (event) => {
    assertTrustedSender(event);
    await getAuthManager().logout();
  });

  ipcMain.on('display-alert:choice', (event, choice: unknown) => {
    const manager = displayWindowManager;
    if (!manager?.ownsAlertSender(event.sender)) return;
    manager.handleAlertChoice(choice);
  });

  ipcMain.on('display-overlay:references-active', (event, active: unknown) => {
    if (typeof active !== 'boolean') return;
    displayWindowManager?.setOverlayReferencesActive(event.sender, active);
  });

  ipcMain.on('display-overlay:resources-active', (event, active: unknown) => {
    if (typeof active !== 'boolean' || event.senderFrame !== event.sender.mainFrame) return;
    const overlayWindow = displayWindowManager?.getOverlayWindowForSender(event.sender);
    if (!overlayWindow) return;
    if (active) {
      resourcesBrowser?.close();
      for (const [window, browser] of secondaryResourcesBrowsers) {
        if (window !== overlayWindow) browser.close();
      }
      displayWindowManager?.setMainResourcesActive(false);
    } else {
      secondaryResourcesBrowsers.get(overlayWindow)?.close();
    }
    displayWindowManager?.setOverlayResourcesActive(event.sender, active);
  });

  ipcMain.handle('browser:get-availability', (event) => {
    const manager = displayWindowManager;
    if (!manager) throw new Error('The display window manager is not ready.');
    if (manager.ownsOverlaySender(event.sender)) {
      if (event.senderFrame !== event.sender.mainFrame) {
        throw new Error('IPC request is not from the display overlay main frame.');
      }
      const availability: BrowserAvailability = manager.getBrowserAvailability();
      return availability;
    }
    assertTrustedSender(event);
    const availability: BrowserAvailability = manager.getBrowserAvailability();
    return availability;
  });

  ipcMain.handle('resources:get-allowlist', (event) => {
    assertTrustedSender(event);
    return getResourcesBrowser().getAllowlist();
  });

  ipcMain.handle('resources:get-state', (event) => {
    assertTrustedSender(event);
    return getResourcesBrowser().getState();
  });

  ipcMain.handle('resources:open', (event, bounds: unknown) => {
    assertTrustedSender(event);
    closeSecondaryResourcesBrowsers();
    const state = getResourcesBrowser().open(parseBrowserBounds(bounds));
    displayWindowManager?.setMainResourcesActive(true);
    return state;
  });

  ipcMain.handle('resources:set-bounds', (event, bounds: unknown) => {
    assertTrustedSender(event);
    getResourcesBrowser().setBounds(parseBrowserBounds(bounds));
  });

  ipcMain.handle('resources:close', (event) => {
    assertTrustedSender(event);
    getResourcesBrowser().close();
    displayWindowManager?.setMainResourcesActive(false);
  });

  ipcMain.handle('secondary-resources:get-allowlist', (event) => {
    return getSecondaryResourcesBrowser(event).getAllowlist();
  });

  ipcMain.handle('secondary-resources:get-state', (event) => {
    return getSecondaryResourcesBrowser(event).getState();
  });

  ipcMain.handle('secondary-resources:open', (event, bounds: unknown) => {
    const overlay = getSecondaryOverlayWindow(event);
    resourcesBrowser?.close();
    for (const [window, browser] of secondaryResourcesBrowsers) {
      if (window !== overlay) browser.close();
    }
    displayWindowManager?.setMainResourcesActive(false);
    displayWindowManager?.setOverlayResourcesActive(event.sender, true);
    return getSecondaryResourcesBrowser(event).open(parseBrowserBounds(bounds));
  });

  ipcMain.handle('secondary-resources:set-bounds', (event, bounds: unknown) => {
    getSecondaryResourcesBrowser(event).setBounds(parseBrowserBounds(bounds));
  });

  ipcMain.handle('secondary-resources:close', (event) => {
    const overlay = getSecondaryOverlayWindow(event);
    secondaryResourcesBrowsers.get(overlay)?.close();
    displayWindowManager?.setOverlayResourcesActive(event.sender, false);
  });

  ipcMain.handle('secondary-resources:home', (event) => {
    getSecondaryResourcesBrowser(event).home();
  });

  ipcMain.handle('secondary-resources:navigate', (event, input: unknown) => {
    if (typeof input !== 'string') throw new Error('Invalid navigation input.');
    return getSecondaryResourcesBrowser(event).navigate(input);
  });

  ipcMain.handle('secondary-resources:back', (event) => {
    getSecondaryResourcesBrowser(event).goBack();
  });

  ipcMain.handle('secondary-resources:forward', (event) => {
    getSecondaryResourcesBrowser(event).goForward();
  });

  ipcMain.handle('secondary-resources:reload', (event) => {
    getSecondaryResourcesBrowser(event).reload();
  });

  ipcMain.handle('secondary-resources:stop', (event) => {
    getSecondaryResourcesBrowser(event).stop();
  });

  ipcMain.handle('secondary-resources:find', (event, query: unknown) => {
    if (typeof query !== 'string') throw new Error('Invalid search text.');
    getSecondaryResourcesBrowser(event).find(query);
  });

  ipcMain.handle('secondary-resources:find-next', (event, forward: unknown) => {
    getSecondaryResourcesBrowser(event).findNext(forward !== false);
  });

  ipcMain.handle('secondary-resources:stop-find', (event) => {
    getSecondaryResourcesBrowser(event).stopFind();
  });

  ipcMain.handle('secondary-resources:zoom-in', (event) => {
    getSecondaryResourcesBrowser(event).zoomIn();
  });

  ipcMain.handle('secondary-resources:zoom-out', (event) => {
    getSecondaryResourcesBrowser(event).zoomOut();
  });

  ipcMain.handle('secondary-resources:zoom-reset', (event) => {
    getSecondaryResourcesBrowser(event).zoomReset();
  });

  ipcMain.handle('resources:home', (event) => {
    assertTrustedSender(event);
    getResourcesBrowser().home();
  });

  ipcMain.handle('resources:navigate', (event, input: unknown) => {
    assertTrustedSender(event);
    if (typeof input !== 'string') throw new Error('Invalid navigation input.');
    return getResourcesBrowser().navigate(input);
  });

  ipcMain.handle('resources:back', (event) => {
    assertTrustedSender(event);
    getResourcesBrowser().goBack();
  });

  ipcMain.handle('resources:forward', (event) => {
    assertTrustedSender(event);
    getResourcesBrowser().goForward();
  });

  ipcMain.handle('resources:reload', (event) => {
    assertTrustedSender(event);
    getResourcesBrowser().reload();
  });

  ipcMain.handle('resources:stop', (event) => {
    assertTrustedSender(event);
    getResourcesBrowser().stop();
  });

  ipcMain.handle('resources:find', (event, query: unknown) => {
    assertTrustedSender(event);
    if (typeof query !== 'string') throw new Error('Invalid search text.');
    getResourcesBrowser().find(query);
  });

  ipcMain.handle('resources:find-next', (event, forward: unknown) => {
    assertTrustedSender(event);
    getResourcesBrowser().findNext(forward !== false);
  });

  ipcMain.handle('resources:stop-find', (event) => {
    assertTrustedSender(event);
    getResourcesBrowser().stopFind();
  });

  ipcMain.handle('resources:zoom-in', (event) => {
    assertTrustedSender(event);
    getResourcesBrowser().zoomIn();
  });

  ipcMain.handle('resources:zoom-out', (event) => {
    assertTrustedSender(event);
    getResourcesBrowser().zoomOut();
  });

  ipcMain.handle('resources:zoom-reset', (event) => {
    assertTrustedSender(event);
    getResourcesBrowser().zoomReset();
  });
}

function getAuthManager(): DesktopAuthManager {
  if (!authManager) throw new Error('The authentication manager is not ready.');
  return authManager;
}

function getResourcesBrowser(): ResourcesBrowser {
  if (!resourcesBrowser) throw new Error('The resources browser is not ready.');
  return resourcesBrowser;
}

function getSecondaryOverlayWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const overlay = displayWindowManager?.getOverlayWindowForSender(event.sender);
  if (!overlay || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('IPC request is not from a secondary display window.');
  }
  return overlay;
}

function getSecondaryResourcesBrowser(event: IpcMainInvokeEvent): ResourcesBrowser {
  const overlay = getSecondaryOverlayWindow(event);
  const existing = secondaryResourcesBrowsers.get(overlay);
  if (existing) return existing;

  const browser = createResourcesBrowser(overlay, (channel, payload) => {
    if (overlay.isDestroyed() || overlay.webContents.isDestroyed()) return;
    const secondaryChannel = channel.replace(/^resources:/, 'secondary-resources:');
    overlay.webContents.send(secondaryChannel, payload);
  });
  secondaryResourcesBrowsers.set(overlay, browser);
  overlay.once('closed', () => {
    browser.dispose();
    secondaryResourcesBrowsers.delete(overlay);
  });
  return browser;
}

function closeSecondaryResourcesBrowsers(): void {
  for (const browser of secondaryResourcesBrowsers.values()) browser.close();
}

function getWorkspaceManager(): WorkspaceManager {
  if (!workspaceManager) throw new Error('The workspace manager is not ready.');
  return workspaceManager;
}

function parseBrowserBounds(value: unknown): ResourcesBrowserBounds {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid browser bounds.');
  }

  const record = value as Record<string, unknown>;
  const { x, y, width, height } = record;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    throw new Error('Invalid browser bounds.');
  }

  return { x, y, width, height };
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  assertTrustedSenderForOrigin(event, trustedOrigin);
}

function assertMainWindowSender(event: IpcMainInvokeEvent): void {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    BrowserWindow.fromWebContents(event.sender) !== mainWindow ||
    event.senderFrame !== event.sender.mainFrame
  ) {
    throw new Error('IPC request is not from the main application window.');
  }
}

function isCertificatePageUrl(url: string): boolean {
  try {
    return /^\/certificates\/[^/]+\/?$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function getAppInfo(): DesktopAppInfo {
  return {
    version: app.getVersion(),
    platform: process.platform as DesktopPlatform,
    isPackaged: app.isPackaged,
  };
}

type PdfSaveRequest = {
  /** Used in error messages: "A certificate file name is required." */
  label: string;
  /** Used if the suggested name has no characters left after sanitising. */
  fallbackFileName: string;
  landscape: boolean;
};

async function savePdf(
  event: IpcMainInvokeEvent,
  fileName: unknown,
  request: PdfSaveRequest
): Promise<boolean> {
  if (typeof fileName !== 'string' || !fileName.trim()) {
    throw new Error(`A ${request.label} file name is required.`);
  }

  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error(`The ${request.label} window is not available.`);

  const result = await dialog.showSaveDialog(window, {
    defaultPath: `${sanitizePdfFileName(fileName, request.fallbackFileName)}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return false;

  const filePath =
    path.extname(result.filePath).toLowerCase() === '.pdf'
      ? result.filePath
      : `${result.filePath}.pdf`;

  // The page's print CSS supplies the paper size and margins: A4 portrait for a
  // report, A4 landscape for a certificate. Keep the backgrounds in the PDF.
  const pdf = await event.sender.printToPDF({
    pageSize: 'A4',
    landscape: request.landscape,
    printBackground: true,
    preferCSSPageSize: true,
  });
  await writeFile(filePath, pdf);
  return true;
}

function sanitizePdfFileName(fileName: string, fallbackFileName: string): string {
  const name = path
    .basename(fileName)
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character;
    })
    .join('')
    .replace(/\.pdf$/i, '')
    .trim();
  return name || fallbackFileName;
}

function isTrusted(url: string): boolean {
  return isTrustedUrl(url, trustedOrigin);
}

function openExternal(url: string): void {
  if (!isAllowedExternalUrl(url)) return;
  void shell.openExternal(url);
}

function handleExitChoice(): void {
  // TODO: report the student's exit choice when the backend supports it.
  app.quit();
}

function isDevToolsShortcut(input: Electron.Input): boolean {
  const key = input.key.toLowerCase();
  const isF12 = key === 'f12';
  const isControlShiftI = input.control && input.shift && key === 'i';
  const isMetaAltI = input.meta && input.alt && key === 'i';
  return isF12 || isControlShiftI || isMetaAltI;
}

function installMenu(): void {
  // Keep the edit roles so copy/paste works, but leave out the developer tools menu.
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev
          ? [
              { type: 'separator' as const },
              {
                label: 'Toggle Developer Tools',
                click: (_item: Electron.MenuItem, window: Electron.BaseWindow | undefined) => {
                  if (window instanceof BrowserWindow) window.webContents.toggleDevTools();
                },
              },
            ]
          : []),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function handleStartupError(error: unknown): void {
  console.error('[desktop] Failed to start', error);
  dialog.showErrorBox(
    `${APP_NAME} could not start`,
    error instanceof Error ? error.message : String(error)
  );
  app.quit();
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length > 0) return;
  const window = createMainWindow();
  mainWindow = window;
  const primaryDisplay = screen.getPrimaryDisplay();
  displayWindowManager = createDisplayWindowManager(window, primaryDisplay.id);
  updateProtectionContext(getAuthManager().getState());
  resourcesBrowser = createResourcesBrowser(window);
  void refreshResourcesAllowlist();
  void displayWindowManager
    .start()
    .then(() => loadRenderer(window))
    .catch(handleStartupError);
});

app.on('before-quit', (event) => {
  if (isQuitReady) return;

  // Task folders must be removed before the process exits; app.quit() alone would
  // leave <userData>/workspaces/<taskId> (with node_modules) on disk.
  event.preventDefault();
  if (isShutdownStarted) return;
  isShutdownStarted = true;

  // TODO: ask the renderer to flush activity time before the app exits.
  displayWindowManager?.dispose();
  displayWindowManager = null;
  authManager?.dispose();
  authManager = null;

  const manager = workspaceManager;
  const server = localServer;
  const displayServer = overlayServer;
  const restoreGnomeShortcuts =
    gnomeShortcutProtection?.setTraineeActive(false).catch((error: unknown) => {
      console.error('[desktop] Failed to restore GNOME shortcuts before exit', error);
    }) ?? Promise.resolve();

  void settleWithin(
    Promise.allSettled([
      manager ? manager.closeAll() : Promise.resolve(),
      server ? server.close() : Promise.resolve(),
      displayServer ? displayServer.close() : Promise.resolve(),
      restoreGnomeShortcuts,
    ]),
    SHUTDOWN_CLEANUP_TIMEOUT_MS
  ).then(() => {
    localServer = null;
    overlayServer = null;
    isQuitReady = true;
    app.quit();
  });
});

/** Resolves when `work` settles or `ms` passes, so a stuck cleanup can't block quit. */
function settleWithin(work: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    void work.then(finish, finish);
  });
}

// Ctrl+C in `npm run dev:desktop` and system stops (SIGTERM/SIGHUP) skip Electron's
// normal quit events, which would leave task folders on disk. Route them through
// app.quit() so the cleanup above still runs. A second signal is ignored; the
// cleanup timeout keeps quit bounded.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    if (isQuitReady) return;
    app.quit();
  });
}
