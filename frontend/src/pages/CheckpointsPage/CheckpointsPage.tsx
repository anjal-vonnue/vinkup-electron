import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { TraineeCheckpointSummary } from '@itp/types';
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Clock3,
  FileCheck2,
  RefreshCw,
  Timer,
} from 'lucide-react';
import Header from '../../components/Header';
import LoaderOverlay from '../../components/Common/LoadingState';
import { ErrorState } from '../../components/Common/ErrorState';
import { formatIstDateTime } from '../../lib/formatDateTime';
import { getMyCheckpoints } from '../../api/checkpoints';
import { useRealtimeEvent, useRealtimeRefresh } from '../../context/useRealtime';
import { availabilityMeta, formatDuration } from './checkpointUi';
import { useCheckpointRefreshAt } from './useCheckpointRefreshAt';
import styles from './Checkpoints.module.css';

type CardAction = { label: string; to: string; primary: boolean };

function actionFor(checkpoint: TraineeCheckpointSummary): CardAction {
  const attempt = checkpoint.attempt;
  if (checkpoint.availability === 'IN_PROGRESS' && attempt) {
    return {
      label: 'Resume attempt',
      to: `/checkpoints/attempts/${attempt.id}`,
      primary: true,
    };
  }
  // A submitted attempt with attempts left is still startable while the entry
  // window is open, so offer the next attempt before the read-only result.
  if (checkpoint.canStart && attempt) {
    return {
      label: `Start attempt ${attempt.attemptNumber + 1}`,
      to: `/checkpoints/${checkpoint.id}`,
      primary: true,
    };
  }
  if (checkpoint.availability === 'RESULTS_AVAILABLE' && attempt) {
    return {
      label: 'View result',
      to: `/checkpoints/attempts/${attempt.id}/summary`,
      primary: true,
    };
  }
  if (checkpoint.availability === 'AVAILABLE' && checkpoint.canStart) {
    return { label: 'Open checkpoint', to: `/checkpoints/${checkpoint.id}`, primary: true };
  }
  if (
    (checkpoint.availability === 'SUBMITTED' || checkpoint.availability === 'AWAITING_RESULTS') &&
    attempt
  ) {
    return {
      label: 'View submission',
      to: `/checkpoints/attempts/${attempt.id}/summary`,
      primary: false,
    };
  }
  return { label: 'View details', to: `/checkpoints/${checkpoint.id}`, primary: false };
}

function CheckpointCard({ checkpoint }: { checkpoint: TraineeCheckpointSummary }) {
  const meta = availabilityMeta(checkpoint.availability);
  const action = actionFor(checkpoint);
  const attemptsUsed = checkpoint.attempt ? checkpoint.attempt.attemptNumber : 0;

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={`${styles.badge} ${styles[`tone${meta.tone}`]}`}>{meta.label}</span>
        <span className={styles.cardMarks}>
          {checkpoint.totalMarks} marks · {checkpoint.passingMarks} to pass
        </span>
      </div>

      <h3 className={styles.cardTitle}>{checkpoint.title}</h3>
      {checkpoint.description ? (
        <p className={styles.cardDescription}>{checkpoint.description}</p>
      ) : (
        <p className={styles.cardDescription}>No description provided.</p>
      )}

      <dl className={styles.cardMeta}>
        <div>
          <dt>
            <CalendarClock size={13} aria-hidden="true" /> Starts
          </dt>
          <dd>{formatIstDateTime(checkpoint.startAt)}</dd>
        </div>
        <div>
          <dt>
            <Timer size={13} aria-hidden="true" /> Duration
          </dt>
          <dd>{formatDuration(checkpoint.durationMinutes)}</dd>
        </div>
        <div>
          <dt>
            <FileCheck2 size={13} aria-hidden="true" /> Attempts
          </dt>
          <dd>{attemptsUsed === 0 ? 'Not started' : `Attempt ${attemptsUsed}`}</dd>
        </div>
      </dl>

      <p className={styles.cardHint}>
        {checkpoint.availability === 'IN_PROGRESS'
          ? 'Your timer is running. Resume to keep answering.'
          : checkpoint.canStart && checkpoint.attempt
            ? `Attempt ${checkpoint.attempt.attemptNumber} submitted. Start the next attempt before the window closes.`
            : checkpoint.blockedReason && checkpoint.availability !== 'UPCOMING'
              ? checkpoint.blockedReason
              : meta.hint}
      </p>

      <div className={styles.cardFooter}>
        <Link
          to={action.to}
          className={action.primary ? styles.primaryButton : styles.secondaryButton}
        >
          {action.label}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
        <span className={styles.serverTime}>
          <Clock3 size={12} aria-hidden="true" />
          Server time{' '}
          {new Date(checkpoint.serverNow).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </article>
  );
}

export default function CheckpointsPage() {
  const navigate = useNavigate();

  const [checkpoints, setCheckpoints] = useState<TraineeCheckpointSummary[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  // A checkpoint published or results released while the list is open should
  // appear without the trainee pressing Refresh.
  useRealtimeEvent((event) => {
    if (event.type === 'checkpoint.published' || event.type === 'checkpoint.results.published') {
      reload();
    }
  });
  useRealtimeRefresh(reload);

  useEffect(() => {
    let cancelled = false;
    getMyCheckpoints()
      .then((rows) => {
        if (cancelled) return;
        const running = rows.find(
          (checkpoint) => checkpoint.availability === 'IN_PROGRESS' && checkpoint.attempt !== null
        );
        if (running?.attempt) {
          void navigate(`/checkpoints/attempts/${running.attempt.id}`, { replace: true });
          return;
        }
        setCheckpoints(rows);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught : new Error('Could not load your checkpoints.'));
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, reloadKey]);

  // Reload when the next upcoming checkpoint opens so it moves into "Open now"
  // without the trainee pressing Refresh.
  const nextStartAt = useMemo(() => {
    if (!checkpoints) return null;
    const starts = checkpoints
      .filter((checkpoint) => checkpoint.availability === 'UPCOMING')
      .map((checkpoint) => new Date(checkpoint.startAt).getTime())
      .filter((time) => !Number.isNaN(time));
    return starts.length > 0 ? Math.min(...starts) : null;
  }, [checkpoints]);

  useCheckpointRefreshAt(nextStartAt, checkpoints?.[0]?.serverNow, reload);

  const groups = useMemo(() => {
    const rows = checkpoints ?? [];
    const byStart = (a: TraineeCheckpointSummary, b: TraineeCheckpointSummary) =>
      new Date(a.startAt).getTime() - new Date(b.startAt).getTime();

    return {
      // A submitted attempt with attempts left is still open for another try.
      open: rows
        .filter((checkpoint) => checkpoint.canStart || checkpoint.availability === 'IN_PROGRESS')
        .sort(byStart),
      upcoming: rows.filter((checkpoint) => checkpoint.availability === 'UPCOMING').sort(byStart),
      completed: rows
        .filter(
          (checkpoint) =>
            !checkpoint.canStart &&
            checkpoint.availability !== 'IN_PROGRESS' &&
            ['SUBMITTED', 'AWAITING_RESULTS', 'RESULTS_AVAILABLE', 'MISSED', 'CANCELLED'].includes(
              checkpoint.availability
            )
        )
        .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime()),
    };
  }, [checkpoints]);

  // Keep the app locked to the checkpoint section while a previous attempt can
  // still be followed by another one, until the checkpoint window closes.
  const navigationLocked = (checkpoints ?? []).some(
    (checkpoint) => checkpoint.canStart && checkpoint.attempt !== null
  );

  if (error) {
    return (
      <>
        <Header locked={navigationLocked} />
        <main className={styles.page}>
          <ErrorState
            fullPage
            title="Unable to load checkpoints"
            message={error.message}
            onRetry={reload}
          />
        </main>
      </>
    );
  }

  if (!checkpoints) {
    return (
      <>
        <Header locked={navigationLocked} />
        <main className={styles.page}>
          <LoaderOverlay label="Loading your checkpoints…" />
        </main>
      </>
    );
  }

  const resultsAvailable = checkpoints.filter(
    (checkpoint) => checkpoint.availability === 'RESULTS_AVAILABLE'
  ).length;

  return (
    <>
      <Header locked={navigationLocked} />
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.title}>Checkpoint assessments</h1>
            <p className={styles.subtitle}>
              Scheduled assessments appear here. Once you start, the timer cannot be paused.
            </p>
          </div>
          <button type="button" className={styles.secondaryButton} onClick={reload}>
            <RefreshCw size={14} aria-hidden="true" />
            Refresh
          </button>
        </header>

        <section className={styles.stats} aria-label="Checkpoint summary">
          <div className={styles.stat}>
            <span className={styles.statValue}>{groups.open.length}</span>
            <span className={styles.statLabel}>Open now</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{groups.upcoming.length}</span>
            <span className={styles.statLabel}>Upcoming</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{resultsAvailable}</span>
            <span className={styles.statLabel}>Results ready</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{checkpoints.length}</span>
            <span className={styles.statLabel}>Assigned</span>
          </div>
        </section>

        {checkpoints.length === 0 ? (
          <div className={styles.empty}>
            <ClipboardList size={30} aria-hidden="true" />
            <h2 className={styles.emptyTitle}>No checkpoints assigned</h2>
            <p className={styles.emptyText}>
              When a manager schedules a checkpoint for you or your group, it will appear here.
            </p>
          </div>
        ) : (
          <>
            {groups.open.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Open now</h2>
                  <span className={styles.count}>{groups.open.length}</span>
                </div>
                <div className={styles.grid}>
                  {groups.open.map((checkpoint) => (
                    <CheckpointCard key={checkpoint.id} checkpoint={checkpoint} />
                  ))}
                </div>
              </section>
            )}

            {groups.upcoming.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Upcoming</h2>
                  <span className={styles.count}>{groups.upcoming.length}</span>
                </div>
                <div className={styles.grid}>
                  {groups.upcoming.map((checkpoint) => (
                    <CheckpointCard key={checkpoint.id} checkpoint={checkpoint} />
                  ))}
                </div>
              </section>
            )}

            {groups.completed.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Completed</h2>
                  <span className={styles.count}>{groups.completed.length}</span>
                </div>
                <div className={styles.grid}>
                  {groups.completed.map((checkpoint) => (
                    <CheckpointCard key={checkpoint.id} checkpoint={checkpoint} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
