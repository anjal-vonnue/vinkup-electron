// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { ToastProvider } from '../../../components/Toast';
import { logFlagEvent } from '../../../api/activity';
import TerminalView from './TerminalView';
import { isPasteShortcut } from './isPasteShortcut';

afterEach(() => {
  cleanup();
});
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(_callback: ResizeObserverCallback) {}
}

vi.stubGlobal('ResizeObserver', MockResizeObserver);

// xterm draws with canvas/DOM measurements that jsdom doesn't have: use a fake Terminal.
// vi.mock is hoisted above the imports, so the fake is created with vi.hoisted.
const { FakeTerminal, terminals } = vi.hoisted(() => {
  type TerminalTheme = {
    background?: string;
    foreground?: string;
    cursor?: string;
    selectionBackground?: string;
  };

  type TerminalOptions = {
    theme?: TerminalTheme;
  };

  const created: Array<InstanceType<typeof Fake>> = [];

  class Fake {
    cols = 80;
    rows = 24;
    options: TerminalOptions;
    keyHandler: ((event: KeyboardEvent) => boolean) | null = null;

    open = vi.fn();
    write = vi.fn();
    focus = vi.fn();
    loadAddon = vi.fn();
    dispose = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));

    attachCustomKeyEventHandler = vi.fn((handler: (event: KeyboardEvent) => boolean) => {
      this.keyHandler = handler;
    });

    constructor(options: TerminalOptions = {}) {
      this.options = options;
      created.push(this);
    }
  }

  return { FakeTerminal: Fake, terminals: created };
});

vi.mock('@xterm/xterm', () => ({ Terminal: FakeTerminal }));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn();
  },
}));

vi.mock('../../../api/activity', () => ({
  logFlagEvent: vi.fn(() => Promise.resolve()),
}));

function renderTerminal() {
  const onReady = vi.fn();
  const onResize = vi.fn();

  const view = render(
    <ToastProvider>
      <TerminalView taskId="t-node" isVisible onReady={onReady} onResize={onResize} />
    </ToastProvider>
  );

  return { ...view, onReady, onResize };
}

function key(init: KeyboardEventInit) {
  return new KeyboardEvent('keydown', init);
}

/**
 * Sets the application's theme and its corresponding CSS variables.
 */
function setAppTheme(theme: 'light' | 'dark') {
  const root = document.documentElement;

  root.dataset.theme = theme;

  const tokens =
    theme === 'dark'
      ? {
          '--color-bg-base': '#0d111a',
          '--color-text-primary': '#e0e1f4',
          '--color-accent-purple-soft': '#d8b4fe',
          '--color-accent-purple-wash': '#a855f733',
        }
      : {
          '--color-bg-base': '#f5f6fa',
          '--color-text-primary': '#14162a',
          '--color-accent-purple-soft': '#8e51e6',
          '--color-accent-purple-wash': '#7c41e41a',
        };

  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value);
  }
}

beforeEach(() => {
  terminals.length = 0;
  vi.mocked(logFlagEvent).mockClear();

  setAppTheme('light');
});

describe('TerminalView', () => {
  it('opens one terminal and calls onReady once with it', () => {
    const { onReady } = renderTerminal();

    expect(terminals).toHaveLength(1);
    expect(terminals[0].open).toHaveBeenCalledWith(screen.getByTestId('terminal'));
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith(terminals[0]);
  });

  it('initializes the terminal with the current application theme', () => {
    setAppTheme('dark');

    renderTerminal();

    expect(terminals[0].options.theme).toEqual({
      background: '#0d111a',
      foreground: '#e0e1f4',
      cursor: '#d8b4fe',
      selectionBackground: '#a855f733',
    });
  });

  it('updates the terminal theme when the application switches to dark mode', async () => {
    renderTerminal();

    const terminal = terminals[0];

    expect(terminal.options.theme?.background).toBe('#f5f6fa');

    await act(async () => {
      setAppTheme('dark');
      await Promise.resolve();
    });

    expect(terminal.options.theme).toEqual({
      background: '#0d111a',
      foreground: '#e0e1f4',
      cursor: '#d8b4fe',
      selectionBackground: '#a855f733',
    });

    // Theme changes should not recreate the terminal.
    expect(terminals).toHaveLength(1);
  });

  it('updates the terminal theme when the application switches back to light mode', async () => {
    setAppTheme('dark');
    renderTerminal();

    const terminal = terminals[0];

    expect(terminal.options.theme?.background).toBe('#0d111a');

    await act(async () => {
      setAppTheme('light');
      await Promise.resolve();
    });

    expect(terminal.options.theme).toEqual({
      background: '#f5f6fa',
      foreground: '#14162a',
      cursor: '#8e51e6',
      selectionBackground: '#7c41e41a',
    });

    expect(terminals).toHaveLength(1);
  });

  it('blocks Ctrl+V and Shift+Insert in the key handler and reports once (throttled)', () => {
    renderTerminal();

    const handler = terminals[0].keyHandler;

    if (!handler) {
      throw new Error('no key handler attached');
    }

    // act(): the handler shows a toast, which is a React state update.
    let results: boolean[] = [];

    act(() => {
      results = [
        handler(key({ key: 'v', ctrlKey: true })),
        handler(key({ key: 'Insert', shiftKey: true })),
        handler(key({ key: 'a' })),
        handler(new KeyboardEvent('keyup', { key: 'v', ctrlKey: true })),
      ];
    });

    expect(results).toEqual([false, false, true, true]);

    expect(logFlagEvent).toHaveBeenCalledTimes(1);
    expect(logFlagEvent).toHaveBeenCalledWith('t-node', {
      type: 'PASTE_BLOCKED',
      context: { source: 'terminal' },
    });

    expect(screen.getByText('Pasting is turned off in the workspace.')).toBeTruthy();
  });

  it('prevents a paste event on the container', () => {
    renderTerminal();

    const container = screen.getByTestId('terminal');
    const allowed = fireEvent.paste(container);

    expect(allowed).toBe(false);
    expect(logFlagEvent).toHaveBeenCalledTimes(1);
  });

  it('disposes the terminal on unmount', () => {
    const { unmount } = renderTerminal();

    unmount();

    expect(terminals[0].dispose).toHaveBeenCalledTimes(1);
  });
});

describe('isPasteShortcut', () => {
  it.each([
    [{ key: 'v', ctrlKey: true }, true],
    [{ key: 'v', metaKey: true }, true],
    [{ key: 'V', ctrlKey: true, shiftKey: true }, true],
    [{ key: 'Insert', shiftKey: true }, true],
    [{ key: 'v' }, false],
    [{ key: 'c', ctrlKey: true }, false],
    [{ key: 'Insert' }, false],
  ])('%j → %s', (init, expected) => {
    expect(isPasteShortcut(key(init))).toBe(expected);
  });
});
