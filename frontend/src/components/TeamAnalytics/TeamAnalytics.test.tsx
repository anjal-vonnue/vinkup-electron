import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAnalytics, AdminAnalyticsQuery } from '@itp/types';
import { getAdminAnalytics } from '../../api/admin';
import { medianDaysCompleted, needsAttention } from '../../lib/adminTrainees';
import { periodRange } from '../../lib/analyticsRange';
import { todayKey } from '../../lib/platformDate';
import { buildAdminAnalytics, buildAdminTrainees } from '../../test/fixtures/admin';
import TeamAnalytics from './TeamAnalytics';

vi.mock('../../api/admin', () => ({ getAdminAnalytics: vi.fn() }));
const mockedGet = vi.mocked(getAdminAnalytics);

// Note: jsdom has no layout, so Recharts draws no SVG here. These tests check everything
// around the charts (data, filters, text, states); the drawing is checked in the app.

const trainees = buildAdminTrainees();

function attentionReasons(): Record<string, string[]> {
  const median = medianDaysCompleted(trainees);
  const reasons: Record<string, string[]> = {};
  for (const t of trainees) reasons[t.id] = needsAttention(t, todayKey(), median);
  return reasons;
}

/** The same empty answer the real backend gives for a team with no activity yet. */
function emptyAnalytics(query: AdminAnalyticsQuery): AdminAnalytics {
  return {
    from: query.from,
    to: query.to,
    traineeId: query.traineeId ?? null,
    traineeCount: trainees.length,
    totals: {
      daysCompleted: 0,
      tasksSubmitted: 0,
      activeSeconds: 0,
      codingSeconds: 0,
      typingTests: 0,
    },
    progressTrend: [{ date: query.to, averageDaysCompleted: 0 }],
    traineeComparison: trainees.map((t) => ({
      traineeId: t.id,
      name: t.name,
      daysCompleted: 0,
      totalDays: 54,
      codingSeconds: 0,
      activeSeconds: 0,
    })),
    taskStatus: {
      approved: 0,
      waitingForReview: 0,
      sentBack: 0,
      inProgress: 0,
      notStarted: 260 * trainees.length,
    },
    typingTrend: [],
    integrityTrend: [],
  };
}

function renderAnalytics() {
  render(<TeamAnalytics trainees={trainees} attentionReasons={attentionReasons()} />);
}

function card(title: string) {
  return screen.getByRole('heading', { name: title }).closest('figure') as HTMLElement;
}

beforeEach(() => {
  mockedGet.mockReset();
  mockedGet.mockImplementation((query) => Promise.resolve(buildAdminAnalytics(query)!));
});

describe('TeamAnalytics: loading and filters', () => {
  it('shows a loader, then the totals for the last 30 days of the whole team', async () => {
    renderAnalytics();

    expect(screen.getByRole('status')).toHaveTextContent('Loading analytics');
    expect(await screen.findByText('Days completed')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith({ ...periodRange(30), traineeId: undefined });
    expect(screen.getByText(/^Whole team ·/)).toBeInTheDocument();
  });

  it('asks for one trainee and names them when the trainee filter changes', async () => {
    const user = userEvent.setup();
    renderAnalytics();
    await screen.findByText('Days completed');

    await user.selectOptions(screen.getByLabelText('Trainee'), trainees[0].id);

    await waitFor(() =>
      expect(mockedGet).toHaveBeenLastCalledWith({ ...periodRange(30), traineeId: trainees[0].id })
    );
    expect(await screen.findByText(new RegExp(`^${trainees[0].name} ·`))).toBeInTheDocument();
  });

  it('asks for the chosen period when the period filter changes', async () => {
    const user = userEvent.setup();
    renderAnalytics();
    await screen.findByText('Days completed');

    await user.selectOptions(screen.getByLabelText('Period'), '7');

    await waitFor(() =>
      expect(mockedGet).toHaveBeenLastCalledWith({ ...periodRange(7), traineeId: undefined })
    );
  });

  it('ignores a slow answer for old filters that arrives after the new one', async () => {
    const user = userEvent.setup();
    let answerFirst: (data: AdminAnalytics) => void = () => {};
    mockedGet.mockImplementationOnce(
      () => new Promise<AdminAnalytics>((resolve) => (answerFirst = resolve))
    );
    renderAnalytics();

    // Switch to one trainee while the whole-team request is still open.
    await user.selectOptions(screen.getByLabelText('Trainee'), trainees[0].id);
    expect(await screen.findByText(new RegExp(`^${trainees[0].name} ·`))).toBeInTheDocument();

    // The old whole-team answer finally arrives (marked with 999 days): it must be ignored.
    const oldAnswer = buildAdminAnalytics(periodRange(30))!;
    answerFirst({ ...oldAnswer, totals: { ...oldAnswer.totals, daysCompleted: 999 } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText('999')).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(`^${trainees[0].name} ·`))).toBeInTheDocument();
  });
});

describe('TeamAnalytics: errors', () => {
  it('shows an error with Try again, and loads again when it is clicked', async () => {
    const user = userEvent.setup();
    mockedGet.mockRejectedValueOnce(new Error('Server is down'));
    renderAnalytics();

    expect(await screen.findByText('Unable to load analytics')).toBeInTheDocument();
    expect(screen.getByText('Server is down')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Days completed')).toBeInTheDocument();
    expect(screen.queryByText('Unable to load analytics')).not.toBeInTheDocument();
  });
});

describe('TeamAnalytics: empty data', () => {
  it('shows an honest empty message instead of each empty chart', async () => {
    mockedGet.mockImplementation((query) => Promise.resolve(emptyAnalytics(query)));
    renderAnalytics();
    await screen.findByText('Days completed');

    expect(within(card('Team progress')).getByRole('status')).toHaveTextContent(
      'No curriculum days have been completed yet.'
    );
    expect(within(card('Typing speed')).getByRole('status')).toHaveTextContent(
      'No typing tests were taken in this period.'
    );
    expect(within(card('Integrity score')).getByRole('status')).toHaveTextContent(
      'No completed days with a score in this period.'
    );
    // Tasks exist even when nobody started them, so this one is not empty.
    expect(within(card('Task status')).getByText('0% of 1300 tasks approved')).toBeInTheDocument();
  });
});

describe('TeamAnalytics: charts', () => {
  it('switches the comparison between completion and coding time', async () => {
    const user = userEvent.setup();
    mockedGet.mockImplementation((query) => Promise.resolve(emptyAnalytics(query)));
    renderAnalytics();
    await screen.findByText('Days completed');
    const comparison = card('Trainee comparison');

    await user.click(within(comparison).getByRole('button', { name: 'Coding time' }));

    expect(within(comparison).getByRole('button', { name: 'Coding time' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(comparison).getByRole('status')).toHaveTextContent(
      'No coding time was recorded in this period.'
    );
  });

  it('lists every task status, split by mentor review, with its count and share', async () => {
    mockedGet.mockImplementation((query) =>
      Promise.resolve({
        ...emptyAnalytics(query),
        // 40 + 12 + 8 + 1 + 939 = 1000 tasks
        taskStatus: {
          approved: 40,
          waitingForReview: 12,
          sentBack: 8,
          inProgress: 1,
          notStarted: 939,
        },
      })
    );
    renderAnalytics();
    await screen.findByText('Days completed');
    const status = card('Task status');

    // Each legend row: name, then "count (share)".
    const rows = within(status).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Approved40 (4%)',
      'Waiting for review12 (1%)',
      'Sent back to fix8 (1%)',
      'In progress1 (<1%)',
      'Not started939 (94%)',
    ]);
    expect(within(status).getByText('4% of 1000 tasks approved')).toBeInTheDocument();
  });

  it('says overdue is not shown, without claiming reviews do not exist', async () => {
    renderAnalytics();
    await screen.findByText('Days completed');
    const status = card('Task status');

    expect(within(status).getByText(/Overdue is not shown/)).toBeInTheDocument();
    // The old, now false, wording.
    expect(within(status).queryByText(/due dates or reviews/)).not.toBeInTheDocument();
  });
});

describe('TeamAnalytics: needs attention', () => {
  it('lists exactly the trainees the table flags, with the same reasons', async () => {
    renderAnalytics();
    await screen.findByText('Days completed');
    const reasons = attentionReasons();
    const flagged = trainees.filter((t) => reasons[t.id].length > 0);
    const list = card('Needs attention');

    expect(
      within(list).getByText(`${flagged.length} of ${trainees.length} trainees`)
    ).toBeInTheDocument();
    expect(within(list).getAllByRole('button')).toHaveLength(flagged.length);
    for (const t of flagged) {
      const row = within(list).getByRole('button', { name: t.name }).closest('li') as HTMLElement;
      expect(row).toHaveTextContent(reasons[t.id].join(' · '));
    }
  });

  it("shows a trainee's analytics when their name is selected", async () => {
    const user = userEvent.setup();
    renderAnalytics();
    await screen.findByText('Days completed');
    const reasons = attentionReasons();
    const first = trainees.find((t) => reasons[t.id].length > 0)!;

    await user.click(within(card('Needs attention')).getByRole('button', { name: first.name }));

    expect(screen.getByLabelText('Trainee')).toHaveValue(first.id);
    await waitFor(() =>
      expect(mockedGet).toHaveBeenLastCalledWith({ ...periodRange(30), traineeId: first.id })
    );
  });
});
