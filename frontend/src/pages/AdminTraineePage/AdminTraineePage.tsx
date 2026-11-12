import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, UserX } from 'lucide-react';
import { getAdminFlags, getAdminTaskCode, getAdminTrainee } from '../../api/admin';
import AdminHeader from '../../components/AdminHeader';
import AdminCodePanel from '../../components/AdminCodePanel';
import AdminDayGrid from '../../components/AdminDayGrid';
import AdminFlagTable from '../../components/AdminFlagTable';
import AdminJournalList from '../../components/AdminJournalList';
import AdminTaskList from '../../components/AdminTaskList';
import DailyActivityTable from '../../components/DailyActivityTable';
import LoaderOverlay from '../../components/Common/LoadingState';
import { ErrorState } from '../../components/Common/ErrorState';
import ProfileHeader from '../../components/ProfileHeader';
import StateMessage from '../../components/StateMessage';
import StatsSummary from '../../components/StatsSummary';
import PrintReport from '../../components/PrintReport';
import PrintReportButton from '../../components/PrintReportButton';
import { useAuth } from '../../context/Useauth';
import { usePrintMode } from '../../hooks/usePrintMode';
import { DEFAULT_PRINT_OPTIONS, reportDocumentTitle } from '../../lib/printReport';
import { useAdminResource } from './hooks/useAdminResource';
import styles from './AdminTraineePage.module.css';

type TabId = 'tasks' | 'journal' | 'flags';

export default function AdminTraineePage() {
  const { traineeId = '' } = useParams();

  return <TraineeDetail key={traineeId} traineeId={traineeId} />;
}

function BackLink() {
  return (
    <Link to="/admin" className={styles.back}>
      <ArrowLeft size={16} aria-hidden="true" />
      Back to trainees
    </Link>
  );
}

function TraineeDetail({ traineeId }: { traineeId: string }) {
  const [activeTab, setActiveTab] = useState<TabId>('tasks');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const loadDetail = useMemo(
    () => (traineeId ? () => getAdminTrainee(traineeId) : null),
    [traineeId]
  );

  const loadFlags = useMemo(() => (traineeId ? () => getAdminFlags(traineeId) : null), [traineeId]);

  const loadCode = useMemo(
    () => (traineeId && selectedTaskId ? () => getAdminTaskCode(traineeId, selectedTaskId) : null),
    [traineeId, selectedTaskId]
  );

  const detail = useAdminResource(loadDetail);
  const flags = useAdminResource(loadFlags);
  const code = useAdminResource(loadCode);

  const handleCloseCode = useCallback(() => setSelectedTaskId(null), []);

  const { user } = useAuth();

  const { printJob, print } = usePrintMode({
    defaults: DEFAULT_PRINT_OPTIONS,
    documentTitle: reportDocumentTitle(detail.data?.profile.trainee.name ?? 'Trainee'),
  });

  const dayLabels = useMemo(() => {
    const labels = new Map<string, string>();

    for (const course of detail.data?.courses ?? []) {
      for (const day of course.days) {
        labels.set(day.id, `${course.title} · Day ${day.dayNumber}`);
      }
    }

    return labels;
  }, [detail.data]);

  if (detail.isLoading) {
    return (
      <>
        <AdminHeader />
        <main className={`${styles.page} ${styles.state}`}>
          <LoaderOverlay label="Loading trainee…" />
        </main>
      </>
    );
  }

  if (!detail.data) {
    const error = detail.error;

    const isNotFound =
      !traineeId || error?.code === 'NOT_FOUND' || error?.code === 'VALIDATION_FAILED';

    return (
      <>
        <AdminHeader />
        <main className={styles.page}>
          {isNotFound ? (
            <StateMessage
              icon={<UserX size={24} />}
              title="Trainee not found"
              description="This trainee doesn't exist, or the link is wrong."
              actionLabel="Back to trainees"
              actionHref="/admin"
            />
          ) : (
            <>
              <BackLink />
              <ErrorState
                title={
                  error?.code === 'FORBIDDEN' ? 'Admin access required' : 'Unable to load trainee'
                }
                message={error?.message ?? ''}
                onRetry={error?.code === 'FORBIDDEN' ? undefined : detail.retry}
              />
            </>
          )}
        </main>
      </>
    );
  }

  const { profile, typingStats, courses, totalTasks, journal, tasks } = detail.data;

  const selectedTask = tasks.find((task) => task.taskId === selectedTaskId);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'tasks', label: `Tasks (${tasks.length}/${totalTasks})` },
    { id: 'journal', label: `Journal (${journal.length})` },
    {
      id: 'flags',
      label: `Flags (${flags.data ? flags.data.filter((flag) => flag.reviewPriority !== 'LOW').length : '…'})`,
    },
  ];

  return (
    <>
      <div className={styles.screenOnly}>
        <AdminHeader />

        <main className={styles.page}>
          <div className={styles.topBar}>
            <BackLink />
            <PrintReportButton onPrint={print} />
          </div>

          <ProfileHeader trainee={profile.trainee} />

          <section className={styles.card} aria-label="Progress and activity">
            <StatsSummary total={profile.total} typingStats={typingStats} />

            <DailyActivityTable days={profile.dailyActivity} />
          </section>

          <AdminDayGrid courses={courses} />

          <div className={styles.tabs} role="tablist" aria-label="Trainee details">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id={`panel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
            className={styles.panel}
          >
            {activeTab === 'tasks' && (
              <>
                {selectedTaskId && (
                  <AdminCodePanel
                    traineeId={traineeId}
                    taskTitle={selectedTask?.title ?? 'Task code'}
                    code={code.data}
                    isLoading={code.isLoading}
                    error={code.error}
                    onRetry={code.retry}
                    onClose={handleCloseCode}
                  />
                )}

                <AdminTaskList
                  tasks={tasks}
                  courses={courses}
                  selectedTaskId={selectedTaskId}
                  onViewCode={setSelectedTaskId}
                />
              </>
            )}

            {activeTab === 'journal' && <AdminJournalList entries={journal} />}

            {activeTab === 'flags' && (
              <>
                {flags.isLoading && (
                  <div className={styles.state}>
                    <LoaderOverlay label="Loading flags…" />
                  </div>
                )}

                {flags.error && (
                  <ErrorState
                    title="Unable to load flags"
                    message={flags.error.message}
                    onRetry={flags.retry}
                  />
                )}

                {flags.data && <AdminFlagTable flags={flags.data} dayLabels={dayLabels} />}
              </>
            )}
          </div>
        </main>
      </div>

      {printJob && (
        <PrintReport
          detail={detail.data}
          flags={flags.data}
          dayLabels={dayLabels}
          options={printJob.options}
          mentorName={user?.name ?? null}
          generatedAt={printJob.startedAt}
        />
      )}
    </>
  );
}
