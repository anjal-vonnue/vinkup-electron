import { useEffect, useState } from 'react';
import type { AdminTraineeSummary } from '@itp/types';
import { getAdminTrainees } from '../../api/admin';
import AdminHeader from '../../components/AdminHeader';
import LoaderOverlay from '../../components/Common/LoadingState';
import { ErrorState } from '../../components/Common/ErrorState';
import TraineeTable from './TraineeTable';
import styles from './AdminTraineesPage.module.css';
import CohortSummary from '../../components/CohortSummary';
import TeamAnalytics from '../../components/TeamAnalytics';
import { filterTrainees, sortTrainees } from '../../lib/traineeListState';
import TraineeListToolbar from './TraineeListToolbar';
import { useTraineeListParams } from './useTraineeListParams';
import {
  medianDaysCompleted,
  needsAttention,
  sortTraineesByName,
  toCsv,
} from '../../lib/adminTrainees';
import { csvFilename, downloadCsv } from '../../lib/downloadCsv';
import { todayKey } from '../../lib/platformDate';
import { UserPlus } from 'lucide-react';
import { useToast } from '../../components/Toast';
import AddTraineeDialog from './AddTraineeDialog';

function UsersIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 18 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6.5" cy="4.5" r="2.75" />
      <path d="M1 14.5c.4-2.5 2.5-4 5.5-4s5.1 1.5 5.5 4" />
      <path d="M12 2.2a2.75 2.75 0 0 1 0 5.2M13.5 10.7c1.9.4 3 1.6 3.4 3.8" />
    </svg>
  );
}

/** /admin: read-only overview of every trainee, one row each, sorted by name. */
export default function AdminTraineesPage() {
  const [trainees, setTrainees] = useState<AdminTraineeSummary[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { query, sort, attentionOnly, setQuery, setSort, setAttentionOnly } =
    useTraineeListParams();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const toast = useToast();

  const handleCreated = (created: AdminTraineeSummary) => {
    // Insert without reloading: the response is already a full list row.
    setTrainees((current) => sortTraineesByName([...(current ?? []), created]));
    setIsAddOpen(false);
    toast.show({ message: `${created.name} was added and can sign in now.`, variant: 'success' });
  };

  useEffect(() => {
    // Ignore a response that arrives after the mentor left the page or retried.
    let isCancelled = false;

    getAdminTrainees()
      .then((data) => {
        if (!isCancelled) setTrainees(sortTraineesByName(data));
      })
      .catch((caught: unknown) => {
        if (!isCancelled) {
          setError(caught instanceof Error ? caught : new Error('Something went wrong.'));
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [attempt]);

  const handleRetry = () => {
    setError(null);
    setAttempt((n) => n + 1);
  };

  if (error) {
    return (
      <>
        <AdminHeader />
        <main className={styles.page}>
          <ErrorState
            fullPage
            title="Unable to load trainees"
            message={error.message}
            onRetry={handleRetry}
          />
        </main>
      </>
    );
  }

  if (!trainees) {
    return (
      <>
        <AdminHeader />
        <main className={styles.page}>
          <LoaderOverlay label="Loading trainees…" />
        </main>
      </>
    );
  }

  // Reasons and the chip count use the whole cohort, so they don't change while a mentor types.
  const today = todayKey();
  const median = medianDaysCompleted(trainees);
  const attentionReasons: Record<string, string[]> = {};
  for (const t of trainees) attentionReasons[t.id] = needsAttention(t, today, median);
  const attentionCount = trainees.filter((t) => attentionReasons[t.id].length > 0).length;

  const candidates = attentionOnly
    ? trainees.filter((t) => attentionReasons[t.id].length > 0)
    : trainees;
  const visibleTrainees = sortTrainees(filterTrainees(candidates, query), sort);

  // Exactly the rows the table shows now: same search, attention filter and sort.
  const handleExport = () => downloadCsv(toCsv(visibleTrainees), csvFilename());

  return (
    <>
      <AdminHeader />
      {isAddOpen && (
        <AddTraineeDialog onClose={() => setIsAddOpen(false)} onCreated={handleCreated} />
      )}
      <main className={styles.page}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Trainees</h1>
          <p className={styles.subtitle}>{/* unchanged */}</p>
        </div>
        <button type="button" className={styles.addButton} onClick={() => setIsAddOpen(true)}>
          <UserPlus size={16} strokeWidth={2} aria-hidden="true" />
          Add trainee
        </button>

        {trainees.length > 0 && <CohortSummary trainees={trainees} />}
        {trainees.length > 0 && (
          <TeamAnalytics trainees={trainees} attentionReasons={attentionReasons} />
        )}

        <section className={styles.card} aria-label="Trainee overview">
          {trainees.length === 0 ? (
            <div className={styles.empty} role="status">
              <div className={styles.emptyIcon} aria-hidden="true">
                <UsersIcon />
              </div>
              <h2 className={styles.emptyTitle}>No trainees yet</h2>
              <p className={styles.emptyText}>Add a trainee to get started.</p>
            </div>
          ) : (
            <>
              <TraineeListToolbar
                query={query}
                onQueryChange={setQuery}
                sort={sort}
                onSortChange={setSort}
                attentionOnly={attentionOnly}
                attentionCount={attentionCount}
                onAttentionChange={setAttentionOnly}
                onExport={handleExport}
              />
              {visibleTrainees.length === 0 ? (
                <p className={styles.noMatches} role="status">
                  No trainees match your filters.
                </p>
              ) : (
                <TraineeTable trainees={visibleTrainees} attentionReasons={attentionReasons} />
              )}
            </>
          )}
        </section>
      </main>
    </>
  );
}
