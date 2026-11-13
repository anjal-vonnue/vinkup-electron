import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { DesktopApi } from '@itp/types';
import { usePrintMode } from './usePrintMode';

type Options = { includeJournal: boolean };

const DEFAULTS: Options = { includeJournal: true };
const TITLE = 'Report – Asha Rao – 2026-10-08';

function renderPrintMode() {
  return renderHook(() => usePrintMode<Options>({ defaults: DEFAULTS, documentTitle: TITLE }));
}

function fire(name: 'beforeprint' | 'afterprint') {
  act(() => {
    window.dispatchEvent(new Event(name));
  });
}

let printSpy: MockInstance<typeof window.print>;

beforeEach(() => {
  document.documentElement.dataset.theme = 'dark';
  document.title = 'Mentor view';
  window.localStorage.setItem('itp-theme', 'dark');
  printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);
});

afterEach(() => {
  printSpy.mockRestore();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete window.desktop;
});

function installDesktopPrintApi(begin: () => Promise<void> = () => Promise.resolve()) {
  const end = vi.fn(() => Promise.resolve());
  const desktopApi: DesktopApi = {
    app: {
      getInfo: () => Promise.resolve({ version: '0.0.0', platform: 'linux', isPackaged: false }),
    },
    auth: {
      getState: () =>
        Promise.resolve({
          status: 'unauthenticated',
          user: null,
          error: null,
          persistent: false,
        }),
      login: () =>
        Promise.resolve({
          status: 'unauthenticated',
          user: null,
          error: null,
          persistent: false,
        }),
      cancel: () => Promise.resolve(),
      refresh: () =>
        Promise.resolve({
          status: 'unauthenticated',
          user: null,
          error: null,
          persistent: false,
        }),
      logout: () => Promise.resolve(),
      onChange: () => () => undefined,
    },
    window: {
      setFullscreen: () => Promise.resolve(false),
      isFullscreen: () => Promise.resolve(false),
      beginCertificatePrint: begin,
      endCertificatePrint: end,
      onFullscreenChange: () => () => undefined,
    },
  };
  window.desktop = desktopApi;
  return { end };
}

describe('usePrintMode', () => {
  it('starts with nothing to print', () => {
    const { result } = renderPrintMode();

    expect(result.current.printJob).toBeNull();
  });

  it('print() renders the job, switches to the light theme and report title, then prints', async () => {
    const { result } = renderPrintMode();

    await act(async () => {
      await result.current.print({ includeJournal: false });
    });

    expect(result.current.printJob?.options).toEqual({ includeJournal: false });
    expect(result.current.printJob?.startedAt).toBeInstanceOf(Date);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.title).toBe(TITLE);
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('starts the desktop print exception before opening the print dialog', async () => {
    const begin = vi.fn(() => Promise.resolve());
    installDesktopPrintApi(begin);
    const { result } = renderHook(() =>
      usePrintMode<Options>({
        defaults: DEFAULTS,
        documentTitle: TITLE,
        desktopPrintException: true,
      })
    );

    await act(async () => {
      await result.current.print(DEFAULTS);
    });

    expect(begin).toHaveBeenCalledOnce();
    expect(printSpy).toHaveBeenCalledOnce();
    expect(begin.mock.invocationCallOrder[0]).toBeLessThan(
      printSpy.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('ends the desktop print exception after the print dialog closes', async () => {
    const { end } = installDesktopPrintApi();
    const { result } = renderHook(() =>
      usePrintMode<Options>({
        defaults: DEFAULTS,
        documentTitle: TITLE,
        desktopPrintException: true,
      })
    );

    await act(async () => {
      await result.current.print(DEFAULTS);
    });
    fire('afterprint');

    expect(end).toHaveBeenCalledOnce();
  });

  it('ends the desktop print exception if the hook unmounts while printing', async () => {
    const { end } = installDesktopPrintApi();
    const { result, unmount } = renderHook(() =>
      usePrintMode<Options>({
        defaults: DEFAULTS,
        documentTitle: TITLE,
        desktopPrintException: true,
      })
    );

    await act(async () => {
      await result.current.print(DEFAULTS);
    });
    unmount();

    expect(end).toHaveBeenCalledOnce();
  });

  it('does not open the print dialog if the main process rejects the exception request', async () => {
    installDesktopPrintApi(() => Promise.reject(new Error('Rejected')));
    const { result } = renderHook(() =>
      usePrintMode<Options>({
        defaults: DEFAULTS,
        documentTitle: TITLE,
        desktopPrintException: true,
      })
    );

    await act(async () => {
      await expect(result.current.print(DEFAULTS)).rejects.toThrow('Rejected');
    });

    expect(printSpy).not.toHaveBeenCalled();
    expect(document.title).toBe('Mentor view');
  });

  it('puts the theme and title back after printing and removes the job', async () => {
    const { result } = renderPrintMode();
    await act(async () => {
      await result.current.print(DEFAULTS);
    });

    fire('afterprint');

    expect(result.current.printJob).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.title).toBe('Mentor view');
  });

  it('never changes the saved theme preference', async () => {
    const { result } = renderPrintMode();
    await act(async () => {
      await result.current.print(DEFAULTS);
    });
    fire('afterprint');

    expect(window.localStorage.getItem('itp-theme')).toBe('dark');
  });

  it('uses the defaults when printing starts from the browser (Ctrl/Cmd+P)', () => {
    const { result } = renderPrintMode();

    fire('beforeprint');

    expect(result.current.printJob?.options).toEqual(DEFAULTS);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(printSpy).not.toHaveBeenCalled();

    fire('afterprint');
    expect(result.current.printJob).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('keeps the chosen options when the browser fires beforeprint after print()', async () => {
    const { result } = renderPrintMode();
    await act(async () => {
      await result.current.print({ includeJournal: false });
    });

    fire('beforeprint');

    expect(result.current.printJob?.options).toEqual({ includeJournal: false });
  });

  it('removes the theme attribute again when there was none before', async () => {
    delete document.documentElement.dataset.theme;
    const { result } = renderPrintMode();
    await act(async () => {
      await result.current.print(DEFAULTS);
    });

    fire('afterprint');

    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('restores the page when it unmounts in the middle of printing', async () => {
    const { result, unmount } = renderPrintMode();
    await act(async () => {
      await result.current.print(DEFAULTS);
    });

    unmount();

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.title).toBe('Mentor view');
  });

  it('stops listening after unmount', () => {
    const { unmount } = renderPrintMode();
    unmount();

    fire('beforeprint');

    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
