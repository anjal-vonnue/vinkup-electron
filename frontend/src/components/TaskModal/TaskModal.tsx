import { useEffect, useState } from 'react';
import type { DayTask } from '@itp/types';
import TaskFeedbackModal from '../TaskFeedbackModal';
import styles from './TaskModal.module.css';

type TaskModalProps = {
  courseTitle: string;
  isOpen: boolean;
  dayNumber: number;
  tasks: DayTask[];
  onClose: () => void;
  onSelectTask: (task: DayTask) => void;
};

export default function TaskModal({
  courseTitle,
  isOpen,
  dayNumber,
  tasks,
  onClose,
  onSelectTask,
}: TaskModalProps) {
  const [feedbackTask, setFeedbackTask] = useState<DayTask | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Global keypress hook listener for Escape key actions
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function getTaskStatusTag(task: DayTask) {
    if (task.status === 'completed') {
      if (task.reviewStatus === 'approved') {
        return { label: 'Approved', className: styles.approved, isRework: false };
      }
      if (task.reviewStatus === 'rework') {
        return { label: 'Rework', className: styles.rework, isRework: true };
      }
      return { label: 'Completed', className: styles.completed, isRework: false };
    }
    if (task.status === 'in_progress') {
      return { label: 'In progress', className: styles.in_progress, isRework: false };
    }
    return { label: 'Not started', className: styles.not_started, isRework: false };
  }

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
      >
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <p className={styles.eyebrow}>
              {' '}
              {courseTitle}-DAY {String(dayNumber).padStart(2, '0')}
            </p>

            <h2 id="task-modal-title" className={styles.title}>
              Day Tasks
            </h2>

            <p className={styles.subtitle}>Select a task to open its workspace.</p>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close tasks modal"
          >
            &times;
          </button>
        </header>

        <div className={styles.taskList}>
          {tasks.length === 0 ? (
            <p className={styles.emptyMessage}>No tasks are available for this day.</p>
          ) : (
            tasks.map((task) => {
              const tag = getTaskStatusTag(task);

              return (
                <button
                  key={task.id}
                  type="button"
                  className={styles.taskItem}
                  onClick={() => onSelectTask(task)}
                >
                  <span className={styles.taskNumber}>
                    {String(task.sequenceOrder).padStart(2, '0')}
                  </span>

                  <span className={styles.taskInfo}>
                    <span className={styles.taskTitle}>{task.title}</span>

                    <span className={styles.taskMeta}>
                      {tag.isRework ? (
                        <span
                          role="button"
                          tabIndex={0}
                          className={`${styles.status} ${tag.className} ${styles.clickableStatus}`}
                          title="Modifications requested. Click to view feedback."
                          onClick={(e) => {
                            e.stopPropagation();
                            setFeedbackTask(task);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation();
                              e.preventDefault();
                              setFeedbackTask(task);
                            }
                          }}
                        >
                          {tag.label}
                        </span>
                      ) : (
                        <span className={`${styles.status} ${tag.className}`}>{tag.label}</span>
                      )}

                      {task.isStretchGoal && (
                        <span className={styles.stretchBadge}>Stretch goal</span>
                      )}
                    </span>
                  </span>

                  <span className={styles.arrow} aria-hidden="true">
                    &rarr;
                  </span>
                </button>
              );
            })
          )}
        </div>

        <footer className={styles.footer}>
          <span className={styles.taskCount}>
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
          </span>
        </footer>
      </section>

      {feedbackTask && (
        <TaskFeedbackModal
          isOpen={feedbackTask !== null}
          onClose={() => setFeedbackTask(null)}
          taskId={feedbackTask.id}
          taskTitle={feedbackTask.title}
          onOpenEditor={() => {
            onClose();
            onSelectTask(feedbackTask);
          }}
        />
      )}
    </div>
  );
}
