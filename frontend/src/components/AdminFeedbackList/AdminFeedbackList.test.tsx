import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AdminFeedbackEntry } from '@itp/types';
import AdminFeedbackList from './AdminFeedbackList';

const mockFeedback: AdminFeedbackEntry[] = [
  {
    id: 'f-1',
    taskId: 'task-1',
    taskTitle: 'Semantic HTML',
    dayId: 'html-day-01',
    adminId: 'admin-1',
    adminName: 'Mentor Alice',
    submissionNo: 1,
    decision: 'rework',
    feedback: 'Round 1: Add meta viewport tag.',
    reviewedAt: '2026-10-10T10:00:00.000Z',
  },
  {
    id: 'f-2',
    taskId: 'task-1',
    taskTitle: 'Semantic HTML',
    dayId: 'html-day-01',
    adminId: 'admin-2',
    adminName: 'Mentor Bob',
    submissionNo: 2,
    decision: 'approved',
    feedback: 'Round 2: Looking great now, approved!',
    reviewedAt: '2026-10-10T12:00:00.000Z',
  },
  {
    id: 'f-3',
    taskId: 'task-2',
    taskTitle: 'CSS Flexbox',
    dayId: 'css-day-01',
    adminId: 'admin-1',
    adminName: 'Mentor Alice',
    submissionNo: 1,
    decision: 'rework',
    feedback: 'Round 1: Fix alignment on mobile.',
    reviewedAt: '2026-10-11T09:00:00.000Z',
  },
];

describe('AdminFeedbackList', () => {
  it('renders meaningful empty state when feedback list is empty', () => {
    render(<AdminFeedbackList feedback={[]} />);

    expect(screen.getByText('No review feedback yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Written feedback from code review evaluations will appear here/i)
    ).toBeInTheDocument();
  });

  it('renders feedback grouped by task with latest feedback prominent', () => {
    render(<AdminFeedbackList feedback={mockFeedback} />);

    expect(screen.getByText('Semantic HTML')).toBeInTheDocument();
    expect(screen.getByText('CSS Flexbox')).toBeInTheDocument();

    // Round 2 is newer for Semantic HTML, so it should be visible
    expect(screen.getByText('Round 2: Looking great now, approved!')).toBeInTheDocument();
    expect(screen.getByText('Mentor Bob')).toBeInTheDocument();
    expect(screen.getByText('Attempt #2')).toBeInTheDocument();

    // Older feedback is initially hidden under inspect button
    expect(screen.queryByText('Round 1: Add meta viewport tag.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Inspect older feedback/i })).toBeInTheDocument();
  });

  it('progressively expands long Markdown feedback', async () => {
    const user = userEvent.setup();
    for (const lineCount of [9, 20, 80]) {
      const longFeedback = Array.from(
        { length: lineCount },
        (_, index) => `Feedback line ${index + 1}`
      ).join('\n');
      const { unmount } = render(
        <AdminFeedbackList
          feedback={[
            {
              ...mockFeedback[0],
              feedback: longFeedback,
            },
          ]}
        />
      );

      const expand = screen.getByRole('button', { name: 'Show more feedback' });
      const content = expand.parentElement?.previousElementSibling;
      let previousLines = Number(content?.getAttribute('data-visible-lines'));
      let didMidExpansionCollapse = false;
      expect(previousLines).toBeGreaterThan(0);

      while (screen.queryByRole('button', { name: 'Show more feedback' })) {
        await user.click(screen.getByRole('button', { name: 'Show more feedback' }));
        const revealedLines = Number(content?.getAttribute('data-visible-lines'));
        expect(revealedLines).toBeGreaterThan(previousLines);
        previousLines = revealedLines;
        expect(screen.getByRole('button', { name: 'Show less feedback' })).toBeInTheDocument();
        if (!didMidExpansionCollapse && previousLines > 8 && previousLines < lineCount) {
          await user.click(screen.getByRole('button', { name: 'Show less feedback' }));
          expect(Number(content?.getAttribute('data-visible-lines'))).toBe(8);
          expect(
            screen.queryByRole('button', { name: 'Show less feedback' })
          ).not.toBeInTheDocument();
          previousLines = 8;
          didMidExpansionCollapse = true;
        }
      }

      expect(previousLines).toBeGreaterThanOrEqual(lineCount);
      expect(screen.queryByRole('button', { name: 'Show more feedback' })).not.toBeInTheDocument();
      const collapse = screen.getByRole('button', { name: 'Show less feedback' });
      await user.click(collapse);
      expect(Number(content?.getAttribute('data-visible-lines'))).toBe(8);
      expect(screen.getByRole('button', { name: 'Show more feedback' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Show less feedback' })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('keeps only one feedback preview expanded at a time', async () => {
    const user = userEvent.setup();
    const longFeedback = Array.from({ length: 20 }, (_, index) => `Line ${index + 1}`).join('\n');
    const { container } = render(
      <AdminFeedbackList
        feedback={mockFeedback.slice(0, 2).map((entry) => ({ ...entry, feedback: longFeedback }))}
      />
    );

    await user.click(screen.getByRole('button', { name: 'All Timeline' }));
    const expandButtons = screen.getAllByRole('button', { name: 'Show more feedback' });
    const previews = container.querySelectorAll('[data-visible-lines]');

    await user.click(expandButtons[0]);
    await waitFor(() => expect(previews[0]).toHaveAttribute('data-visible-lines', '58'));
    expect(previews[1]).toHaveAttribute('data-visible-lines', '8');

    const secondEntry = previews[1].parentElement?.parentElement;
    await user.click(
      within(secondEntry as HTMLElement).getByRole('button', { name: 'Show more feedback' })
    );
    await waitFor(() => expect(previews[0]).toHaveAttribute('data-visible-lines', '8'));
    expect(previews[1]).toHaveAttribute('data-visible-lines', '58');
  });

  it('expands older feedback when button is clicked', async () => {
    const user = userEvent.setup();
    render(<AdminFeedbackList feedback={mockFeedback} />);

    const inspectBtn = screen.getByRole('button', { name: /Inspect older feedback \(1\)/i });
    await user.click(inspectBtn);

    expect(screen.getByText('Round 1: Add meta viewport tag.')).toBeInTheDocument();
    expect(screen.getAllByText(/Mentor Alice/i).length).toBe(2);
    expect(screen.getByRole('button', { name: /Hide older feedback/i })).toBeInTheDocument();
  });

  it('switches to all timeline view', async () => {
    const user = userEvent.setup();
    render(<AdminFeedbackList feedback={mockFeedback} />);

    await user.click(screen.getByRole('button', { name: 'All Timeline' }));

    // In timeline view, all entries are displayed flat
    expect(screen.getByText('Round 1: Add meta viewport tag.')).toBeInTheDocument();
    expect(screen.getByText('Round 2: Looking great now, approved!')).toBeInTheDocument();
    expect(screen.getByText('Round 1: Fix alignment on mobile.')).toBeInTheDocument();
  });
});
