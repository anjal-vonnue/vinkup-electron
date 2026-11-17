import type { AdminTaskRow, AdminTraineeDetail } from '@itp/types';
import { formatIstDateTime } from '../../lib/formatDateTime';
import {
  TASK_REVIEW_FILTERS,
  TASK_REVIEW_LABELS,
  countTasksByReviewState,
  getTaskReviewState,
  type TaskReviewFilter,
} from '../../lib/taskReview';
import styles from './AdminTaskList.module.css';

type AdminTaskListProps = {
  tasks: AdminTaskRow[];
  courses: AdminTraineeDetail['courses'];
  /** The task whose code is open in the viewer, if any. */
  selectedTaskId: string | null;
  onViewCode: (taskId: string) => void;
  /** Which review state to show. Kept by the page, so it survives a reload after a review. */
  filter: TaskReviewFilter;
  onFilterChange: (filter: TaskReviewFilter) => void;
};

/** Shown when a filter has no tasks. */
const EMPTY_MESSAGES: Record<TaskReviewFilter, string> = {
  all: 'No completed tasks yet.',
  pending: 'No tasks waiting for review.',
  approved: 'No approved tasks yet.',
  rework: 'No tasks sent back for rework.',
  in_progress: 'No tasks in progress.',
};

function describeProgress(task: AdminTaskRow): string {
  const attempt = task.submissionCount > 1 ? ` (Attempt #${task.submissionCount})` : '';
  if (task.lastSubmittedAt) {
    return `Submitted ${formatIstDateTime(task.lastSubmittedAt)}${attempt}`;
  }
  return task.status === 'completed' ? 'Submitted' : 'Not submitted yet';
}

/** The tasks the trainee has started, grouped by course and day, with a review-status filter. */
export default function AdminTaskList({
  tasks,
  courses,
  selectedTaskId,
  onViewCode,
  filter,
  onFilterChange,
}: AdminTaskListProps) {
  const counts = countTasksByReviewState(tasks);

  // Only the tasks that match the chosen filter.
  const shownTasks =
    filter === 'all' ? tasks : tasks.filter((task) => getTaskReviewState(task) === filter);

  const tasksByDay = new Map<string, AdminTaskRow[]>();
  for (const task of shownTasks) {
    const list = tasksByDay.get(task.dayId) ?? [];
    list.push(task);
    tasksByDay.set(task.dayId, list);
  }

  const visibleCourses = courses
    .map((course) => ({
      ...course,
      days: course.days.filter((day) => (tasksByDay.get(day.id) ?? []).length > 0),
    }))
    .filter((course) => course.days.length > 0);

  return (
    <div className={styles.list}>
      {tasks.length > 0 && (
        <div className={styles.filters} role="group" aria-label="Filter tasks by review status">
          {TASK_REVIEW_FILTERS.map((item) => {
            const label = item === 'all' ? 'All' : TASK_REVIEW_LABELS[item];

            return (
              <button
                key={item}
                type="button"
                className={styles.filter}
                aria-label={`${label} (${counts[item]})`}
                aria-pressed={filter === item}
                onClick={() => onFilterChange(item)}
              >
                {label}
                <span className={styles.filterCount}>{counts[item]}</span>
              </button>
            );
          })}
        </div>
      )}

      {visibleCourses.length === 0 && <p className={styles.empty}>{EMPTY_MESSAGES[filter]}</p>}

      {visibleCourses.map((course) => (
        <section key={course.id} aria-label={`${course.title} tasks`}>
          <h3 className={styles.courseTitle}>{course.title}</h3>

          {course.days.map((day) => {
            const dayTasks = tasksByDay.get(day.id) ?? [];
            // A filter opens every day, so no matching task is hidden in a closed day.
            const isOpen =
              filter !== 'all' || dayTasks.some((task) => task.taskId === selectedTaskId);

            return (
              <details key={day.id} className={styles.day} open={isOpen}>
                <summary className={styles.summary}>
                  <span className={styles.dayTitle}>
                    Day {day.dayNumber} · {day.title}
                  </span>
                </summary>

                <ul className={styles.tasks}>
                  {dayTasks.map((task) => {
                    const state = getTaskReviewState(task);
                    const viewLabel = state === 'in_progress' ? 'View draft' : 'View code';

                    return (
                      <li key={task.taskId} className={styles.task}>
                        <div className={styles.taskMain}>
                          <span className={styles.taskTitle}>{task.title}</span>
                          {task.isStretchGoal && <span className={styles.stretch}>Stretch</span>}
                        </div>

                        <span className={`${styles.status} ${styles[state]}`}>
                          {TASK_REVIEW_LABELS[state]}
                        </span>

                        <span className={styles.progress}>{describeProgress(task)}</span>

                        {/* Not submitted yet: the mentor can still look, but it is only a draft. */}
                        <button
                          type="button"
                          className={styles.view}
                          aria-label={`${viewLabel} for ${task.title}`}
                          aria-pressed={task.taskId === selectedTaskId}
                          onClick={() => onViewCode(task.taskId)}
                        >
                          {viewLabel}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </section>
      ))}
    </div>
  );
}
