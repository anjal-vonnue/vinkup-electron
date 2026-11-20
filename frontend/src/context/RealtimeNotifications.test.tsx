import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeEvent } from '@itp/types';
import { ToastProvider } from '../components/Toast';
import { RealtimeProvider } from './RealtimeProvider';
import { RealtimeNotifications } from './RealtimeNotifications';
import { installFakeEventSource, type FakeEventSourceHandle } from '../test/fakeEventSource';

let fake: FakeEventSourceHandle;

beforeEach(() => {
  fake = installFakeEventSource();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderNotifications() {
  return render(
    <ToastProvider>
      <RealtimeProvider enabled>
        <RealtimeNotifications />
      </RealtimeProvider>
    </ToastProvider>
  );
}

function emit(event: RealtimeEvent) {
  act(() => fake.source?.emit(event));
}

describe('RealtimeNotifications', () => {
  it('announces an approval with the task title and the mentor', async () => {
    renderNotifications();

    emit({
      type: 'task.reviewed',
      taskId: 't1',
      taskTitle: 'Services Grid Layout',
      decision: 'approved',
      reviewStatus: 'approved',
      submissionNo: 1,
      feedback: '',
      mentorName: 'Maya Menon',
      reviewedAt: '2026-11-18T10:00:00.000Z',
    });

    expect(
      await screen.findByText('"Services Grid Layout" was approved by Maya Menon.')
    ).toBeInTheDocument();
  });

  it('announces a rework request and points at the feedback', async () => {
    renderNotifications();

    emit({
      type: 'task.reviewed',
      taskId: 't1',
      taskTitle: 'Services Grid Layout',
      decision: 'rework',
      reviewStatus: 'rework',
      submissionNo: 1,
      feedback: 'Add the 768px breakpoint.',
      mentorName: 'Maya Menon',
      reviewedAt: '2026-11-18T10:00:00.000Z',
    });

    expect(
      await screen.findByText(
        '"Services Grid Layout" was sent back for rework by Maya Menon. Open the feedback for details.'
      )
    ).toBeInTheDocument();
  });

  it('announces a first submission to the mentor', async () => {
    renderNotifications();

    emit({
      type: 'task.submitted',
      traineeId: 'tr1',
      traineeName: 'Asha Nair',
      taskId: 't1',
      taskTitle: 'Services Grid Layout',
      submissionCount: 1,
      submittedAt: '2026-11-18T10:00:00.000Z',
    });

    expect(
      await screen.findByText('Asha Nair submitted "Services Grid Layout" (attempt #1).')
    ).toBeInTheDocument();
  });

  it('says "resubmitted" on a later attempt', async () => {
    renderNotifications();

    emit({
      type: 'task.submitted',
      traineeId: 'tr1',
      traineeName: 'Asha Nair',
      taskId: 't1',
      taskTitle: 'Services Grid Layout',
      submissionCount: 2,
      submittedAt: '2026-11-18T10:00:00.000Z',
    });

    expect(
      await screen.findByText('Asha Nair resubmitted "Services Grid Layout" (attempt #2).')
    ).toBeInTheDocument();
  });

  it('does not toast when a task moves to In progress', async () => {
    renderNotifications();

    emit({
      type: 'task.started',
      traineeId: 'tr1',
      taskId: 't1',
      startedAt: '2026-11-18T10:00:00.000Z',
    });

    // Let the event reach the subscribers before checking that no toast was added.
    await act(async () => {});

    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('does not toast when an integrity flag is created', async () => {
    renderNotifications();

    emit({
      type: 'flag.created',
      traineeId: 'tr1',
      taskId: 't1',
      flagId: 'flag-1',
      timestamp: '2026-11-18T10:00:00.000Z',
    });

    await act(async () => {});

    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });
});
