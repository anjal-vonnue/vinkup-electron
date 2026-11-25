import { useEffect, type ReactNode } from 'react';
import { useParams, Link } from 'react-router';
import { Lock } from 'lucide-react';
import Header from '../../components/Header';
import TaskBreadcrumb from '../../components/TaskBreadcrumb';
import TaskPageSkeleton from '../../components/TaskPageSkeleton';
import TaskWorkspace from '../../components/TaskWorkspace';
import { useTaskData } from './hooks/useTaskData';
import { EditorProvider } from './state/EditorContext';
import { WorkspaceProvider } from './state/WorkspaceContext';
import { RunnerProvider } from '../../runtimes/runnerContext';
import { useWorkspaceSession } from '../../context/WorkspaceSessionContext';
import styles from './TaskPage.module.css';

type TaskData = ReturnType<typeof useTaskData>;

type MessageScreenProps = {
  icon: ReactNode;
  isError?: boolean;
  title: string;
  text: string;
  action: ReactNode;
};

function MessageScreen({ icon, isError = false, title, text, action }: MessageScreenProps) {
  const iconClass = isError
    ? `${styles.messageIcon} ${styles.messageIconError}`
    : styles.messageIcon;

  return (
    <div className={styles.messageScreen} role="alert">
      <div className={styles.messageCard}>
        <div className={iconClass} aria-hidden="true">
          {icon}
        </div>
        <h1 className={styles.messageTitle}>{title}</h1>
        <p className={styles.messageText}>{text}</p>
        {action}
      </div>
    </div>
  );
}

function DashboardLink() {
  return (
    <Link className={styles.messageLink} to="/">
      Back to dashboard
    </Link>
  );
}

type TaskPageBodyProps = {
  data: TaskData;
};

function TaskPageBody({ data }: TaskPageBodyProps) {
  const { restoreWorkspace } = useWorkspaceSession();

  if (data.status === 'loading') {
    return <TaskPageSkeleton />;
  }

  if (data.status === 'error') {
    switch (data.error.code) {
      case 'DAY_LOCKED':
        return (
          <MessageScreen
            icon={<Lock size={20} />}
            title="This day is locked"
            text="Finish the previous day to unlock this task."
            action={<DashboardLink />}
          />
        );

      case 'NOT_FOUND':
        return (
          <MessageScreen
            icon="404"
            title="Task not found"
            text="The task you're looking for doesn't exist or is no longer available."
            action={<DashboardLink />}
          />
        );

      default:
        return (
          <MessageScreen
            icon="!"
            isError
            title="Something went wrong"
            text={data.error.message}
            action={
              <button type="button" className={styles.messageAction} onClick={data.reload}>
                Retry
              </button>
            }
          />
        );
    }
  }

  return (
    <WorkspaceProvider
      key={data.task.id}
      taskId={data.task.id}
      code={data.code}
      initialState={restoreWorkspace(data.task.id) ?? undefined}
    >
      <EditorProvider>
        <RunnerProvider>
          <TaskWorkspace task={data.task} />
        </RunnerProvider>
      </EditorProvider>
    </WorkspaceProvider>
  );
}

export default function TaskPage() {
  const { taskId } = useParams();
  const data = useTaskData(taskId);
  const { activeTaskId, exitWorkspace } = useWorkspaceSession();

  // A stale session for a task that cannot be opened would redirect Home in a loop.
  useEffect(() => {
    if (data.status === 'error' && taskId && activeTaskId === taskId) exitWorkspace();
  }, [data.status, taskId, activeTaskId, exitWorkspace]);

  const pageTitle =
    data.status === 'success' ? `${data.task.title} · Task ${data.task.sequenceOrder}` : null;

  useEffect(() => {
    if (!pageTitle) return;
    const previousTitle = document.title;
    document.title = pageTitle;
    return () => {
      document.title = previousTitle;
    };
  }, [pageTitle]);

  const breadcrumb =
    data.status === 'success' ? (
      <TaskBreadcrumb
        courseTitle={data.task.day.courseTitle}
        dayId={data.task.day.id}
        dayNumber={data.task.day.dayNumber}
        taskNumber={data.task.sequenceOrder}
        onNavigateAway={exitWorkspace}
      />
    ) : undefined;

  return (
    <div className={styles.page}>
      <Header leading={breadcrumb} />
      <div className={styles.body}>
        <TaskPageBody data={data} />
      </div>
    </div>
  );
}
