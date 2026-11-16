// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AdminFlagEvent, AdminTraineeDetail } from '@itp/types';

import PrintReport from './PrintReport';
import { DEFAULT_PRINT_OPTIONS, type PrintReportOptions } from '../../lib/printReport';
import {
  buildAdminFlags,
  buildAdminTraineeDetail,
  mockAdminTraineeIds,
} from '../../test/fixtures/admin';

import '@testing-library/jest-dom/vitest';

afterEach(() => {
  cleanup();
});

const detail = buildAdminTraineeDetail(mockAdminTraineeIds[0]) as AdminTraineeDetail;

const flags = buildAdminFlags(mockAdminTraineeIds[2]) as AdminFlagEvent[];

const importantFlags = flags.filter((flag) => flag.reviewPriority !== 'LOW');

type RenderOverrides = {
  detail?: AdminTraineeDetail;
  flags?: AdminFlagEvent[] | null;
  options?: PrintReportOptions;
  mentorName?: string | null;
};

function renderReport(overrides: RenderOverrides = {}) {
  render(
    <PrintReport
      detail={overrides.detail ?? detail}
      flags={overrides.flags === undefined ? flags : overrides.flags}
      dayLabels={new Map([['html-1', 'HTML · Day 1']])}
      options={overrides.options ?? DEFAULT_PRINT_OPTIONS}
      mentorName={overrides.mentorName === undefined ? 'Mock Mentor' : overrides.mentorName}
      generatedAt={new Date('2026-10-08T06:30:00.000Z')}
    />
  );

  return screen.getByRole('article', {
    name: 'Printable trainee report',
  });
}

describe('PrintReport', () => {
  it('renders trainee details and report metadata', () => {
    const report = renderReport();
    const { trainee } = detail.profile;

    expect(
      within(report).getByRole('heading', {
        level: 1,
        name: trainee.name,
      })
    ).toBeInTheDocument();

    expect(report).toHaveTextContent(trainee.email);
    expect(report).toHaveTextContent(`Day ${trainee.currentDay}`);
    expect(report).toHaveTextContent(`of ${trainee.totalDays}`);
    expect(report).toHaveTextContent(trainee.track);
    expect(report).toHaveTextContent(/Prepared by\s*Mock Mentor/);
    expect(report).toHaveTextContent('Confidential, for mentor use only');
  });

  it('does not render prepared-by metadata when the mentor is unknown', () => {
    const report = renderReport({ mentorName: null });

    expect(report).not.toHaveTextContent('Prepared by');
  });

  it('renders the summary metrics', () => {
    const report = renderReport();
    const summary = within(report).getByLabelText('Summary');

    expect(summary).toHaveTextContent('Current Course Progress');
    expect(summary).toHaveTextContent('Tasks');
    expect(summary).toHaveTextContent(`${detail.tasks.length}`);
    expect(summary).toHaveTextContent('Important flags');
    expect(summary).toHaveTextContent(`${importantFlags.length}`);
  });

  it('renders performance and typing statistics', () => {
    const report = renderReport();

    const performance = within(report)
      .getByRole('heading', {
        level: 2,
        name: /^Performance$/,
      })
      .closest('section') as HTMLElement;

    const stats = within(performance).getByLabelText('Training statistics');

    expect(stats).toHaveTextContent(`${detail.typingStats.averageWpm}`);

    expect(stats).toHaveTextContent(`${detail.typingStats.averageAccuracy}%`);

    if (detail.typingStats.highestWpm !== null) {
      expect(stats).toHaveTextContent(`${detail.typingStats.highestWpm}`);
    }

    if (detail.typingStats.highestWpmAccuracy !== null) {
      expect(stats).toHaveTextContent(`${detail.typingStats.highestWpmAccuracy}%`);
    }
  });

  it('does not render removed report sections', () => {
    const report = renderReport();

    expect(
      within(report).queryByRole('heading', {
        name: /progress by course/i,
      })
    ).not.toBeInTheDocument();

    expect(
      within(report).queryByRole('heading', {
        name: /submitted tasks|recent submissions/i,
      })
    ).not.toBeInTheDocument();

    expect(
      within(report).queryByRole('heading', {
        name: /review feedback|mentor feedback/i,
      })
    ).not.toBeInTheDocument();

    expect(
      within(report).queryByRole('heading', {
        name: /^journal/i,
      })
    ).not.toBeInTheDocument();

    expect(within(report).queryByLabelText('Course and day progress')).not.toBeInTheDocument();

    expect(within(report).queryByLabelText('Daily training activity')).not.toBeInTheDocument();
  });

  it('renders only important focus events', () => {
    const report = renderReport();

    const focusEvents = within(report)
      .getByRole('heading', {
        level: 2,
        name: /^Focus events$/,
      })
      .closest('section') as HTMLElement;

    expect(focusEvents).toHaveTextContent(
      `${importantFlags.length} important events out of ${flags.length} recorded.`
    );

    expect(within(focusEvents).getAllByRole('row')).toHaveLength(
      Math.min(importantFlags.length, 8) + 1
    );
  });

  it('shows the important flag count in the summary', () => {
    const report = renderReport();
    const summary = within(report).getByLabelText('Summary');

    expect(summary).toHaveTextContent(`${importantFlags.length}`);
  });

  it('hides focus events and their summary metric when flags are disabled', () => {
    const report = renderReport({
      options: {
        ...DEFAULT_PRINT_OPTIONS,
        includeFlags: false,
      },
    });

    expect(
      within(report).queryByRole('heading', {
        name: /^Focus events$/,
      })
    ).not.toBeInTheDocument();

    expect(within(report).getByLabelText('Summary')).not.toHaveTextContent('Important flags');
  });

  it('shows an unavailable message when flags fail to load', () => {
    const report = renderReport({ flags: null });

    expect(within(report).getByText('Flagged events unavailable.')).toBeInTheDocument();

    expect(within(report).getByLabelText('Summary')).toHaveTextContent('—');
  });

  it('shows an empty message when no important focus events exist', () => {
    const report = renderReport({
      flags: flags.filter((flag) => flag.reviewPriority === 'LOW'),
    });

    expect(within(report).getByText('No important focus events recorded.')).toBeInTheDocument();
  });

  it('limits the focus event table to eight entries', () => {
    const manyFlags = Array.from({ length: 12 }, (_, index) => ({
      ...importantFlags[0],
      id: `flag-${index}`,
      timestamp: new Date(Date.UTC(2026, 9, index + 1)).toISOString(),
    }));

    const report = renderReport({ flags: manyFlags });

    const focusEvents = within(report)
      .getByRole('heading', {
        level: 2,
        name: /^Focus events$/,
      })
      .closest('section') as HTMLElement;

    expect(within(focusEvents).getAllByRole('row')).toHaveLength(9);

    expect(focusEvents).toHaveTextContent('8 of 12 important');
  });

  it('handles missing typing test results', () => {
    const detailWithoutTypingTests: AdminTraineeDetail = {
      ...detail,
      typingStats: {
        averageWpm: 0,
        averageAccuracy: 0,
        highestWpm: null,
        highestWpmAccuracy: null,
      },
    };

    const report = renderReport({
      detail: detailWithoutTypingTests,
    });

    const performance = within(report)
      .getByRole('heading', {
        level: 2,
        name: /^Performance$/,
      })
      .closest('section') as HTMLElement;

    const stats = within(performance).getByLabelText('Training statistics');

    expect(stats).toHaveTextContent('0');
  });

  it('renders the report footer', () => {
    const report = renderReport();

    expect(report).toHaveTextContent('Vinkup trainee progress report');

    expect(report).toHaveTextContent('Confidential, for mentor use only');
  });
});
