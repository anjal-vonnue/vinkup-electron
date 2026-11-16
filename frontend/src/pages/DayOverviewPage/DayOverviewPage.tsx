import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowRight } from 'lucide-react';
import type { DayTask, DayContent, DayCurrentStatus, DayIntegrityResponse } from '@itp/types';
import {
  getDayTasks,
  getDayStatus,
  getDayJournal,
  saveJournal,
  completeDay,
  getDayIntegrity,
} from '../../api/days';
import { getCourseDays } from '../../api/courses';
import { mockDayContents } from '../../api/dayOverview';
import DaySummary from '../../components/DaySummary/DaySummary';
import LearningObjectives from '../../components/LearningObjectives/LearningObjectives';
import SelfCheckChecklist from '../../components/SelfCheckChecklist';
import DailyJournal from '../../components/DailyJournal';
import DayCompletion from '../../components/DayCompletion/DayCompletion';
import Header from '../../components/Header';
import DayBreadcrumb from '../../components/DayBreadcrumb/DayBreadcrumb';
import TaskFeedbackModal from '../../components/TaskFeedbackModal';
import styles from './DayOverviewPage.module.css';
import StateMessage from '../../components/StateMessage';
import { ApiError } from '../../api/errors';
import Loader from '../../components/Common/LoadingState';
import DayCelebration from '../../components/DayCelebration/DayCelebration';
import DayIntegrityBadge from '../../components/DayIntegrityBadge/DayIntegrityBadge';
import HelpButton from '../../components/HelpButton';

type LoadResult =
  | { dayId: string; tasks: DayTask[]; status: DayCurrentStatus; journalResponse: string }
  | { dayId: string; error: ApiError };

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

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

function DayTasks({
  courseTitle,
  dayNumber,
  tasks,
  completedTasks,
  requiredTasks,
  onSelectTask,
  onOpenFeedback,
  integrity,
  isIntegrityLoading,
  hasIntegrityError,
}: {
  courseTitle: string;
  dayNumber: number;
  tasks: DayTask[];
  completedTasks: number;
  requiredTasks: number;
  onSelectTask: (task: DayTask) => void;
  onOpenFeedback: (task: DayTask) => void;
  integrity: DayIntegrityResponse | null;
  isIntegrityLoading: boolean;
  hasIntegrityError: boolean;
}) {
  return (
    <section className={styles.tasks} aria-labelledby="day-tasks-title">
      <header className={styles.tasksHeader}>
        <div>
          <div className={styles.tasksEyebrow}>
            <span className={styles.tasksCourse}>
              {courseTitle.toUpperCase()}-DAY {String(dayNumber).padStart(2, '0')}
            </span>
            <span>
              {requiredTasks} {requiredTasks === 1 ? 'task' : 'tasks'}
            </span>
          </div>
          <h2 id="day-tasks-title" className={styles.tasksTitle}>
            Day Tasks
          </h2>
          <p className={styles.tasksDescription}>Select a task to open its workspace.</p>
        </div>
        <div className={styles.tasksSide}>
          <DayIntegrityBadge
            integrity={integrity}
            isLoading={isIntegrityLoading}
            hasError={hasIntegrityError}
          />
          <p className={styles.tasksProgress}>
            {completedTasks} of {requiredTasks} completed
          </p>
        </div>
      </header>

      {tasks.length === 0 ? (
        <p className={styles.emptyTasks}>No tasks are available for this day.</p>
      ) : (
        <div className={styles.taskList}>
          {tasks.map((task) => {
            const tag = getTaskStatusTag(task);

            return (
              <button
                key={task.id}
                type="button"
                className={`${styles.taskItem} ${task.isStretchGoal ? styles.stretchTaskItem : ''}`}
                onClick={() => onSelectTask(task)}
              >
                {!task.isStretchGoal && (
                  <span className={styles.taskNumber}>
                    {String(task.sequenceOrder).padStart(2, '0')}
                  </span>
                )}
                <span className={styles.taskInfo}>
                  <span className={styles.taskTitle}>{task.title}</span>
                  <span className={styles.taskMeta}>
                    {tag.isRework ? (
                      <span
                        role="button"
                        tabIndex={0}
                        className={`${styles.taskStatus} ${tag.className} ${styles.clickableStatus}`}
                        title="Modifications requested. Click to view feedback."
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenFeedback(task);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                            e.preventDefault();
                            onOpenFeedback(task);
                          }
                        }}
                      >
                        {tag.label}
                      </span>
                    ) : (
                      <span className={`${styles.taskStatus} ${tag.className}`}>{tag.label}</span>
                    )}
                    {task.isStretchGoal && (
                      <span className={styles.stretchBadge}>Stretch goal</span>
                    )}
                  </span>
                </span>
                <span className={styles.taskArrow} aria-hidden="true">
                  <ArrowRight size={20} strokeWidth={2} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * `key={dayId}` remounts the content when the day changes, so saved/error/submitting
 * state from one day can never leak into another.
 */
export default function DayOverviewPage() {
  const { dayId } = useParams();
  return <DayOverviewContent key={dayId} />;
}

function DayOverviewContent() {
  const [isJournalSaved, setIsJournalSaved] = useState(false);
  const [isSavingJournal, setIsSavingJournal] = useState(false);
  const [isCompletingDay, setIsCompletingDay] = useState(false);
  const [showDayCelebration, setShowDayCelebration] = useState(false);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [feedbackTask, setFeedbackTask] = useState<DayTask | null>(null);
  const completionAttempted = useRef(false);

  // dayId is an opaque string. Never parse or build it here.
  const { dayId } = useParams();
  const navigate = useNavigate();

  // Static curriculum content. TODO: replace with an API call when a day endpoint exists.
  const day: DayContent | undefined = dayId ? mockDayContents[dayId] : undefined;
  const shouldLoad = Boolean(dayId && day);

  const [integrity, setIntegrity] = useState<DayIntegrityResponse | null>(null);
  const [integrityStatus, setIntegrityStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Hooks must run before any early return.
  useEffect(() => {
    if (!dayId || !shouldLoad) return;
    let isCancelled = false; // ignore late responses after navigating away

    Promise.all([
      getDayTasks(dayId),
      getDayStatus(dayId),
      // A journal failure is not fatal: the page still renders with an empty journal.
      getDayJournal(dayId).catch(() => ({ responseText: null })),
      getDayIntegrity(dayId).catch(() => null),
    ])
      .then(([tasks, status, journal, integrityData]) => {
        if (!isCancelled) {
          setResult({ dayId, tasks, status, journalResponse: journal.responseText ?? '' });
          if (integrityData) {
            setIntegrity(integrityData);
            setIntegrityStatus('ready');
          } else {
            setIntegrityStatus('error');
          }
        }
      })
      .catch((error: ApiError) => {
        if (!isCancelled) setResult({ dayId, error });
      });

    return () => {
      isCancelled = true;
    };
  }, [dayId, shouldLoad]);

  // Only trust a result that belongs to the current dayId.
  const current = result && result.dayId === dayId ? result : null;
  const error = current && 'error' in current ? current.error : null;
  const tasks = current && 'tasks' in current ? current.tasks : [];
  const status = current && 'status' in current ? current.status : null;
  const journalResponse = current && 'journalResponse' in current ? current.journalResponse : '';
  const isLoading = shouldLoad && current === null;

  if (!day || error?.code === 'NOT_FOUND') {
    return (
      <>
        <Header />
        <main className={styles.dayOverview}>
          <StateMessage
            icon="🔍"
            title="Day not found"
            description="We couldn't find the day you're looking for. It may have been moved, or the link you followed is incorrect."
            actionLabel="Back to Dashboard"
            actionHref="/"
          />
        </main>
      </>
    );
  }

  if (isLoading) {
    return <Loader />;
  }

  if (status?.isLocked || error?.code === 'DAY_LOCKED') {
    return (
      <>
        <Header />
        <main className={styles.dayOverview}>
          <StateMessage
            icon="🔒"
            title="This day is locked"
            description="Finish the previous day to unlock this one and keep going."
            actionLabel="Back to Dashboard"
            actionHref="/"
          />
        </main>
      </>
    );
  }

  if (error || !status) {
    return (
      <>
        <Header />
        <main className={styles.dayOverview}>
          <StateMessage
            icon="⚠️"
            title="Couldn't load this day"
            description="Something went wrong while loading your progress. Please try again."
            actionLabel="Back to Dashboard"
            actionHref="/"
          />
        </main>
      </>
    );
  }

  const completedTasks = tasks.filter(
    (task) => task.status === 'completed' && !task.isStretchGoal
  ).length;
  const requiredTasks = tasks.filter((task) => !task.isStretchGoal).length;

  async function handleSaveJournal(responseText: string) {
    if (!day) return;
    setJournalError(null);
    setIsSavingJournal(true);
    setIsJournalSaved(false);

    try {
      await saveJournal(day.dayId, responseText);
      setIsJournalSaved(true);
    } catch (err) {
      setJournalError(getErrorMessage(err, 'Failed to save journal response.'));
    } finally {
      setIsSavingJournal(false);
    }
  }

  async function handleCompleteDay() {
    if (!day || completionAttempted.current || status?.isCompleted) return;
    // State updates are asynchronous; the ref closes the rapid double-click window.
    completionAttempted.current = true;
    setCompletionError(null);
    setIsCompletingDay(true);

    try {
      // The server decides whether the day can be completed (rule 2).
      const updatedStatus = await completeDay(day.dayId);

      setResult((previous) => {
        if (!previous || 'error' in previous) return previous;
        return { ...previous, status: updatedStatus };
      });
      if (updatedStatus.isCompleted) {
        setShowDayCelebration(true);
      } else {
        completionAttempted.current = false;
      }
    } catch (err) {
      completionAttempted.current = false;
      setCompletionError(getErrorMessage(err, 'Failed to complete the day.'));
    } finally {
      setIsCompletingDay(false);
    }
  }

  async function handleNextDay() {
    if (!day) return;

    const { courseSlug, dayNumber } = day;

    try {
      const courseDays = await getCourseDays(courseSlug);
      const nextDay = courseDays.find((courseDay) => courseDay.dayNumber === dayNumber + 1);
      if (!nextDay) {
        setCompletionError('The next day could not be found. Please return to the dashboard.');
        return;
      }
      void navigate(`/days/${nextDay.id}`);
    } catch (err) {
      setCompletionError(getErrorMessage(err, 'Unable to open the next day. Please try again.'));
    }
  }

  return (
    <>
      <Header />

      <main className={styles.dayOverview}>
        {showDayCelebration && <DayCelebration onDismiss={() => setShowDayCelebration(false)} />}
        <DayBreadcrumb dayNumber={day.dayNumber} />

        <DaySummary
          courseTitle={day.courseTitle}
          dayNumber={day.dayNumber}
          totalDays={day.totalDays}
          title={day.title}
          description={day.subtitle}
          summary={day.lessonSummary}
          onReferences={() => void navigate(`/days/${day.dayId}/references`)}
        />

        <div className={styles.grid}>
          <div className={styles.left}>
            <DayTasks
              courseTitle={day.courseTitle}
              dayNumber={day.dayNumber}
              tasks={tasks}
              completedTasks={completedTasks}
              requiredTasks={requiredTasks}
              onSelectTask={(task) => void navigate(`/tasks/${task.id}`)}
              onOpenFeedback={(task) => setFeedbackTask(task)}
              integrity={integrity}
              isIntegrityLoading={integrityStatus === 'loading'}
              hasIntegrityError={integrityStatus === 'error'}
            />
            <LearningObjectives objectives={day.learningObjectives} />
          </div>

          <div className={styles.right}>
            <SelfCheckChecklist dayId={day.dayId} items={day.selfCheckItems} />

            <DailyJournal
              prompts={day.journalPrompt ? [day.journalPrompt] : []}
              initialResponse={journalResponse}
              isSaving={isSavingJournal}
              isSaved={isJournalSaved}
              onSave={(responseText) => void handleSaveJournal(responseText)}
            />
            {journalError && (
              <p className={styles.error} role="alert">
                {journalError}
              </p>
            )}
          </div>
        </div>

        <DayCompletion
          completedTasks={completedTasks}
          totalTasks={requiredTasks}
          isCompleted={status.isCompleted}
          isSubmitting={isCompletingDay}
          onComplete={handleCompleteDay}
          showNextDay={day.dayNumber < day.totalDays}
          onNextDay={handleNextDay}
        />
        {completionError && (
          <p className={styles.error} role="alert">
            {completionError}
          </p>
        )}

        {feedbackTask && (
          <TaskFeedbackModal
            isOpen={feedbackTask !== null}
            onClose={() => setFeedbackTask(null)}
            taskId={feedbackTask.id}
            taskTitle={feedbackTask.title}
            onOpenEditor={() => void navigate(`/tasks/${feedbackTask.id}`)}
          />
        )}
      </main>
      <HelpButton />
    </>
  );
}
