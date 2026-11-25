import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import type { DashboardNotification } from './NotificationsBanner';
import NotificationsBanner from './NotificationsBanner';

const notifications: DashboardNotification[] = [
  {
    id: 'comment-1',
    type: 'comment',
    taskId: 'task-comment',
    taskTitle: 'Profile page',
    dayNumber: 2,
    courseTitle: 'HTML',
    adminId: 'mentor-1',
    adminName: 'Mentor Maya',
    submissionNo: 1,
    decision: 'approved',
    feedback: 'Consider adding a footer.',
    reviewedAt: '2026-10-02T11:00:00.000Z',
  },
  {
    id: 'rework-1',
    type: 'rework',
    taskId: 'task-rework',
    taskTitle: 'Semantic article',
    dayNumber: 1,
    courseTitle: 'HTML',
    adminId: 'mentor-2',
    adminName: 'Mentor Lee',
    submissionNo: 2,
    decision: 'rework',
    feedback: 'Fix the heading hierarchy.',
    reviewedAt: '2026-10-01T10:00:00.000Z',
  },
];

describe('NotificationsBanner', () => {
  it('renders nothing when there are no notifications', () => {
    const { container } = render(
      <NotificationsBanner notifications={[]} onOpenFeedback={vi.fn()} onOpenTask={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('starts collapsed and shows one combined notification count', () => {
    render(
      <NotificationsBanner
        notifications={notifications}
        onOpenFeedback={vi.fn()}
        onOpenTask={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByText('2 items')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /notifications/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(document.getElementById('notifications-banner-list')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('sorts all notification types by review time and uses the same item actions', async () => {
    const onOpenFeedback = vi.fn();
    const onOpenTask = vi.fn();
    render(
      <NotificationsBanner
        notifications={notifications}
        onOpenFeedback={onOpenFeedback}
        onOpenTask={onOpenTask}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

    const articles = screen.getAllByRole('article');
    expect(articles[0]).toHaveAttribute('data-type', 'comment');
    expect(articles[1]).toHaveAttribute('data-type', 'rework');
    expect(within(articles[0]).getByRole('heading', { name: 'Profile page' })).toBeInTheDocument();
    expect(
      within(articles[1]).getByRole('heading', { name: 'Semantic article' })
    ).toBeInTheDocument();
    for (const article of articles) {
      expect(within(article).getByRole('button', { name: /view feedback/i })).toBeInTheDocument();
      expect(within(article).getByRole('button', { name: /go to task/i })).toBeInTheDocument();
    }

    fireEvent.click(within(articles[0]).getByRole('button', { name: /view feedback/i }));
    expect(articles[0]).toHaveAttribute('data-exiting', 'true');
    fireEvent.click(within(articles[1]).getByRole('button', { name: /go to task/i }));

    await waitFor(() => expect(onOpenFeedback).toHaveBeenCalledWith(notifications[0]));
    expect(onOpenTask).toHaveBeenCalledWith(notifications[1]);
  });
});
