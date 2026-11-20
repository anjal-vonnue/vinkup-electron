import { useCallback, useMemo, useState, useRef } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, UserX } from 'lucide-react';
import {
  getAdminFlags,
  getAdminTaskCode,
  getAdminTrainee,
  getAdminTraineeFeedback,
} from '../../api/admin';
import AdminHeader from '../../components/AdminHeader';
import AdminCodePanel from '../../components/AdminCodePanel';
import AdminDayGrid from '../../components/AdminDayGrid';
import AdminFeedbackList from '../../components/AdminFeedbackList';
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
import { useRealtimeEvent, useRealtimeRefresh } from '../../context/useRealtime';
import { usePrintMode } from '../../hooks/usePrintMode';
import {
  DEFAULT_PRINT_OPTIONS,
  reportDocumentTitle,
  type PrintReportOptions,
} from '../../lib/printReport';
import type { TaskReviewFilter } from '../../lib/taskReview';
import { useAdminResource } from './hooks/useAdminResource';
import styles from './AdminTraineePage.module.css';

type TabId = 'tasks' | 'journal' | 'flags' | 'feedbacks';

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
  // Kept here, not in AdminTaskList, so it survives the reload after Approve / Request rework.
  const [taskFilter, setTaskFilter] = useState<TaskReviewFilter>('all');
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isSavingPdf, setIsSavingPdf] = useState(false);

  const loadDetail = useMemo(
    () => (traineeId ? () => getAdminTrainee(traineeId) : null),
    [traineeId]
  );

  const loadFlags = useMemo(() => (traineeId ? () => getAdminFlags(traineeId) : null), [traineeId]);

  const loadCode = useMemo(
    () => (traineeId && selectedTaskId ? () => getAdminTaskCode(traineeId, selectedTaskId) : null),
    [traineeId, selectedTaskId]
  );
  const loadFeedback = useMemo(
    () => (traineeId ? () => getAdminTraineeFeedback(traineeId) : null),
    [traineeId]
  );

  // The flags and feedback load beside the detail, so a failure there doesn't hide the rest of the page.
  const detail = useAdminResource(loadDetail);
  const flags = useAdminResource(loadFlags);
  const code = useAdminResource(loadCode);
  const feedback = useAdminResource(loadFeedback);

  // The trainee's latest work: a submission, a first save ("In progress") or an integrity flag.
  useRealtimeEvent((event) => {
    if (event.type === 'task.submitted' || event.type === 'task.started') {
      if (event.traineeId !== traineeId) return;
      detail.refresh();
      if (event.taskId === selectedTaskId) code.refresh();
      return;
    }

    if (event.type === 'flag.created' && event.traineeId === traineeId) {
      flags.refresh();
      return;
    }

    // A manager moved this trainee here or away. Re-reading shows the data, or the
    // "not assigned to you" state when this mentor lost access.
    if (event.type === 'trainee.reassigned' && event.traineeId === traineeId) {
      detail.refresh();
    }
  });

  // After a stream reconnect, catch a change that landed while the stream was down.
  useRealtimeRefresh(() => {
    detail.refresh();
    flags.refresh();
    feedback.refresh();
    if (selectedTaskId) code.refresh();
  });

  // Where the mentor was in the task list when they clicked "View code".
  const scrollBeforeViewRef = useRef<number | null>(null);

  const handleViewCode = useCallback((taskId: string) => {
    // Remember the place only for the first task opened, not when switching between tasks.
    if (scrollBeforeViewRef.current === null) {
      scrollBeforeViewRef.current = window.scrollY;
    }
    setSelectedTaskId(taskId);
  }, []);

  // Close the code viewer and take the mentor back to where they were in the list.
  const handleCloseCode = useCallback(() => {
    setSelectedTaskId(null);
    const savedScroll = scrollBeforeViewRef.current;
    scrollBeforeViewRef.current = null;
    if (savedScroll !== null) {
      // Wait one frame, so the page has removed the viewer before scrolling.
      requestAnimationFrame(() => window.scrollTo({ top: savedScroll }));
    }
  }, []);

  // After Approve or Request rework: close the viewer, then quietly reload the list and feedback.
  const handleReviewSuccess = useCallback(() => {
    handleCloseCode();
    detail.refresh();
    feedback.refresh();
  }, [handleCloseCode, detail, feedback]);

  const { user } = useAuth();
  const traineeName = detail.data?.profile.trainee.name ?? 'Trainee';
  const { printJob, print, prepare, restore } = usePrintMode({
    defaults: DEFAULT_PRINT_OPTIONS,
    documentTitle: reportDocumentTitle(traineeName),
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
    const isForbidden = error?.code === 'FORBIDDEN';

    return (
      <>
        <AdminHeader />
        <main className={styles.page}>
          {isForbidden ? (
            <StateMessage
              icon={<UserX size={24} />}
              title="Trainee not assigned to you"
              description="A manager can assign this trainee to you if you need access."
              actionLabel="Back to my trainees"
              actionHref="/admin"
            />
          ) : isNotFound ? (
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
                title="Unable to load trainee"
                message={error?.message ?? ''}
                onRetry={detail.retry}
              />
            </>
          )}
        </main>
      </>
    );
  }

  /**
   * In the desktop shell the main process writes the PDF through a native save
   * dialog; in a browser we fall back to the print dialog's "Save as PDF".
   */
  const handlePrint = async (options: PrintReportOptions) => {
    const desktopReport = window.desktop?.report;
    if (!desktopReport) {
      try {
        print(options);
      } catch (printError: unknown) {
        setPdfError(
          printError instanceof Error
            ? `Unable to open print dialog: ${printError.message}`
            : 'Unable to open print dialog. Please try again.'
        );
      }
      return;
    }

    setPdfError(null);
    setIsSavingPdf(true);
    // Render the print-only report before the main process captures the page.
    prepare(options);
    try {
      await desktopReport.savePdf(reportDocumentTitle(traineeName));
    } catch (saveError: unknown) {
      setPdfError(
        saveError instanceof Error
          ? `Unable to save report PDF: ${saveError.message}`
          : 'Unable to save report PDF. Please try again.'
      );
    } finally {
      setIsSavingPdf(false);
      restore();
    }
  };

  const { profile, typingStats, courses, totalTasks, journal, tasks } = detail.data;

  const selectedTask = tasks.find((task) => task.taskId === selectedTaskId);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'tasks', label: `Tasks (${tasks.length}/${totalTasks})` },
    { id: 'journal', label: `Journal (${journal.length})` },
    {
      id: 'flags',
      label: `Flags (${flags.data ? flags.data.filter((flag) => flag.reviewPriority !== 'LOW').length : '…'})`,
    },
    {
      id: 'feedbacks',
      label: `Feedbacks (${feedback.data ? feedback.data.length : '…'})`,
    },
  ];

  return (
    <>
      <div className={styles.screenOnly}>
        <AdminHeader />

        <main className={styles.page}>
          <div className={styles.topBar}>
            <BackLink />
            <div className={styles.printControls}>
              <PrintReportButton onPrint={handlePrint} disabled={isSavingPdf} />
              {pdfError && (
                <p className={styles.pdfError} role="alert">
                  {pdfError}
                </p>
              )}
            </div>
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
                    key={selectedTaskId}
                    traineeId={traineeId}
                    taskTitle={selectedTask?.title ?? 'Task code'}
                    code={code.data}
                    isLoading={code.isLoading}
                    error={code.error}
                    onRetry={code.retry}
                    onClose={handleCloseCode}
                    onReviewSuccess={handleReviewSuccess}
                  />
                )}

                <AdminTaskList
                  tasks={tasks}
                  courses={courses}
                  selectedTaskId={selectedTaskId}
                  onViewCode={handleViewCode}
                  filter={taskFilter}
                  onFilterChange={setTaskFilter}
                  traineeId={traineeId}
                  traineeName={profile.trainee.name}
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

            {activeTab === 'feedbacks' && (
              <>
                {feedback.isLoading && (
                  <div className={styles.state}>
                    <LoaderOverlay label="Loading feedback…" />
                  </div>
                )}
                {feedback.error && (
                  <ErrorState
                    title="Unable to load feedback"
                    message={feedback.error.message}
                    onRetry={feedback.retry}
                  />
                )}
                {feedback.data && <AdminFeedbackList feedback={feedback.data} />}
              </>
            )}
          </div>
        </main>
      </div>

      {printJob && (
        <PrintReport
          detail={detail.data}
          flags={flags.data}
          feedback={feedback.data ?? null}
          dayLabels={dayLabels}
          options={printJob.options}
          mentorName={user?.name ?? null}
          generatedAt={printJob.startedAt}
        />
      )}
    </>
  );
}
