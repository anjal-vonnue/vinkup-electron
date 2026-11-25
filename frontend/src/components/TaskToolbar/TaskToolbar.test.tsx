import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Runner } from '../../runtimes/runnerContext';
import TaskToolbar, { type TaskToolbarProps } from './TaskToolbar';

const visiblePanes = { sidebar: true, code: true, result: false };

function makeRunner(overrides: Partial<Runner> = {}): Runner {
  return {
    canRun: true,
    label: 'Run',
    title: 'Run (Ctrl+Enter)',
    isRunning: false,
    run: vi.fn(),
    ...overrides,
  };
}

/** Every prop TaskToolbar needs, with sane defaults; override per test. */
function baseProps(overrides: Partial<TaskToolbarProps> = {}): TaskToolbarProps {
  return {
    taskId: 't1',
    timeSpentSeconds: 0,
    estimatedMinutes: 50,
    visiblePanes,
    onTogglePane: vi.fn(),
    onBack: vi.fn(),
    onRun: vi.fn(),
    runner: makeRunner(),
    saveIndicator: null,
    submitSlot: null,
    ...overrides,
  };
}

describe('TaskToolbar', () => {
  it('formats an estimate under an hour', () => {
    render(<TaskToolbar {...baseProps({ estimatedMinutes: 50 })} />);
    expect(screen.getByText('Est: 50 min')).toBeInTheDocument();
  });

  it('formats an estimate over an hour', () => {
    render(<TaskToolbar {...baseProps({ estimatedMinutes: 90 })} />);
    expect(screen.getByText('Est: 1 h 30 min')).toBeInTheDocument();
  });

  it('hides the estimate pill when null', () => {
    render(<TaskToolbar {...baseProps({ estimatedMinutes: null })} />);
    expect(screen.queryByText(/^Est:/)).not.toBeInTheDocument();
  });

  it('calls onBack and onRun', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onRun = vi.fn();
    render(<TaskToolbar {...baseProps({ onBack, onRun })} />);

    await user.click(screen.getByRole('button', { name: /back to tasks/i }));
    expect(onBack).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /run/i }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('shows the runner label and title', () => {
    render(
      <TaskToolbar
        {...baseProps({
          runner: makeRunner({
            label: 'Run: npm test',
            title: 'Run npm test (Ctrl+Enter)',
          }),
        })}
      />
    );
    const button = screen.getByRole('button', { name: /run: npm test/i });
    expect(button).toHaveAttribute('title', 'Run npm test (Ctrl+Enter)');
  });

  it('disables Run when the runner cannot run', () => {
    render(<TaskToolbar {...baseProps({ runner: makeRunner({ canRun: false }) })} />);
    expect(screen.getByRole('button', { name: /run/i })).toBeDisabled();
  });

  it('shows a spinner while the runner is running', () => {
    render(<TaskToolbar {...baseProps({ runner: makeRunner({ isRunning: true }) })} />);
    expect(
      screen.getByRole('button', { name: /run/i }).querySelector('svg')
    ).not.toBeInTheDocument();
  });

  it('shows the submitted pill only when hasSubmitted, with the time when given', () => {
    const { rerender } = render(<TaskToolbar {...baseProps()} />);
    expect(screen.queryByText(/^Submitted/)).not.toBeInTheDocument();

    rerender(<TaskToolbar {...baseProps({ hasSubmitted: true })} />);
    expect(screen.getByText('Submitted')).toBeInTheDocument();

    rerender(
      <TaskToolbar
        {...baseProps({
          hasSubmitted: true,
          submittedAt: new Date(2026, 8, 28, 14, 32, 5),
        })}
      />
    );
    expect(screen.getByText('Submitted 14:32')).toBeInTheDocument();
  });
});
