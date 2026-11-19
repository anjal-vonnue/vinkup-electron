import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SessionTimer from './SessionTimer';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SessionTimer', () => {
  it('shows the elapsed time and names it for screen readers', () => {
    render(<SessionTimer />);

    const timer = screen.getByRole('timer');
    expect(timer).toHaveTextContent('0:00');
    expect(timer).toHaveAccessibleName('Time on this task: 0 seconds');

    act(() => {
      vi.advanceTimersByTime(754_000);
    });

    expect(timer).toHaveTextContent('12:34');
    expect(timer).toHaveAccessibleName('Time on this task: 12 minutes 34 seconds');
  });

  it('starts again from 0:00 when its key changes', () => {
    const { rerender } = render(<SessionTimer key="task-1" />);
    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('1:30');

    rerender(<SessionTimer key="task-2" />);

    expect(screen.getByRole('timer')).toHaveTextContent('0:00');
  });

  it('freezes and shows "Submitted in" when it is stopped', () => {
    const { rerender } = render(<SessionTimer />);
    act(() => {
      vi.advanceTimersByTime(18 * 60_000);
    });

    rerender(<SessionTimer isStopped />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    const submitted = screen.getByRole('status');
    expect(submitted).toHaveTextContent('Submitted in 18:00');
    expect(submitted).toHaveAccessibleName('Submitted in 18 minutes 0 seconds');
  });

  it('shows only "Submitted" for a task that was already submitted when opened', () => {
    render(<SessionTimer isStopped />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    const submitted = screen.getByRole('status');
    expect(submitted).toHaveTextContent(/^Submitted$/);
    expect(submitted).toHaveAccessibleName('Submitted');
  });

  it('runs again when it is started after a submit (rework)', () => {
    const { rerender } = render(<SessionTimer isStopped />);

    rerender(<SessionTimer isStopped={false} />);
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });

    const timer = screen.getByRole('timer');
    expect(timer).toHaveTextContent('5:00');
    expect(timer).toHaveAccessibleName('Time on this task: 5 minutes 0 seconds');
  });
});
