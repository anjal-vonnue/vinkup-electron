import type { AdminTaskRow, AdminTraineeDetail } from '@itp/types';
import { TASK_STATUS_LABELS } from '../../lib/adminLabels';
import { formatIstDateTime } from '../../lib/formatDateTime';
import styles from './AdminTaskList.module.css';

type AdminTaskListProps = {
  tasks: AdminTaskRow[];
  courses: AdminTraineeDetail['courses'];
  /** The task whose code is open in the viewer, if any. */
  selectedTaskId: string | null;
  onViewCode: (taskId: string) => void;
};

function describeProgress(task: AdminTaskRow): string {
  const attempt = task.submissionCount > 1 ? ` (Attempt #${task.submissionCount})` : '';
  return task.lastSubmittedAt
    ? `Submitted ${formatIstDateTime(task.lastSubmittedAt)}${attempt}`
    : 'Completed';
}

function getTaskStatusInfo(task: AdminTaskRow): { label: string; className: string } {
  if (task.status === 'completed') {
    if (task.reviewStatus === 'approved') {
      return { label: 'Approved', className: styles.approved };
    }
    if (task.reviewStatus === 'rework') {
      return { label: 'Rework', className: styles.rework };
    }
    return { label: 'Completed', className: styles.completed };
  }
  return {
    label: TASK_STATUS_LABELS[task.status],
    className: styles[task.status] ?? styles.not_started,
  };
}

/** The tasks the trainee has started, grouped by course and day. Days still in progress start open. */
export default function AdminTaskList({
  tasks,
  courses,
  selectedTaskId,
  onViewCode,
}: AdminTaskListProps) {
  const tasksByDay = new Map<string, AdminTaskRow[]>();
  for (const task of tasks) {
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

  if (visibleCourses.length === 0) {
    return <p className={styles.empty}>No completed tasks yet.</p>;
  }

  return (
    <div className={styles.list}>
      {visibleCourses.map((course) => (
        <section key={course.id} aria-label={`${course.title} tasks`}>
          <h3 className={styles.courseTitle}>{course.title}</h3>

          {course.days.map((day) => {
            const dayTasks = tasksByDay.get(day.id) ?? [];
            const isOpenByDefault = dayTasks.some((task) => task.taskId === selectedTaskId);

            return (
              <details key={day.id} className={styles.day} open={isOpenByDefault}>
                <summary className={styles.summary}>
                  <span className={styles.dayTitle}>
                    Day {day.dayNumber} · {day.title}
                  </span>
                </summary>

                <ul className={styles.tasks}>
                  {dayTasks.map((task) => (
                    <li key={task.taskId} className={styles.task}>
                      <div className={styles.taskMain}>
                        <span className={styles.taskTitle}>{task.title}</span>
                        {task.isStretchGoal && <span className={styles.stretch}>Stretch</span>}
                      </div>

                      <span className={`${styles.status} ${getTaskStatusInfo(task).className}`}>
                        {getTaskStatusInfo(task).label}
                      </span>

                      <span className={styles.progress}>{describeProgress(task)}</span>

                      <button
                        type="button"
                        className={styles.view}
                        aria-label={`View code for ${task.title}`}
                        aria-pressed={task.taskId === selectedTaskId}
                        onClick={() => onViewCode(task.taskId)}
                      >
                        View code
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </section>
      ))}
    </div>
  );
}
