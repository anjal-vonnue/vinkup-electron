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
    getCursorScreenPoint: vi.fn(),
    getDisplayNearestPoint: vi.fn(),
  },
  createdWindows: [] as Array<{ destroyed: boolean }>,
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

  constructor(readonly options: Record<string, unknown> = {}) {
    super();
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  isFullScreen(): boolean {
    return true;
  }

  setFullScreen(): void {}

  setVisibleOnAllWorkspaces(): void {}

  setAlwaysOnTop(): void {}

  setFocusable(): void {}

  show(): void {
    this.visible = true;
  }

  showInactive(): void {
    this.visible = true;
  }

  moveTop(): void {}

  focus(): void {
    this.focused = true;
  }

  isFocused(): boolean {
    return this.focused;
  }

  getBounds(): Electron.Rectangle {
    return { x: 0, y: 0, width: 1280, height: 720 };
  }

  loadFile(): Promise<void> {
    return Promise.resolve();
  }

  destroy(): void {
    this.destroyed = true;
  }
}

describe('DisplayWindowManager focus alerts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createdWindows.length = 0;
    browserWindowMock.mockImplementation(function (options: Record<string, unknown>) {
      const window = new FakeWindow(options);
      createdWindows.push(window);
      return window;
    });

    const display = {
      id: 1,
      bounds: { x: 0, y: 0, width: 1280, height: 720 },
    };
    screenMock.getPrimaryDisplay.mockReturnValue(display);
    screenMock.getAllDisplays.mockReturnValue([display]);
    screenMock.getCursorScreenPoint.mockReturnValue({ x: 100, y: 100 });
    screenMock.getDisplayNearestPoint.mockReturnValue(display);
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

    const alertWindow = createdWindows[0];
    expect(alertWindow).toBeDefined();
    expect(alertWindow?.destroyed).toBe(false);

    mainWindow.emit('focus');

    expect(alertWindow?.destroyed).toBe(true);
    manager.dispose();
  });
});
