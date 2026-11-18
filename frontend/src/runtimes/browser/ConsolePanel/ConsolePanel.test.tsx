import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConsoleEntry } from '../../previewConsole';
import ConsolePanel from './ConsolePanel';
import { formatTimestamp } from './formatTimestamp';

function renderPanel(entries: ConsoleEntry[] = []) {
  const onClear = vi.fn();
  const onResetStorage = vi.fn();
  render(<ConsolePanel entries={entries} onClear={onClear} onResetStorage={onResetStorage} />);
  return { onClear, onResetStorage };
}

describe('formatTimestamp', () => {
  it('formats local time as HH:mm:ss.SSS', () => {
    expect(formatTimestamp(new Date(2026, 8, 28, 9, 4, 7, 12).getTime())).toBe('09:04:07.012');
    expect(formatTimestamp(new Date(2026, 8, 28, 21, 30, 59, 999).getTime())).toBe('21:30:59.999');
  });
});

describe('ConsolePanel', () => {
  it('shows each entry with its timestamp, level and source', () => {
    const ts = new Date(2026, 8, 28, 14, 2, 3, 45).getTime();
    renderPanel([
      {
        id: 1,
        ts,
        level: 'error',
        text: 'Uncaught TypeError: x is undefined',
        source: 'script.js:12',
      },
    ]);

    expect(screen.getByText('14:02:03.045')).toBeInTheDocument();
    expect(screen.getByText('error')).toBeInTheDocument();
    expect(screen.getByText('Uncaught TypeError: x is undefined')).toBeInTheDocument();
    expect(screen.getByText('script.js:12')).toBeInTheDocument();
  });

  it('gives warn and error rows their classes', () => {
    renderPanel([
      { id: 1, ts: 0, level: 'log', text: 'plain' },
      { id: 2, ts: 0, level: 'warn', text: 'careful' },
      { id: 3, ts: 0, level: 'error', text: 'bad' },
      { id: 4, ts: 0, level: 'runtime', text: 'thrown' },
      { id: 5, ts: 0, level: 'build', text: 'broken' },
      { id: 6, ts: 0, level: 'system', text: 'note' },
    ]);

    const rowOf = (text: string) => screen.getByText(text).closest('[data-level]') as HTMLElement;
    expect(rowOf('plain').className).not.toMatch(/warn|error/);
    expect(rowOf('careful').className).toMatch(/warn/);
    expect(rowOf('bad').className).toMatch(/error/);
    expect(rowOf('thrown').className).toMatch(/error/);
    expect(rowOf('broken').className).toMatch(/error/);
    expect(rowOf('note').className).toMatch(/info/);
  });

  it('calls onClear and onResetStorage', async () => {
    const user = userEvent.setup();
    const { onClear, onResetStorage } = renderPanel();

    await user.click(screen.getByRole('button', { name: 'Clear console' }));
    await user.click(screen.getByRole('button', { name: 'Reset localStorage' }));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onResetStorage).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state', () => {
    renderPanel();
    expect(screen.getByText('Console output from your page appears here.')).toBeInTheDocument();
  });

  it('is not an aria-live region', () => {
    renderPanel([{ id: 1, ts: 0, level: 'log', text: 'hi' }]);
    expect(document.querySelector('[aria-live]')).toBeNull();
  });
});
