import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
  screen,
  type IpcMainInvokeEvent,
} from 'electron';
import path from 'node:path';
import type { DesktopAppInfo, DesktopPlatform } from '@itp/types';
import { APP_NAME, DEV_RENDERER_URL } from './config';
import { startLocalServer, type LocalServer } from './server';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let localServer: LocalServer | null = null;
let trustedOrigin: string | null = null;

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

  registerIpcHandlers();
  mainWindow = createMainWindow();
  await loadRenderer(mainWindow);
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
    if (isTrustedUrl(url)) return;
    event.preventDefault();
    openExternal(url);
  });

  window.webContents.on('before-input-event', (event, input) => {
    if (isDev) return;
    if (isDevToolsShortcut(input)) event.preventDefault();
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
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url;
  if (!senderUrl || !isTrustedUrl(senderUrl)) {
    throw new Error('IPC request from an untrusted frame.');
  }
}

function getAppInfo(): DesktopAppInfo {
  return {
    version: app.getVersion(),
    platform: process.platform as DesktopPlatform,
    isPackaged: app.isPackaged,
  };
}

function isTrustedUrl(url: string): boolean {
  if (!trustedOrigin) return false;
  try {
    return new URL(url).origin === trustedOrigin;
  } catch {
    return false;
  }
}

function openExternal(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;
    void shell.openExternal(url);
  } catch {
    // Ignore malformed URLs.
  }
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
  if (!localServer) return;
  const server = localServer;
  localServer = null;
  void server.close().catch((error: unknown) => {
    console.error('[desktop] Failed to close the local server', error);
  });
});
