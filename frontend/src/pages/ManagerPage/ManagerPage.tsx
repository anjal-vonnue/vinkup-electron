import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ManagerStaffMember, ManagerTrainee } from '@itp/types';
import { UserPlus, Users } from 'lucide-react';
import AdminHeader from '../../components/AdminHeader';
import LoaderOverlay from '../../components/Common/LoadingState';
import { ErrorState } from '../../components/Common/ErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../context/Useauth';
import {
  assignTraineeMentor,
  getManagerStaff,
  getManagerTrainees,
  setManagerStaffActive,
  setManagerTraineeActive,
} from '../../api/manager';
import AccountDialog from './AccountDialog';
import ManagerStaffTable from './ManagerStaffTable';
import ManagerTraineeTable from './ManagerTraineeTable';
import styles from './ManagerPage.module.css';

type DialogTarget =
  | { kind: 'staff'; mode: 'create' }
  | { kind: 'staff'; mode: 'edit'; record: ManagerStaffMember }
  | { kind: 'trainee'; mode: 'create' }
  | { kind: 'trainee'; mode: 'edit'; record: ManagerTrainee };

type PendingToggle = {
  kind: 'staff' | 'trainee';
  id: string;
  name: string;
  isActive: boolean;
};

function byName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

function upsert<T extends { id: string; name: string }>(items: T[], record: T): T[] {
  const exists = items.some((item) => item.id === record.id);
  const next = exists
    ? items.map((item) => (item.id === record.id ? record : item))
    : [...items, record];
  return byName(next);
}

function HomeIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

export default function ManagerPage() {
  const { user } = useAuth();
  const toast = useToast();

  const [staff, setStaff] = useState<ManagerStaffMember[] | null>(null);
  const [trainees, setTrainees] = useState<ManagerTrainee[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [dialog, setDialog] = useState<DialogTarget | null>(null);
  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    Promise.all([getManagerStaff(), getManagerTrainees()])
      .then(([staffRows, traineeRows]) => {
        if (isCancelled) return;
        setStaff(byName(staffRows));
        setTrainees(byName(traineeRows));
        setError(null);
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
    setStaff(null);
    setTrainees(null);
    setError(null);
    setAttempt((n) => n + 1);
  };

  const handleSaved = useCallback(
    (message: string, saved: ManagerStaffMember | ManagerTrainee) => {
      if ('assignedTraineeCount' in saved) {
        setStaff((current) => upsert(current ?? [], saved));
      } else {
        setTrainees((current) => upsert(current ?? [], saved));
      }
      setDialog(null);
      toast.show({ message, variant: 'success' });
    },
    [toast]
  );

  const handleToggle = async () => {
    if (!pendingToggle) return;
    const nextActive = !pendingToggle.isActive;
    setBusyId(pendingToggle.id);
    setToggleError(null);

    try {
      if (pendingToggle.kind === 'staff') {
        const updated = await setManagerStaffActive(pendingToggle.id, { isActive: nextActive });
        setStaff((current) => upsert(current ?? [], updated));
      } else {
        const updated = await setManagerTraineeActive(pendingToggle.id, {
          isActive: nextActive,
        });
        setTrainees((current) => upsert(current ?? [], updated));
      }
      toast.show({
        message: `${pendingToggle.name} was ${nextActive ? 'activated' : 'deactivated'}.`,
        variant: 'success',
      });
      setPendingToggle(null);
    } catch (caught) {
      setToggleError(caught instanceof Error ? caught.message : 'Could not update the account.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAssign = async (trainee: ManagerTrainee, mentorId: string | null) => {
    setAssigningId(trainee.id);
    try {
      const updated = await assignTraineeMentor(trainee.id, { mentorId });
      setTrainees((current) => upsert(current ?? [], updated));
      toast.show({
        message: updated.mentor
          ? `${trainee.name} is now assigned to ${updated.mentor.name}.`
          : `${trainee.name} is now unassigned.`,
        variant: 'success',
      });
    } catch (caught) {
      toast.show({
        message: caught instanceof Error ? caught.message : 'Could not update the assignment.',
        variant: 'error',
      });
    } finally {
      setAssigningId(null);
    }
  };

  const mentors = useMemo(
    () => (staff ?? []).filter((member) => member.role === 'mentor'),
    [staff]
  );

  if (error) {
    return (
      <>
        <AdminHeader
          homePath="/manager"
          badge="Manager view"
          navItems={[{ to: '/manager', label: 'Users & assignments', end: true }]}
          navLabel="Manager navigation"
        />
        <main className={styles.page}>
          <ErrorState
            fullPage
            title="Unable to load accounts"
            message={error.message}
            onRetry={handleRetry}
          />
        </main>
      </>
    );
  }

  if (!staff || !trainees) {
    return (
      <>
        <AdminHeader
          homePath="/manager"
          badge="Manager view"
          navItems={[{ to: '/manager', label: 'Users & assignments', end: true }]}
          navLabel="Manager navigation"
        />
        <main className={styles.page}>
          <LoaderOverlay label="Loading accounts…" />
        </main>
      </>
    );
  }

  const activeMentors = mentors.filter((mentor) => mentor.isActive);
  const unassigned = trainees.filter((trainee) => !trainee.mentor).length;

  return (
    <>
      <AdminHeader
        homePath="/manager"
        badge="Manager view"
        navItems={[{ to: '/manager', label: 'Users & assignments', end: true }]}
        navLabel="Manager navigation"
      />

      {dialog && (
        <AccountDialog
          target={dialog}
          mentors={activeMentors}
          onClose={() => setDialog(null)}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingToggle)}
        title={pendingToggle?.isActive ? 'Deactivate account?' : 'Activate account?'}
        confirmLabel={
          busyId ? 'Saving…' : pendingToggle?.isActive ? 'Deactivate account' : 'Activate account'
        }
        tone={pendingToggle?.isActive ? 'danger' : 'default'}
        isConfirming={busyId !== null}
        error={toggleError}
        onConfirm={() => void handleToggle()}
        onCancel={() => {
          if (busyId) return;
          setPendingToggle(null);
          setToggleError(null);
        }}
      >
        {pendingToggle && (
          <p>
            {pendingToggle.isActive
              ? `${pendingToggle.name} will no longer be able to sign in. Their records are kept.`
              : `${pendingToggle.name} will be able to sign in again.`}
          </p>
        )}
      </ConfirmDialog>

      <main className={styles.page}>
        <div className={styles.titleRow}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>Users &amp; assignments</h1>
            <p className={styles.subtitle}>
              Create accounts, control access, and decide which mentor sees each trainee.
            </p>
          </div>
        </div>

        <section className={styles.stats} aria-label="Account summary">
          <div className={styles.stat}>
            <span className={styles.statValue}>{activeMentors.length}</span>
            <span className={styles.statLabel}>Active mentors</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>
              {staff.filter((member) => member.role === 'manager' && member.isActive).length}
            </span>
            <span className={styles.statLabel}>Active managers</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>
              {trainees.filter((trainee) => trainee.isActive).length}
            </span>
            <span className={styles.statLabel}>Active trainees</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{unassigned}</span>
            <span className={styles.statLabel}>Unassigned trainees</span>
          </div>
        </section>

        <section className={styles.card} aria-labelledby="staff-heading">
          <header className={styles.cardHeader}>
            <div>
              <h2 id="staff-heading" className={styles.cardTitle}>
                Mentors &amp; managers
              </h2>
              <p className={styles.cardHint}>
                Only active mentors can be assigned. Reassign their trainees before deactivating.
              </p>
            </div>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setDialog({ kind: 'staff', mode: 'create' })}
            >
              <UserPlus size={16} aria-hidden="true" />
              Add staff
            </button>
          </header>

          {staff.length === 0 ? (
            <div className={styles.empty} role="status">
              <div className={styles.emptyIcon} aria-hidden="true">
                <Users size={22} />
              </div>
              <h3 className={styles.emptyTitle}>No staff accounts yet</h3>
              <p className={styles.emptyText}>Add a mentor or manager to get started.</p>
            </div>
          ) : (
            <ManagerStaffTable
              staff={staff}
              currentUserId={user?.id ?? ''}
              busyId={busyId}
              onEdit={(record) => setDialog({ kind: 'staff', mode: 'edit', record })}
              onToggleActive={(record) => {
                setToggleError(null);
                setPendingToggle({
                  kind: 'staff',
                  id: record.id,
                  name: record.name,
                  isActive: record.isActive,
                });
              }}
            />
          )}
        </section>

        <section className={styles.card} aria-labelledby="trainee-heading">
          <header className={styles.cardHeader}>
            <div>
              <h2 id="trainee-heading" className={styles.cardTitle}>
                Trainees
              </h2>
              <p className={styles.cardHint}>
                Changing a mentor takes effect immediately and removes the old mentor&apos;s access.
              </p>
            </div>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setDialog({ kind: 'trainee', mode: 'create' })}
            >
              <UserPlus size={16} aria-hidden="true" />
              Add trainee
            </button>
          </header>

          {trainees.length === 0 ? (
            <div className={styles.empty} role="status">
              <div className={styles.emptyIcon} aria-hidden="true">
                <HomeIcon />
              </div>
              <h3 className={styles.emptyTitle}>No trainees yet</h3>
              <p className={styles.emptyText}>
                Add a trainee here, or wait for a mentor to add one.
              </p>
            </div>
          ) : (
            <ManagerTraineeTable
              trainees={trainees}
              mentors={mentors}
              busyId={busyId}
              assigningId={assigningId}
              onEdit={(record) => setDialog({ kind: 'trainee', mode: 'edit', record })}
              onToggleActive={(record) => {
                setToggleError(null);
                setPendingToggle({
                  kind: 'trainee',
                  id: record.id,
                  name: record.name,
                  isActive: record.isActive,
                });
              }}
              onAssign={(record, mentorId) => void handleAssign(record, mentorId)}
            />
          )}
        </section>
      </main>
    </>
  );
}
