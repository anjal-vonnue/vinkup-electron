import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AdminFlagEvent } from '@itp/types';
import AdminFlagTable from './AdminFlagTable';

function flag(overrides: Partial<AdminFlagEvent> & Pick<AdminFlagEvent, 'id'>): AdminFlagEvent {
  return {
    type: 'TAB_SWITCH',
    taskId: 't1',
    taskTitle: 'Profile page',
    dayId: 'html-1',
    durationMs: 12_000,
    reviewPriority: 'NORMAL',
    timestamp: '2026-10-05T10:00:00.000Z',
    ...overrides,
  };
}

const dayLabels = new Map([['html-1', 'HTML · Day 1']]);

describe('AdminFlagTable', () => {
  it('shows type, task, day, duration, priority and time for every event', () => {
    render(
      <AdminFlagTable
        dayLabels={dayLabels}
        flags={[
          flag({ id: 'a', type: 'FULLSCREEN_EXIT', durationMs: 125_000, reviewPriority: 'HIGH' }),
        ]}
      />
    );

    const row = screen.getAllByRole('row')[1];
    expect(within(row).getByText('Left fullscreen')).toBeInTheDocument();
    expect(within(row).getByText('Profile page')).toBeInTheDocument();
    expect(within(row).getByText('HTML · Day 1')).toBeInTheDocument();
    expect(within(row).getByText('2 m 05 s')).toBeInTheDocument();
    expect(within(row).getByText('High')).toBeInTheDocument();
    expect(within(row).getByText('05 Oct 2026, 15:30')).toBeInTheDocument();
  });

  it('shows an idle flag neutrally, with its length and start time (IST)', () => {
    render(
      <AdminFlagTable
        dayLabels={dayLabels}
        // Recorded at 15:30 IST after 18 minutes idle, so it started at 15:12.
        flags={[flag({ id: 'idle', type: 'IDLE', durationMs: 18 * 60_000 })]}
      />
    );

    const row = screen.getAllByRole('row')[1];
    expect(within(row).getByText('Idle for 18 min (from 15:12)')).toBeInTheDocument();
    expect(within(row).getByText('Profile page')).toBeInTheDocument();
    expect(within(row).getByText('Normal')).toBeInTheDocument();
    expect(screen.getByText(/it can also mean reading or thinking/)).toBeInTheDocument();
    expect(screen.queryByText(/suspicious/i)).not.toBeInTheDocument();
  });

  it('lists the newest event first, even when the data arrives in another order', () => {
    render(
      <AdminFlagTable
        dayLabels={dayLabels}
        flags={[
          flag({ id: 'old', taskTitle: 'Oldest', timestamp: '2026-10-01T10:00:00.000Z' }),
          flag({ id: 'new', taskTitle: 'Newest', timestamp: '2026-10-07T10:00:00.000Z' }),
          flag({ id: 'mid', taskTitle: 'Middle', timestamp: '2026-10-04T10:00:00.000Z' }),
        ]}
      />
    );

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[2].textContent)).toEqual([
      'Newest',
      'Middle',
      'Oldest',
    ]);
  });

  it('shows a dash when there is no duration and the day id when the day is unknown', async () => {
    const user = userEvent.setup();
    render(
      <AdminFlagTable
        dayLabels={new Map()}
        flags={[flag({ id: 'a', type: 'PASTE_BLOCKED', durationMs: null, reviewPriority: 'HIGH' })]}
      />
    );

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('html-1')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Important/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^All/ }));
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('shows only Normal and High events at first, with counts for both views', async () => {
    const user = userEvent.setup();
    render(
      <AdminFlagTable
        dayLabels={dayLabels}
        flags={[
          flag({ id: 'low', taskTitle: 'Brief one', reviewPriority: 'LOW', durationMs: 2000 }),
          flag({ id: 'normal', taskTitle: 'Medium one', reviewPriority: 'NORMAL' }),
          flag({ id: 'high', taskTitle: 'Long one', reviewPriority: 'HIGH', durationMs: 90_000 }),
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'Important (2)' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'All (3)' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.queryByText('Brief one')).not.toBeInTheDocument();
    expect(screen.getByText('Medium one')).toBeInTheDocument();
    expect(screen.getByText('Long one')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All (3)' }));

    expect(screen.getByText('Brief one')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: 'Important (2)' }));

    expect(screen.queryByText('Brief one')).not.toBeInTheDocument();
  });

  it('explains when only minor events exist, and they are one click away', async () => {
    const user = userEvent.setup();
    render(
      <AdminFlagTable
        dayLabels={dayLabels}
        flags={[flag({ id: 'low', taskTitle: 'Brief one', reviewPriority: 'LOW' })]}
      />
    );

    expect(screen.getByText(/No important events\. 1 minor event is hidden\./)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All (1)' }));

    expect(screen.getByText('Brief one')).toBeInTheDocument();
  });

  it('says when the list was cut off at the API limit', () => {
    const many = Array.from({ length: 500 }, (_, index) => flag({ id: `f${index}` }));
    render(<AdminFlagTable dayLabels={dayLabels} flags={many} />);

    expect(screen.getByText('Showing the 500 most recent events.')).toBeInTheDocument();
  });

  it('has an empty state', () => {
    render(<AdminFlagTable dayLabels={dayLabels} flags={[]} />);

    expect(screen.getByText('No focus events recorded for this trainee.')).toBeInTheDocument();
  });
});
