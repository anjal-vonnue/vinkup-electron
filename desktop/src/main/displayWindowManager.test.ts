import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

const { browserWindowMock, screenMock, createdWindows } = vi.hoisted(() => ({
  browserWindowMock: vi.fn<(options: Record<string, unknown>) => object>(),
  screenMock: {
    on: vi.fn(),
    removeListener: vi.fn(),
    getPrimaryDisplay: vi.fn(),
    getAllDisplays: vi.fn(),
    getDisplayMatching: vi.fn(),
    getCursorScreenPoint: vi.fn(),
    getDisplayNearestPoint: vi.fn(),
  },
  createdWindows: [] as Array<{
    destroyed: boolean;
    options: Record<string, unknown>;
    setFocused: (focused: boolean) => void;
    isFocusable: () => boolean;
  }>,
}));

vi.mock('electron', () => ({
  BrowserWindow: browserWindowMock,
  screen: screenMock,
}));

import { DisplayWindowManager } from './displayWindowManager.js';

class FakeWindow extends EventEmitter {
  readonly webContents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
  });
  destroyed = false;
  focused = false;
  visible = false;
  fullscreen = true;
  focusable = true;
  bounds: Electron.Rectangle = { x: 0, y: 0, width: 1280, height: 720 };

  constructor(readonly options: Record<string, unknown> = {}) {
    super();
    this.bounds = {
      x: typeof options.x === 'number' ? options.x : 0,
      y: typeof options.y === 'number' ? options.y : 0,
      width: typeof options.width === 'number' ? options.width : 1280,
      height: typeof options.height === 'number' ? options.height : 720,
    };
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  isVisible(): boolean {
    return this.visible;
  }

  isFullScreen(): boolean {
    return this.fullscreen;
  }

  setFullScreen(value: boolean): void {
    this.fullscreen = value;
    this.emit(value ? 'enter-full-screen' : 'leave-full-screen');
  }

  setVisibleOnAllWorkspaces(): void {}

  setAlwaysOnTop(): void {}

  setFocusable(value: boolean): void {
    this.focusable = value;
  }

  show(): void {
    this.visible = true;
    this.emit('show');
  }

  showInactive(): void {
    this.visible = true;
    this.emit('show');
  }

  moveTop(): void {}

  focus(): void {
    this.focused = true;
  }

  isFocused(): boolean {
    return this.focused;
  }

  getBounds(): Electron.Rectangle {
    return this.bounds;
  }

  setBounds(bounds: Electron.Rectangle): void {
    this.bounds = bounds;
  }

  loadFile(): Promise<void> {
    this.emit('ready-to-show');
    return Promise.resolve();
  }

  destroy(): void {
    this.destroyed = true;
    this.emit('closed');
  }
}

function isAlertWindow(options: Record<string, unknown>): boolean {
  const webPreferences = options.webPreferences;
  return (
    typeof webPreferences === 'object' &&
    webPreferences !== null &&
    'preload' in webPreferences &&
    typeof webPreferences.preload === 'string' &&
    webPreferences.preload.endsWith('/preload/alert.js')
  );
}

describe('DisplayWindowManager focus alerts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createdWindows.length = 0;
    browserWindowMock.mockImplementation(function (options: Record<string, unknown>) {
      const window = new FakeWindow(options);
      createdWindows.push({
        destroyed: false,
        options,
        setFocused: (focused) => {
          window.focused = focused;
        },
        isFocusable: () => window.focusable,
      });
      window.on('closed', () => {
        const record = createdWindows.find((item) => item.options === options);
        if (record) record.destroyed = true;
      });
      return window;
    });

    const primaryDisplay = {
      id: 1,
      bounds: { x: 0, y: 0, width: 1280, height: 720 },
    };
    const secondaryDisplay = {
      id: 2,
      bounds: { x: 1280, y: 0, width: 1280, height: 720 },
    };
    const displays = [primaryDisplay, secondaryDisplay];
    screenMock.getPrimaryDisplay.mockReturnValue(primaryDisplay);
    screenMock.getAllDisplays.mockReturnValue(displays);
    screenMock.getDisplayMatching.mockImplementation((bounds: Electron.Rectangle) =>
      bounds.x >= secondaryDisplay.bounds.x ? secondaryDisplay : primaryDisplay
    );
    screenMock.getCursorScreenPoint.mockReturnValue({ x: 100, y: 100 });
    screenMock.getDisplayNearestPoint.mockImplementation((point: { x: number }) =>
      point.x >= secondaryDisplay.bounds.x ? secondaryDisplay : primaryDisplay
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('dismisses the alert when the main window regains focus', async () => {
    const mainWindow = new FakeWindow();
    const manager = new DisplayWindowManager(
      mainWindow as unknown as BrowserWindow,
      vi.fn(),
      true,
      1
    );

    await manager.start();
    mainWindow.emit('ready-to-show');
    mainWindow.emit('focus');
    mainWindow.focused = false;
    mainWindow.emit('blur');
    await vi.advanceTimersByTimeAsync(800);

    const alertWindow = createdWindows.find(({ options }) => isAlertWindow(options));
    expect(alertWindow).toBeDefined();
    expect(alertWindow?.destroyed).toBe(false);

    mainWindow.emit('focus');

    expect(alertWindow?.destroyed).toBe(true);
    manager.dispose();
  });

  it.each(['mentor', 'manager'] as const)(
    'disables screen protection for the %s role',
    async (role) => {
      const mainWindow = new FakeWindow();
      const manager = new DisplayWindowManager(
        mainWindow as unknown as BrowserWindow,
        vi.fn(),
        true,
        1
      );

      await manager.start();
      manager.setProtectionContext(false, role);

      expect(manager.isProtectionEnabledForCurrentUser()).toBe(false);
      expect(manager.shouldPreventMinimize()).toBe(false);
      expect(mainWindow.isFullScreen()).toBe(false);
      expect(
        createdWindows.some(({ options, destroyed }) => options.fullscreen === true && !destroyed)
      ).toBe(false);
      manager.dispose();
    }
  );

  it('keeps screen protection enabled for the trainee role', async () => {
    const mainWindow = new FakeWindow();
    const manager = new DisplayWindowManager(
      mainWindow as unknown as BrowserWindow,
      vi.fn(),
      true,
      1
    );

    await manager.start();
    manager.setProtectionContext(false, 'trainee');

    expect(manager.isProtectionEnabledForCurrentUser()).toBe(true);
    expect(manager.shouldPreventMinimize()).toBe(true);
    expect(createdWindows.some(({ options }) => options.fullscreen === true)).toBe(true);
    mainWindow.emit('ready-to-show');
    mainWindow.emit('focus');

    const overlay = createdWindows.find(({ options }) => options.fullscreen === true);
    expect(overlay).toBeDefined();
    expect(overlay?.isFocusable()).toBe(true);

    overlay?.setFocused(true);
    await vi.advanceTimersByTimeAsync(900);

    expect(createdWindows.some(({ options }) => isAlertWindow(options))).toBe(false);

    mainWindow.focused = false;
    overlay?.setFocused(false);
    mainWindow.emit('blur');
    await vi.advanceTimersByTimeAsync(2_000);

    expect(createdWindows.some(({ options }) => isAlertWindow(options))).toBe(true);
    manager.dispose();
  });

  it('refocuses after dragging and alerts when focus is later lost', async () => {
    const mainWindow = new FakeWindow();
    const manager = new DisplayWindowManager(
      mainWindow as unknown as BrowserWindow,
      vi.fn(),
      true,
      1
    );

    await manager.start();
    mainWindow.emit('ready-to-show');
    mainWindow.emit('focus');
    await vi.advanceTimersByTimeAsync(800);

    mainWindow.emit('will-move');
    mainWindow.setBounds({ x: 1280, y: 0, width: 1280, height: 720 });
    mainWindow.emit('move');
    await vi.advanceTimersByTimeAsync(200);

    expect(mainWindow.isFocused()).toBe(true);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(createdWindows.some(({ options }) => isAlertWindow(options))).toBe(false);

    mainWindow.focused = false;
    mainWindow.emit('blur');

    await vi.advanceTimersByTimeAsync(800);

    expect(createdWindows.some(({ options }) => isAlertWindow(options))).toBe(true);
    manager.dispose();
  });

  it('returns to the display where the alert opened when Go back is selected', async () => {
    const mainWindow = new FakeWindow({
      x: 1280,
      y: 0,
      width: 1280,
      height: 720,
    });
    const manager = new DisplayWindowManager(
      mainWindow as unknown as BrowserWindow,
      vi.fn(),
      true,
      2
    );

    await manager.start();
    mainWindow.emit('ready-to-show');
    mainWindow.emit('focus');
    mainWindow.focused = false;
    mainWindow.emit('blur');
    await vi.advanceTimersByTimeAsync(800);

    expect(createdWindows.some(({ options }) => isAlertWindow(options))).toBe(true);

    mainWindow.setBounds({ x: 0, y: 0, width: 1280, height: 720 });
    manager.handleAlertChoice('back');
    await Promise.resolve();
    await Promise.resolve();

    expect(mainWindow.getBounds().x).toBe(1280);
    expect(mainWindow.isFullScreen()).toBe(true);
    manager.dispose();
  });
});
