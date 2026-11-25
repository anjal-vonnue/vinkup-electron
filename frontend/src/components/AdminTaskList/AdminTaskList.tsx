import { useId, useState } from 'react';
import { Download } from 'lucide-react';
import type { AdminTaskRow, AdminTraineeDetail } from '@itp/types';
import { getAdminTaskCode } from '../../api/admin';
import { createTasksZip, downloadBlob, safeZipName } from '../../lib/adminTaskZip';
import { formatIstDateTime } from '../../lib/formatDateTime';
import {
  TASK_REVIEW_FILTERS,
  TASK_REVIEW_LABELS,
  countTasksByReviewState,
  getTaskReviewState,
  type TaskReviewFilter,
} from '../../lib/taskReview';
import styles from './AdminTaskList.module.css';
import dialogStyles from './TaskZipDialog.module.css';

type AdminTaskListProps = {
  tasks: AdminTaskRow[];
  courses: AdminTraineeDetail['courses'];
  /** The task whose code is open in the viewer, if any. */
  selectedTaskId: string | null;
  onViewCode: (taskId: string) => void;
  /** Which review state to show. Kept by the page, so it survives a reload after a review. */
  filter: TaskReviewFilter;
  onFilterChange: (filter: TaskReviewFilter) => void;
  onAnalyzeWithAi?: () => void;
  aiEligibleCount?: number;
  traineeId?: string;
  traineeName?: string;
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
  onAnalyzeWithAi,
  aiEligibleCount = 0,
  traineeId = '',
  traineeName = 'trainee',
}: AdminTaskListProps) {
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [downloadScope, setDownloadScope] = useState<'task' | 'course' | 'day' | 'all'>('all');
  const [downloadFilters, setDownloadFilters] = useState<TaskReviewFilter[]>(['all']);
  const [downloadTaskId, setDownloadTaskId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [dayId, setDayId] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const dialogTitleId = useId();
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

  const eligibleTasks = tasks.filter(
    (task) =>
      task.codeUpdatedAt !== null || task.submissionCount > 0 || task.lastSubmittedAt !== null
  );
  const selectedCourse = courses.find((course) => course.id === courseId) ?? courses[0];
  const selectedDayId = selectedCourse?.days.some((day) => day.id === dayId)
    ? dayId
    : (selectedCourse?.days[0]?.id ?? '');
  const scopedTasks = eligibleTasks.filter((task) => {
    if (!downloadFilters.includes('all') && !downloadFilters.includes(getTaskReviewState(task)))
      return false;
    if (downloadScope === 'task') return task.taskId === downloadTaskId;
    if (downloadScope === 'course')
      return task.dayId && selectedCourse?.days.some((day) => day.id === task.dayId);
    if (downloadScope === 'day') return task.dayId === selectedDayId;
    return true;
  });
  const handleDownload = async () => {
    if (!scopedTasks.length || isDownloading) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const rows = await Promise.all(
        scopedTasks.map(async (task) => {
          const course = courses.find((item) => item.days.some((day) => day.id === task.dayId));
          const day = course?.days.find((item) => item.id === task.dayId);
          const code = await getAdminTaskCode(traineeId, task.taskId);
          // A submission is eligible even if the trainee submitted without separately saving.
          if (code.isStarterCode && task.submissionCount === 0) return null;
          return {
            path: `${safeZipName(course?.title ?? 'Course')}/Day ${day?.dayNumber ?? 0} - ${safeZipName(day?.title ?? 'Day')}/Task ${code.sequenceOrder} - ${safeZipName(task.title)}`,
            files: code.files,
            instructionsMarkdown: code.instructionsMarkdown,
            sequenceOrder: code.sequenceOrder,
            title: code.title,
          };
        })
      );
      const included = rows.filter((row): row is NonNullable<typeof row> => row !== null);
      if (!included.length) {
        setDownloadError('No saved or submitted task code is available in this selection.');
        return;
      }
      const filename =
        downloadScope === 'task'
          ? `${safeZipName(traineeName)}-Task ${included[0].sequenceOrder} - ${safeZipName(included[0].title)}.zip`
          : `${safeZipName(traineeName)}-tasks.zip`;
      downloadBlob(createTasksZip(included), filename);
      setIsDownloadOpen(false);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Unable to download task code.');
    } finally {
      setIsDownloading(false);
    }
  };

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
          <button
            type="button"
            className={`${styles.filter} ${styles.download}`}
            onClick={() => {
              setDownloadError(null);
              setDownloadFilters([filter]);
              setDownloadScope('all');
              setIsDownloadOpen(true);
            }}
            disabled={eligibleTasks.length === 0}
          >
            <Download size={14} aria-hidden="true" /> Download tasks
          </button>
          {onAnalyzeWithAi && (
            <button
              type="button"
              className={`${styles.filter} ${styles.download} ${styles.analyze}`}
              onClick={onAnalyzeWithAi}
              disabled={aiEligibleCount === 0}
              title={
                aiEligibleCount === 0 ? 'There are no submitted tasks awaiting review.' : undefined
              }
            >
              Analyze with AI
              {aiEligibleCount > 0 && <span className={styles.filterCount}>{aiEligibleCount}</span>}
            </button>
          )}
        </div>
      )}

      {isDownloadOpen && (
        <div
          className={dialogStyles.backdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isDownloading) setIsDownloadOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className={dialogStyles.dialog}
          >
            <h2 id={dialogTitleId}>Download task code</h2>
            <p>Only tasks with saved or submitted trainee code are included.</p>
            <label>
              Scope
              <select
                value={downloadScope}
                disabled={isDownloading}
                onChange={(event) => setDownloadScope(event.target.value as typeof downloadScope)}
              >
                <option value="task">Single task</option>
                <option value="course">A course</option>
                <option value="day">A day</option>
                <option value="all">All tasks</option>
              </select>
            </label>
            <fieldset className={dialogStyles.statusOptions} disabled={isDownloading}>
              <legend>Review statuses</legend>
              {TASK_REVIEW_FILTERS.map((item) => (
                <label key={item}>
                  <input
                    type="checkbox"
                    checked={downloadFilters.includes(item)}
                    onChange={(event) => {
                      setDownloadFilters((selected) => {
                        if (item === 'all') return event.target.checked ? ['all'] : [];
                        const withoutAll = selected.filter((status) => status !== 'all');
                        const next = event.target.checked
                          ? [...withoutAll, item]
                          : withoutAll.filter((status) => status !== item);
                        return next.length ? next : ['all'];
                      });
                    }}
                  />
                  {item === 'all' ? 'All statuses' : TASK_REVIEW_LABELS[item]}
                </label>
              ))}
            </fieldset>
            {(downloadScope === 'task' ||
              downloadScope === 'course' ||
              downloadScope === 'day') && (
              <label>
                Course
                <select
                  value={selectedCourse?.id ?? ''}
                  disabled={isDownloading}
                  onChange={(event) => {
                    setCourseId(event.target.value);
                    setDayId('');
                    setDownloadTaskId('');
                  }}
                >
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(downloadScope === 'task' || downloadScope === 'day') && selectedCourse && (
              <label>
                Day
                <select
                  value={selectedDayId}
                  disabled={isDownloading}
                  onChange={(event) => {
                    setDayId(event.target.value);
                    setDownloadTaskId('');
                  }}
                >
                  {selectedCourse.days.map((day) => (
                    <option key={day.id} value={day.id}>
                      Day {day.dayNumber} · {day.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {downloadScope === 'task' && (
              <label>
                Task
                <select
                  value={downloadTaskId}
                  disabled={isDownloading}
                  onChange={(event) => setDownloadTaskId(event.target.value)}
                >
                  <option value="">Choose a task</option>
                  {eligibleTasks
                    .filter(
                      (task) =>
                        task.dayId === selectedDayId &&
                        (downloadFilters.includes('all') ||
                          downloadFilters.includes(getTaskReviewState(task)))
                    )
                    .map((task) => (
                      <option key={task.taskId} value={task.taskId}>
                        Task {task.sequenceOrder} · {task.title}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {downloadError && (
              <p role="alert" className={dialogStyles.error}>
                {downloadError}
              </p>
            )}
            <div className={dialogStyles.actions}>
              <button
                type="button"
                disabled={isDownloading}
                onClick={() => setIsDownloadOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDownloading || scopedTasks.length === 0}
                onClick={() => void handleDownload()}
              >
                {isDownloading ? 'Preparing ZIP…' : `Download ZIP (${scopedTasks.length})`}
              </button>
            </div>
          </section>
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
                          <span className={styles.taskTitle}>
                            Task {task.sequenceOrder} · {task.title}
                          </span>
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
