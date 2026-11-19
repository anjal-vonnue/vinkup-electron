import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TerminalSessionTabs from './TerminalSessionTabs';
import type { LocalTerminalSession } from './useLocalNodeSession';

function session(key: string, name: string, status: LocalTerminalSession['status'] = 'ready') {
  return { key, name, terminalId: key, status, exitCode: null, error: null };
}

describe('TerminalSessionTabs', () => {
  it('shows session names, the active state and the available actions', () => {
    const onSelect = vi.fn();
    const onNew = vi.fn();
    const onClose = vi.fn();
    render(
      <TerminalSessionTabs
        sessions={[session('a', 'T1'), session('b', 'T2', 'opening')]}
        activeKey="a"
        isCreating={false}
        onSelect={onSelect}
        onNew={onNew}
        onClose={onClose}
      />
    );

    const first = screen.getByRole('tab', { name: /T1/ });
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /T2/ })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('Starting')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /T2/ }));
    expect(onSelect).toHaveBeenCalledWith('b');
    fireEvent.click(screen.getByRole('button', { name: 'Close T2' }));
    expect(onClose).toHaveBeenCalledWith('b');
    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }));
    expect(onNew).toHaveBeenCalled();
  });

  it('prevents closing the last terminal and shows the maximum state', () => {
    const single = render(
      <TerminalSessionTabs
        sessions={[session('a', 'T1')]}
        activeKey="a"
        isCreating={false}
        onSelect={() => undefined}
        onNew={() => undefined}
        onClose={() => undefined}
      />
    );
    expect(screen.getByRole('button', { name: 'Close T1' })).toBeDisabled();
    expect(screen.queryByText(/Max 4/)).not.toBeInTheDocument();
    single.unmount();

    render(
      <TerminalSessionTabs
        sessions={[session('a', 'T1'), session('b', 'T2'), session('c', 'T3'), session('d', 'T4')]}
        activeKey="d"
        isCreating={true}
        onSelect={() => undefined}
        onNew={() => undefined}
        onClose={() => undefined}
      />
    );
    expect(screen.getByText('Max 4')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New terminal' })).toBeDisabled();
  });
});
