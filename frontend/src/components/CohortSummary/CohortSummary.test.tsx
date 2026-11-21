import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AdminTraineeSummary } from '@itp/types';
import CohortSummary from './CohortSummary';

function trainee(overrides: Partial<AdminTraineeSummary> = {}): AdminTraineeSummary {
  return {
    id: 't-1',
    name: 'Trainee',
    email: 'trainee@vonnue.com',
    daysCompleted: 0,
    totalDays: 54,
    currentDay: { id: 'html-day-01', courseTitle: 'HTML', dayNumber: 1, title: 'Structure' },
    todayActiveSeconds: 0,
    totalActiveSeconds: 0,
    totalCodingSeconds: 0,
    lastActiveDate: null,
    latestWpm: null,
    flagsLast7Days: 0,
    daysScored: 20,
    averageScore: 85,
    pendingReviewItems: [],
    ...overrides,
  };
}

const cohort = [
  trainee({ id: 'a', daysCompleted: 27, todayActiveSeconds: 900 }),
  trainee({ id: 'b', daysCompleted: 0, flagsLast7Days: 3 }),
  trainee({
    id: 'c',
    daysCompleted: 54,
    currentDay: null,
    todayActiveSeconds: 60,
    flagsLast7Days: 2,
  }),
];

const card = (name: string) => screen.getByRole('group', { name });

describe('CohortSummary', () => {
  it('renders the four cards in a labelled section', () => {
    render(<CohortSummary trainees={cohort} />);

    const section = screen.getByRole('region', { name: 'Cohort summary' });
    expect(
      within(section)
        .getAllByRole('group')
        .map((g) => g.getAttribute('aria-label'))
    ).toEqual(['Trainees', 'Average progress', 'Active today', 'Flags this week']);
  });

  it('shows the trainee count and how many finished', () => {
    render(<CohortSummary trainees={cohort} />);

    expect(within(card('Trainees')).getByText('3')).toBeInTheDocument();
    expect(within(card('Trainees')).getByText('1 finished')).toBeInTheDocument();
  });

  it('hides the finished line when nobody has finished', () => {
    render(<CohortSummary trainees={[trainee()]} />);

    expect(within(card('Trainees')).queryByText(/finished/)).toBeNull();
  });

  it('shows average progress as a percentage and in days', () => {
    render(<CohortSummary trainees={cohort} />);

    expect(within(card('Average progress')).getByText('50%')).toBeInTheDocument();
    expect(within(card('Average progress')).getByText('27 of 54 days')).toBeInTheDocument();
  });

  it('shows how many trainees were active today', () => {
    render(<CohortSummary trainees={cohort} />);

    expect(within(card('Active today')).getByText('2 of 3')).toBeInTheDocument();
  });

  it('shows the week’s flags in the warning tone', () => {
    render(<CohortSummary trainees={cohort} />);

    expect(within(card('Flags this week')).getByText('5')).toBeInTheDocument();
    expect(within(card('Flags this week')).getByText('across 2 trainees')).toBeInTheDocument();
    expect(card('Flags this week')).toHaveAttribute('data-tone', 'warning');
  });

  it('uses singular wording for one flagged trainee', () => {
    render(<CohortSummary trainees={[trainee({ flagsLast7Days: 1 })]} />);

    expect(within(card('Flags this week')).getByText('across 1 trainee')).toBeInTheDocument();
  });

  it('shows a neutral flags card when there are no flags', () => {
    render(<CohortSummary trainees={[trainee(), trainee({ id: 'b' })]} />);

    expect(within(card('Flags this week')).getByText('0')).toBeInTheDocument();
    expect(within(card('Flags this week')).getByText('No flags')).toBeInTheDocument();
    expect(card('Flags this week')).not.toHaveAttribute('data-tone');
  });
});
