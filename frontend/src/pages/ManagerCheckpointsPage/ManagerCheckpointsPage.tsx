import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { CheckpointGroup, ManagerCheckpointSummary, ManagerTrainee } from '@itp/types';
import {
  CalendarClock,
  ChevronRight,
  ClipboardList,
  Pencil,
  Plus,
  Send,
  Users,
  XCircle,
} from 'lucide-react';
import AdminHeader from '../../components/AdminHeader';
import LoaderOverlay from '../../components/Common/LoadingState';
import { ErrorState } from '../../components/Common/ErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { useRealtimeEvent, useRealtimeRefresh } from '../../context/useRealtime';
import { MANAGER_NAV } from '../../constants/managerNav';
import { formatIstDateTime } from '../../lib/formatDateTime';
import {
  cancelManagerCheckpoint,
  getCheckpointGroups,
  getManagerCheckpoints,
  publishManagerCheckpoint,
} from '../../api/checkpoints';
import { getManagerTrainees } from '../../api/manager';
import CheckpointFormDialog from './CheckpointFormDialog';
import CheckpointGroupsDialog from './CheckpointGroupsDialog';
import { canCancelCheckpoint } from './managerCheckpointUi';
import styles from './ManagerCheckpointsPage.module.css';

type EditorTarget = { mode: 'create' } | { mode: 'edit'; checkpointId: string } | null;

/** How often the Upcoming / Live now / Window closed badge re-evaluates. */
const STATUS_TICK_MS = 30_000;

function sessionLabel(checkpoint: ManagerCheckpointSummary, now: number): string {
  if (checkpoint.status === 'DRAFT') return 'Draft';
  if (checkpoint.status === 'CANCELLED') return 'Cancelled';
  if (!checkpoint.startAt) return 'Scheduled';
  const start = new Date(checkpoint.startAt).getTime();
  const end = start + checkpoint.durationMinutes * 60_000;
  if (now < start) return 'Upcoming';
  if (now <= end) return 'Live now';
  return 'Window closed';
}

function statusClass(checkpoint: ManagerCheckpointSummary, now: number): string {
  if (checkpoint.status === 'CANCELLED') return styles.badgeCancelled;
  if (checkpoint.status === 'DRAFT') return styles.badgeDraft;
  if (sessionLabel(checkpoint, now) === 'Live now') return styles.badgeLive;
  return styles.badgeScheduled;
}

export default function ManagerCheckpointsPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [checkpoints, setCheckpoints] = useState<ManagerCheckpointSummary[] | null>(null);
  const [groups, setGroups] = useState<CheckpointGroup[]>([]);
  const [trainees, setTrainees] = useState<ManagerTrainee[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [editor, setEditor] = useState<EditorTarget>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<ManagerCheckpointSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  // The badge is time-based, so re-render it when a scheduled window opens or
  // closes even if no realtime event arrives.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), STATUS_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  // A trainee starting or submitting changes the attempt counts and status.
  useRealtimeEvent((event) => {
    if (event.type === 'checkpoint.updated') reload();
  });
  useRealtimeRefresh(reload);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getManagerCheckpoints(), getCheckpointGroups(), getManagerTrainees()])
      .then(([checkpointRows, groupRows, traineeRows]) => {
        if (cancelled) return;
        setCheckpoints(checkpointRows);
        setGroups(groupRows);
        setTrainees(traineeRows);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught : new Error('Could not load checkpoints.'));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const stats = useMemo(() => {
    const list = checkpoints ?? [];
    return {
      total: list.length,
      scheduled: list.filter((checkpoint) => checkpoint.status === 'SCHEDULED').length,
      drafts: list.filter((checkpoint) => checkpoint.status === 'DRAFT').length,
      submissions: list.reduce((sum, checkpoint) => sum + checkpoint.submittedCount, 0),
    };
  }, [checkpoints]);

  async function handlePublish(checkpoint: ManagerCheckpointSummary) {
    setBusyId(checkpoint.id);
    setActionError(null);
    try {
      await publishManagerCheckpoint(checkpoint.id);
      toast.show({ message: `"${checkpoint.title}" is scheduled.`, variant: 'success' });
      reload();
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'Could not publish the checkpoint.'
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel() {
    if (!pendingCancel) return;
    setBusyId(pendingCancel.id);
    setActionError(null);
    try {
      await cancelManagerCheckpoint(pendingCancel.id);
      toast.show({ message: `"${pendingCancel.title}" was cancelled.`, variant: 'success' });
      setPendingCancel(null);
      reload();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not cancel the checkpoint.');
    } finally {
      setBusyId(null);
    }
  }

  if (error) {
    return (
      <>
        <AdminHeader
          homePath="/manager"
          badge="Manager view"
          navItems={MANAGER_NAV}
          navLabel="Manager navigation"
        />
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
        <AdminHeader
          homePath="/manager"
          badge="Manager view"
          navItems={MANAGER_NAV}
          navLabel="Manager navigation"
        />
        <main className={styles.page}>
          <LoaderOverlay label="Loading checkpoints…" />
        </main>
      </>
    );
  }

  return (
    <>
      <AdminHeader
        homePath="/manager"
        badge="Manager view"
        navItems={MANAGER_NAV}
        navLabel="Manager navigation"
      />

      {editor && (
        <CheckpointFormDialog
          target={editor}
          trainees={trainees}
          groups={groups}
          onClose={() => setEditor(null)}
          onSaved={(message) => {
            setEditor(null);
            toast.show({ message, variant: 'success' });
            reload();
          }}
        />
      )}

      {groupsOpen && (
        <CheckpointGroupsDialog
          trainees={trainees}
          groups={groups}
          onClose={() => setGroupsOpen(false)}
          onChanged={reload}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingCancel)}
        title="Cancel this checkpoint?"
        confirmLabel={busyId ? 'Cancelling…' : 'Cancel checkpoint'}
        cancelLabel="Keep checkpoint"
        tone="danger"
        isConfirming={busyId !== null}
        error={actionError}
        onConfirm={() => void handleCancel()}
        onCancel={() => {
          if (busyId) return;
          setPendingCancel(null);
          setActionError(null);
        }}
      >
        <p>
          Trainees will no longer be able to open &ldquo;{pendingCancel?.title}&rdquo;. Any attempt
          still running is finalised immediately. Results and saved answers are kept.
        </p>
      </ConfirmDialog>

      <main className={styles.page}>
        <div className={styles.titleRow}>
          <div>
            <h1 className={styles.title}>Checkpoint assessments</h1>
            <p className={styles.subtitle}>
              Create MCQ or practical test checkpoints, schedule them for trainees or groups, and
              grade the submissions.
            </p>
          </div>
          <div className={styles.titleActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setGroupsOpen(true)}
            >
              <Users size={16} aria-hidden="true" />
              Manage groups
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setEditor({ mode: 'create' })}
            >
              <Plus size={16} aria-hidden="true" />
              New checkpoint
            </button>
          </div>
        </div>

        <section className={styles.stats} aria-label="Checkpoint summary">
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats.total}</span>
            <span className={styles.statLabel}>Total checkpoints</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats.scheduled}</span>
            <span className={styles.statLabel}>Scheduled</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats.drafts}</span>
            <span className={styles.statLabel}>Drafts</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats.submissions}</span>
            <span className={styles.statLabel}>Submissions</span>
          </div>
        </section>

        {actionError && !pendingCancel && (
          <p className={styles.actionError} role="alert">
            {actionError}
          </p>
        )}

        <div className={styles.card}>
          {checkpoints.length === 0 ? (
            <div className={styles.empty}>
              <ClipboardList size={28} aria-hidden="true" />
              <h2>No checkpoints yet</h2>
              <p>Create your first checkpoint — choose MCQ or practical test.</p>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => setEditor({ mode: 'create' })}
              >
                <Plus size={16} aria-hidden="true" />
                New checkpoint
              </button>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Checkpoint</th>
                    <th scope="col">Type</th>
                    <th scope="col">Schedule</th>
                    <th scope="col">Duration</th>
                    <th scope="col">Marks</th>
                    <th scope="col">Assigned</th>
                    <th scope="col">Attempts</th>
                    <th scope="col">Status</th>
                    <th scope="col" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {checkpoints.map((checkpoint) => (
                    <tr key={checkpoint.id}>
                      <td>
                        <div className={styles.checkpointCell}>
                          <span className={styles.checkpointTitle}>{checkpoint.title}</span>
                          {checkpoint.description && (
                            <span className={styles.checkpointDescription}>
                              {checkpoint.description}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={styles.muted}>
                        {checkpoint.mode === 'PRACTICAL' ? '💻 Practical' : '📝 MCQ'}
                      </td>
                      <td className={styles.muted}>
                        {checkpoint.startAt ? formatIstDateTime(checkpoint.startAt) : 'Not set'}
                      </td>
                      <td className={styles.muted}>{checkpoint.durationMinutes} min</td>
                      <td className={styles.muted}>
                        {checkpoint.totalMarks} total
                        <span className={styles.subtle}> · {checkpoint.passingMarks} to pass</span>
                      </td>
                      <td className={styles.muted}>{checkpoint.assignedCount}</td>
                      <td className={styles.muted}>
                        {checkpoint.submittedCount}/{checkpoint.attemptCount} submitted
                        {checkpoint.gradedCount > 0 && (
                          <span className={styles.subtle}> · {checkpoint.gradedCount} graded</span>
                        )}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${statusClass(checkpoint, now)}`}>
                          {sessionLabel(checkpoint, now)}
                        </span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          {checkpoint.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              className={styles.iconButton}
                              onClick={() =>
                                setEditor({ mode: 'edit', checkpointId: checkpoint.id })
                              }
                              disabled={checkpoint.attemptCount > 0}
                              title={
                                checkpoint.attemptCount > 0
                                  ? 'Attempts exist; create a new checkpoint instead.'
                                  : 'Edit checkpoint'
                              }
                              aria-label={`Edit ${checkpoint.title}`}
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                          {checkpoint.status === 'DRAFT' && (
                            <button
                              type="button"
                              className={styles.iconButton}
                              onClick={() => void handlePublish(checkpoint)}
                              disabled={busyId === checkpoint.id}
                              title="Publish and schedule"
                              aria-label={`Publish ${checkpoint.title}`}
                            >
                              <Send size={15} />
                            </button>
                          )}
                          {checkpoint.status === 'SCHEDULED' && (
                            <button
                              type="button"
                              className={styles.iconButton}
                              onClick={() => {
                                void navigate(`/manager/checkpoints/${checkpoint.id}/results`);
                              }}
                              title="Review submissions and results"
                              aria-label={`Results for ${checkpoint.title}`}
                            >
                              <ChevronRight size={16} />
                            </button>
                          )}
                          {canCancelCheckpoint(checkpoint) && (
                            <button
                              type="button"
                              className={styles.iconButtonDanger}
                              onClick={() => {
                                setActionError(null);
                                setPendingCancel(checkpoint);
                              }}
                              title="Cancel checkpoint"
                              aria-label={`Cancel ${checkpoint.title}`}
                            >
                              <XCircle size={15} />
                            </button>
                          )}
                          {checkpoint.status === 'SCHEDULED' && (
                            <Link
                              className={styles.inlineLink}
                              to={`/manager/checkpoints/${checkpoint.id}/results`}
                            >
                              Results
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className={styles.hint}>
          <CalendarClock size={14} aria-hidden="true" /> MCQ papers are parsed from Markdown.
          Practical tests provide a full coding workspace with starter files.
        </p>
      </main>
    </>
  );
}
