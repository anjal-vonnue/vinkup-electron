import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import type { AdminFeedbackEntry } from '@itp/types';
import { formatIstDateTime } from '../../lib/formatDateTime';
import styles from './AdminFeedbackList.module.css';

export type AdminFeedbackListProps = {
  feedback: AdminFeedbackEntry[];
};

type ViewMode = 'grouped' | 'timeline';

export default function AdminFeedbackList({ feedback }: AdminFeedbackListProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

  // Sort newest first by default
  const sortedFeedback = useMemo(() => {
    return [...feedback].sort(
      (a, b) => new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime()
    );
  }, [feedback]);

  // Group by task while preserving the latest entry per task at top
  const taskGroups = useMemo(() => {
    const map = new Map<string, { taskTitle: string; entries: AdminFeedbackEntry[] }>();
    for (const item of sortedFeedback) {
      const existing = map.get(item.taskId);
      if (existing) {
        existing.entries.push(item);
      } else {
        map.set(item.taskId, {
          taskTitle: item.taskTitle,
          entries: [item],
        });
      }
    }
    return Array.from(map.entries()).map(([taskId, group]) => ({
      taskId,
      taskTitle: group.taskTitle,
      entries: group.entries,
    }));
  }, [sortedFeedback]);

  const toggleExpand = (taskId: string) => {
    setExpandedTasks((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  if (feedback.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>
          <MessageSquare size={24} aria-hidden="true" />
        </div>
        <h3 className={styles.emptyTitle}>No review feedback yet</h3>
        <p className={styles.emptyDesc}>
          Written feedback from code review evaluations will appear here in chronological order to
          help track trainee progress across submission attempts.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <span className={styles.countText}>
          {feedback.length} review {feedback.length === 1 ? 'entry' : 'entries'} across{' '}
          {taskGroups.length} {taskGroups.length === 1 ? 'task' : 'tasks'}
        </span>

        <div className={styles.filterGroup}>
          <button
            type="button"
            className={`${styles.viewModeBtn} ${viewMode === 'grouped' ? styles.viewModeBtnActive : ''}`}
            onClick={() => setViewMode('grouped')}
          >
            Grouped by Task
          </button>
          <button
            type="button"
            className={`${styles.viewModeBtn} ${viewMode === 'timeline' ? styles.viewModeBtnActive : ''}`}
            onClick={() => setViewMode('timeline')}
          >
            All Timeline
          </button>
        </div>
      </div>

      {viewMode === 'grouped' ? (
        <div className={styles.timeline}>
          {taskGroups.map((group) => {
            const isExpanded = Boolean(expandedTasks[group.taskId]);
            const [latestEntry, ...olderEntries] = group.entries;

            return (
              <section
                key={group.taskId}
                className={styles.groupCard}
                aria-label={`Feedback for ${group.taskTitle}`}
              >
                <div className={styles.groupHeader}>
                  <h4 className={styles.taskTitle}>{group.taskTitle}</h4>
                  <span className={styles.cycleCount}>
                    {group.entries.length} review {group.entries.length === 1 ? 'round' : 'rounds'}
                  </span>
                </div>

                <div className={styles.entryList}>
                  {/* Latest review shown prominently */}
                  <div className={`${styles.entryCard} ${styles.latestEntry}`}>
                    <div className={styles.entryTop}>
                      <div className={styles.entryMeta}>
                        <span className={styles.reviewerName}>{latestEntry.adminName}</span>
                        {latestEntry.submissionNo > 0 && (
                          <span className={styles.attemptTag}>
                            Attempt #{latestEntry.submissionNo}
                          </span>
                        )}
                        <span className={styles.timestamp}>
                          {formatIstDateTime(latestEntry.reviewedAt)}
                        </span>
                      </div>

                      <span
                        className={`${styles.decisionBadge} ${
                          latestEntry.decision === 'rework'
                            ? styles.decisionRework
                            : styles.decisionApproved
                        }`}
                      >
                        {latestEntry.decision}
                      </span>
                    </div>

                    <div className={styles.feedbackBox}>{latestEntry.feedback}</div>
                  </div>

                  {/* Older reviews expandable */}
                  {olderEntries.length > 0 && isExpanded && (
                    <>
                      {olderEntries.map((entry) => (
                        <div key={entry.id} className={`${styles.entryCard} ${styles.olderEntry}`}>
                          <div className={styles.entryTop}>
                            <div className={styles.entryMeta}>
                              <span className={styles.reviewerName}>{entry.adminName}</span>
                              {entry.submissionNo > 0 && (
                                <span className={styles.attemptTag}>
                                  Attempt #{entry.submissionNo}
                                </span>
                              )}
                              <span className={styles.timestamp}>
                                {formatIstDateTime(entry.reviewedAt)}
                              </span>
                            </div>

                            <span
                              className={`${styles.decisionBadge} ${
                                entry.decision === 'rework'
                                  ? styles.decisionRework
                                  : styles.decisionApproved
                              }`}
                            >
                              {entry.decision}
                            </span>
                          </div>

                          <div className={styles.feedbackBox}>{entry.feedback}</div>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {olderEntries.length > 0 && (
                  <button
                    type="button"
                    className={styles.olderToggleBtn}
                    onClick={() => toggleExpand(group.taskId)}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp size={14} aria-hidden="true" />
                        <span>Hide older feedback ({olderEntries.length})</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown size={14} aria-hidden="true" />
                        <span>Inspect older feedback ({olderEntries.length})</span>
                      </>
                    )}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        /* Flat chronological timeline view */
        <div className={styles.timeline}>
          {sortedFeedback.map((entry) => (
            <div key={entry.id} className={styles.groupCard}>
              <div className={styles.groupHeader}>
                <h4 className={styles.taskTitle}>{entry.taskTitle}</h4>
                <span
                  className={`${styles.decisionBadge} ${
                    entry.decision === 'rework' ? styles.decisionRework : styles.decisionApproved
                  }`}
                >
                  {entry.decision}
                </span>
              </div>

              <div className={styles.entryCard}>
                <div className={styles.entryTop}>
                  <div className={styles.entryMeta}>
                    <span className={styles.reviewerName}>{entry.adminName}</span>
                    {entry.submissionNo > 0 && (
                      <span className={styles.attemptTag}>Attempt #{entry.submissionNo}</span>
                    )}
                    <span className={styles.timestamp}>{formatIstDateTime(entry.reviewedAt)}</span>
                  </div>
                </div>

                <div className={styles.feedbackBox}>{entry.feedback}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
