import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AdminFeedbackEntry, AdminFlagEvent, AdminTraineeDetail } from '@itp/types';

import PrintReport from './PrintReport';
import { DEFAULT_PRINT_OPTIONS, type PrintReportOptions } from '../../lib/printReport';
import {
  buildAdminFlags,
  buildAdminTraineeDetail,
  mockAdminTraineeIds,
} from '../../test/fixtures/admin';

const detail = buildAdminTraineeDetail(mockAdminTraineeIds[0]) as AdminTraineeDetail;
// Arjun's mock flags mix High, Normal and Low events.
const flags = buildAdminFlags(mockAdminTraineeIds[2]) as AdminFlagEvent[];
const importantFlags = flags.filter((flag) => flag.reviewPriority !== 'LOW');
const feedback: AdminFeedbackEntry[] = [
  {
    id: 'fb-older',
    taskId: 'task-1',
    taskTitle: 'Semantic HTML',
    dayId: 'html-1',
    adminId: 'admin-1',
    adminName: 'Mentor Alice',
    submissionNo: 1,
    decision: 'rework',
    feedback: 'Add the meta viewport tag.',
    reviewedAt: '2026-10-06T09:00:00.000Z',
  },
  {
    id: 'fb-newer',
    taskId: 'task-1',
    taskTitle: 'Semantic HTML',
    dayId: 'html-1',
    adminId: 'admin-1',
    adminName: 'Mentor Alice',
    submissionNo: 2,
    decision: 'approved',
    feedback: 'The viewport tag is correct now.',
    reviewedAt: '2026-10-07T09:00:00.000Z',
  },
];

function renderReport(
  overrides: {
    detail?: AdminTraineeDetail;
    flags?: AdminFlagEvent[] | null;
    feedback?: AdminFeedbackEntry[] | null;
    options?: PrintReportOptions;
    mentorName?: string | null;
  } = {}
) {
  return render(
    <PrintReport
      detail={overrides.detail ?? detail}
      flags={overrides.flags === undefined ? flags : overrides.flags}
      feedback={overrides.feedback === undefined ? feedback : overrides.feedback}
      dayLabels={new Map()}
      options={overrides.options ?? DEFAULT_PRINT_OPTIONS}
      mentorName={overrides.mentorName === undefined ? 'Mock Mentor' : overrides.mentorName}
      generatedAt={new Date('2026-10-08T06:30:00.000Z')}
    />
  );
}

function section(name: RegExp) {
  return screen.getByRole('heading', { level: 2, name }).closest('section') as HTMLElement;
}

describe('PrintReport', () => {
  it('heads the report with the trainee, their course and who prepared it', () => {
    renderReport();

    const report = screen.getByRole('article', { name: 'Printable trainee report' });
    const { trainee } = detail.profile;
    expect(
      within(report).getByRole('heading', { level: 1, name: trainee.name })
    ).toBeInTheDocument();
    expect(report).toHaveTextContent(trainee.email);
    expect(report).toHaveTextContent(
      `Currently on ${trainee.track} · Day ${trainee.currentDay} of ${trainee.totalDays}`
    );
    expect(report).toHaveTextContent('Prepared by Mock Mentor');
    expect(report).toHaveTextContent('Confidential — for mentor use only');
  });

  it('leaves out "Prepared by" when the mentor name is unknown', () => {
    renderReport({ mentorName: null });

    expect(screen.getByRole('article')).not.toHaveTextContent('Prepared by');
  });

  it('includes the statistics, daily activity and course grid', () => {
    renderReport();

    expect(screen.getByLabelText('Training statistics')).toBeInTheDocument();
    expect(screen.getByLabelText('Daily training activity')).toBeInTheDocument();
    expect(screen.getByLabelText('Course and day progress')).toBeInTheDocument();
  });

  it('lists every submitted task', () => {
    renderReport();

    const tasks = section(/^Submitted tasks/);
    expect(
      within(tasks).getByRole('heading', { name: `Submitted tasks (${detail.tasks.length})` })
    ).toBeInTheDocument();
    // One header row plus one row per task.
    expect(within(tasks).getAllByRole('row')).toHaveLength(detail.tasks.length + 1);
  });

  it('says so when no tasks have been submitted', () => {
    renderReport({ detail: { ...detail, tasks: [] } });

    expect(screen.getByText('No submitted tasks yet.')).toBeInTheDocument();
  });

  it('lists review feedback newest first, with the reviewer and decision', () => {
    renderReport();

    const reviews = section(/^Review feedback/);
    expect(
      within(reviews).getByRole('heading', { name: `Review feedback (${feedback.length})` })
    ).toBeInTheDocument();
    const entries = within(reviews).getAllByRole('listitem');
    expect(entries).toHaveLength(feedback.length);
    expect(entries[0]).toHaveTextContent('The viewport tag is correct now.');
    expect(entries[0]).toHaveTextContent('approved');
    expect(entries[0]).toHaveTextContent('Mentor Alice');
    expect(entries[1]).toHaveTextContent('Add the meta viewport tag.');
  });

  it('says so when there is no review feedback', () => {
    renderReport({ feedback: [] });

    expect(screen.getByText('No review feedback yet.')).toBeInTheDocument();
  });

  it('says review feedback is unavailable when it failed to load', () => {
    renderReport({ feedback: null });

    expect(screen.getByText('Review feedback unavailable.')).toBeInTheDocument();
  });

  it('includes the journal by default', () => {
    renderReport();

    const journal = section(/^Journal/);
    expect(within(journal).getAllByRole('listitem')).toHaveLength(detail.journal.length);
  });

  it('leaves the journal out when it is not chosen', () => {
    renderReport({ options: { includeJournal: false, includeFlags: true } });

    expect(screen.queryByRole('heading', { name: /^Journal/ })).not.toBeInTheDocument();
  });

  it('shows only the important flags, with a count of all recorded events', () => {
    renderReport();

    const flagged = section(/^Flagged events/);
    expect(flagged).toHaveTextContent(
      `${importantFlags.length} important of ${flags.length} recorded.`
    );
    expect(within(flagged).getAllByRole('row')).toHaveLength(importantFlags.length + 1);
  });

  it('leaves the flags out when they are not chosen', () => {
    renderReport({ options: { includeJournal: true, includeFlags: false } });

    expect(screen.queryByRole('heading', { name: 'Flagged events' })).not.toBeInTheDocument();
  });

  it('says the flags are unavailable when they failed to load', () => {
    renderReport({ flags: null });

    expect(screen.getByText('Flagged events unavailable.')).toBeInTheDocument();
  });

  it('says so when there are no important flags', () => {
    renderReport({ flags: flags.filter((flag) => flag.reviewPriority === 'LOW') });

    expect(screen.getByText('No important focus events recorded.')).toBeInTheDocument();
  });
});
