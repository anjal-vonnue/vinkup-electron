import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bell, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import MarkdownRenderer from '../MarkdownRenderer/MarkdownRenderer';
import styles from './NotificationsBanner.module.css';

export type DashboardNotification = {
  id: string;
  type: 'rework' | 'comment';
  taskId: string;
  taskTitle: string;
  dayNumber: number;
  courseTitle: string;
  adminId: string;
  adminName: string;
  submissionNo: number;
  decision: 'rework' | 'approved';
  feedback: string;
  reviewedAt: string;
};

export type NotificationsBannerProps = {
  notifications: DashboardNotification[];
  onOpenFeedback: (notification: DashboardNotification) => void;
  onOpenTask: (notification: DashboardNotification) => void;
};

export default function NotificationsBanner({
  notifications,
  onOpenFeedback,
  onOpenTask,
}: NotificationsBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(() => new Set());
  const removalTimers = useRef(new Map<string, number>());

  useEffect(
    () => () => {
      removalTimers.current.forEach((timer) => window.clearTimeout(timer));
      removalTimers.current.clear();
    },
    []
  );

  const runNotificationAction = (
    notification: DashboardNotification,
    action: (item: DashboardNotification) => void
  ) => {
    if (notification.type === 'rework') {
      action(notification);
      return;
    }
    if (removingIds.has(notification.id)) return;

    setRemovingIds((ids) => new Set(ids).add(notification.id));
    const timer = window.setTimeout(() => {
      action(notification);
      setRemovingIds((ids) => {
        const next = new Set(ids);
        next.delete(notification.id);
        return next;
      });
      removalTimers.current.delete(notification.id);
    }, 240);
    removalTimers.current.set(notification.id, timer);
  };

  if (notifications.length === 0) return null;

  return (
    <section className={styles.banner} aria-labelledby="notifications-banner-title">
      <button
        type="button"
        className={styles.headerButton}
        onClick={() => setIsExpanded((expanded) => !expanded)}
        aria-expanded={isExpanded}
        aria-controls="notifications-banner-list"
      >
        <span className={styles.headerLeft}>
          <Bell className={styles.headerIcon} size={21} aria-hidden="true" />
          <span
            id="notifications-banner-title"
            className={styles.title}
            role="heading"
            aria-level={2}
          >
            Notifications
          </span>
          <span className={styles.count}>
            {notifications.length} {notifications.length === 1 ? 'item' : 'items'}
          </span>
        </span>
        <span className={styles.headerRight}>
          <span className={styles.toggleHint}>
            {isExpanded ? 'Hide details' : 'Click to view details'}
          </span>
          {isExpanded ? (
            <ChevronUp size={18} className={styles.chevron} aria-hidden="true" />
          ) : (
            <ChevronDown size={18} className={styles.chevron} aria-hidden="true" />
          )}
        </span>
      </button>

      <div
        id="notifications-banner-list"
        className={`${styles.listViewport} ${isExpanded ? styles.listViewportOpen : ''}`}
        aria-hidden={!isExpanded}
        inert={!isExpanded}
      >
        <div className={styles.list}>
          {notifications.map((notification) => (
            <article
              key={`${notification.type}-${notification.id}`}
              className={`${styles.item} ${removingIds.has(notification.id) ? styles.itemExiting : ''}`}
              data-type={notification.type}
              data-exiting={removingIds.has(notification.id) || undefined}
              aria-hidden={removingIds.has(notification.id)}
              aria-label={`${notification.type === 'rework' ? 'Rework requested' : 'Mentor comment'} for ${notification.taskTitle}`}
            >
              <div className={styles.itemInfo}>
                <span className={styles.itemEyebrow}>
                  {notification.courseTitle} — DAY {String(notification.dayNumber).padStart(2, '0')}
                </span>
                <h3 className={styles.itemTitle}>{notification.taskTitle}</h3>
                <div className={styles.feedbackSnippet}>
                  <span className={styles.reviewerNote}>{notification.adminName || 'Mentor'}:</span>
                  <MarkdownRenderer markdown={notification.feedback} />
                </div>
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.feedbackButton}
                  onClick={() => runNotificationAction(notification, onOpenFeedback)}
                  disabled={removingIds.has(notification.id)}
                >
                  <MessageSquare size={15} aria-hidden="true" />
                  <span>View Feedback</span>
                </button>
                <button
                  type="button"
                  className={styles.taskButton}
                  onClick={() => runNotificationAction(notification, onOpenTask)}
                  disabled={removingIds.has(notification.id)}
                >
                  <span>Go to Task</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
