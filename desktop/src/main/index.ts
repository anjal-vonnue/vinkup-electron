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
import path from 'node:path';
import type {
  DesktopAppInfo,
  DesktopAuthState,
  DesktopPlatform,
  ResourcesBrowserBounds,
} from '@itp/types';
import { APP_NAME, DEV_RENDERER_URL, getApiUrl, getResourcesAllowlistUrl } from './config';
import { startLocalServer, type LocalServer } from './server';
import { DesktopAuthManager, type DesktopAuthCookieStore } from './auth/manager';
import { HttpDesktopAuthApi } from './auth/api';
import { SecureDesktopCredentialStorage } from './auth/storage';
import { BUNDLED_ALLOWLIST } from './resources/allowlist';
import { loadResourcesAllowlist } from './resources/allowlist-source';
import { ResourcesBrowser } from './resources/browser';
import {
  assertTrustedSender as assertTrustedSenderForOrigin,
  isAllowedExternalUrl,
  isSameOrigin,
  isTrustedUrl,
} from './security';

const isDev = process.env.NODE_ENV === 'development';
const AUTH_COOKIE_NAME = 'auth_token';

let mainWindow: BrowserWindow | null = null;
let localServer: LocalServer | null = null;
let trustedOrigin: string | null = null;
let authManager: DesktopAuthManager | null = null;
let resourcesBrowser: ResourcesBrowser | null = null;

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

  authManager = createDesktopAuthManager();
  authManager.onChange(broadcastAuthState);
  registerIpcHandlers();

  // Restore in the background so a slow/offline backend never blocks the
  // window. The renderer subscribes to `auth:state-changed` and shows a loader
  // while the status is `loading`.
  void authManager.initialize().catch((error: unknown) => {
    console.error('[auth] Failed to restore the session', error);
  });

  mainWindow = createMainWindow();
  resourcesBrowser = new ResourcesBrowser(mainWindow, BUNDLED_ALLOWLIST, {
    onState: (state) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send('resources:state-changed', state);
    },
    onFocusAddress: () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send('resources:focus-address');
    },
  });

  // The shared allowlist can be updated without shipping a release. This never
  // blocks startup: the bundled copy is already in use.
  void refreshResourcesAllowlist();

  await loadRenderer(mainWindow);
}

async function refreshResourcesAllowlist(): Promise<void> {
  try {
    const { allowlist, source } = await loadResourcesAllowlist({
      bundled: BUNDLED_ALLOWLIST,
      remoteUrl: getResourcesAllowlistUrl(),
      cacheFile: path.join(app.getPath('userData'), 'resources', 'allowlist.json'),
    });
    resourcesBrowser?.setAllowlist(allowlist);
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
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('auth:state-changed', state);
}

function createMainWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;
  const window = new BrowserWindow({
    x,
    y,
    width,
    height,
    fullscreen: true,
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

  window.on('minimize', () => window.restore());
  window.on('leave-full-screen', () => window.setFullScreen(true));

  window.once('ready-to-show', () => {
    window.show();
  });

  window.on('closed', () => {
    mainWindow = null;
  });

  window.on('close', () => {
    resourcesBrowser?.dispose();
    resourcesBrowser = null;
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
    return getResourcesBrowser().open(parseBrowserBounds(bounds));
  });

  ipcMain.handle('resources:set-bounds', (event, bounds: unknown) => {
    assertTrustedSender(event);
    getResourcesBrowser().setBounds(parseBrowserBounds(bounds));
  });

  ipcMain.handle('resources:close', (event) => {
    assertTrustedSender(event);
    getResourcesBrowser().close();
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
}

function getAuthManager(): DesktopAuthManager {
  if (!authManager) throw new Error('The authentication manager is not ready.');
  return authManager;
}

function getResourcesBrowser(): ResourcesBrowser {
  if (!resourcesBrowser) throw new Error('The resources browser is not ready.');
  return resourcesBrowser;
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

function getAppInfo(): DesktopAppInfo {
  return {
    version: app.getVersion(),
    platform: process.platform as DesktopPlatform,
    isPackaged: app.isPackaged,
  };
}

function isTrusted(url: string): boolean {
  return isTrustedUrl(url, trustedOrigin);
}

function openExternal(url: string): void {
  if (!isAllowedExternalUrl(url)) return;
  void shell.openExternal(url);
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
  mainWindow = createMainWindow();
  void loadRenderer(mainWindow);
});

app.on('before-quit', () => {
  // TODO: ask the renderer to flush activity time before the app exits.
  authManager?.dispose();
  authManager = null;
  if (!localServer) return;
  const server = localServer;
  localServer = null;
  void server.close().catch((error: unknown) => {
    console.error('[desktop] Failed to close the local server', error);
  });
});
