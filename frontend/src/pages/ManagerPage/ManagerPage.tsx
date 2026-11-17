import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ManagerStaffMember, ManagerTrainee } from '@itp/types';
import { ChevronLeft, ChevronRight, Search, UserPlus, Users, X } from 'lucide-react';
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

type ActiveTab = 'staff' | 'trainees';

const PAGE_SIZE = 5;

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

  const [activeTab, setActiveTab] = useState<ActiveTab>('staff');
  const [searchQuery, setSearchQuery] = useState('');
  const [mentorFilter, setMentorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

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

  const mentorFilterOptions = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    const seen = new Set<string>();

    for (const m of mentors) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        list.push({ id: m.id, name: m.name });
      }
    }

    for (const t of trainees ?? []) {
      if (t.mentor && !seen.has(t.mentor.id)) {
        seen.add(t.mentor.id);
        list.push({ id: t.mentor.id, name: t.mentor.name });
      }
    }

    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [mentors, trainees]);

  const filteredStaff = useMemo(() => {
    if (!staff) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(
      (member) =>
        member.name.toLowerCase().includes(q) ||
        member.email.toLowerCase().includes(q) ||
        member.role.toLowerCase().includes(q)
    );
  }, [staff, searchQuery]);

  const filteredTrainees = useMemo(() => {
    if (!trainees) return [];
    let result = trainees;

    if (mentorFilter === 'unassigned') {
      result = result.filter((t) => !t.mentor);
    } else if (mentorFilter !== 'all') {
      result = result.filter(
        (t) => t.mentor && (t.mentor.id === mentorFilter || t.mentor.name === mentorFilter)
      );
    }

    if (statusFilter === 'active') {
      result = result.filter((t) => t.isActive);
    } else if (statusFilter === 'inactive') {
      result = result.filter((t) => !t.isActive);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.email.toLowerCase().includes(q) ||
          (t.mentor && t.mentor.name.toLowerCase().includes(q))
      );
    }

    return result;
  }, [trainees, mentorFilter, statusFilter, searchQuery]);

  const totalStaffPages = Math.max(1, Math.ceil(filteredStaff.length / PAGE_SIZE));
  const safeStaffPage = Math.min(currentPage, totalStaffPages);

  const totalTraineePages = Math.max(1, Math.ceil(filteredTrainees.length / PAGE_SIZE));
  const safeTraineePage = Math.min(currentPage, totalTraineePages);

  const pagedStaff = useMemo(() => {
    const start = (safeStaffPage - 1) * PAGE_SIZE;
    return filteredStaff.slice(start, start + PAGE_SIZE);
  }, [filteredStaff, safeStaffPage]);

  const pagedTrainees = useMemo(() => {
    const start = (safeTraineePage - 1) * PAGE_SIZE;
    return filteredTrainees.slice(start, start + PAGE_SIZE);
  }, [filteredTrainees, safeTraineePage]);

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

        <div className={styles.card}>
          <div className={styles.tabHeader}>
            <div className={styles.tabs} role="tablist" aria-label="Account categories">
              <button
                type="button"
                role="tab"
                id="staff-tab"
                aria-selected={activeTab === 'staff'}
                aria-controls="staff-panel"
                className={`${styles.tab} ${activeTab === 'staff' ? styles.activeTab : ''}`}
                onClick={() => {
                  setActiveTab('staff');
                  setSearchQuery('');
                  setMentorFilter('all');
                  setStatusFilter('all');
                  setCurrentPage(1);
                }}
              >
                Mentors &amp; Managers
                <span className={styles.tabCount}>{staff.length}</span>
              </button>

              <button
                type="button"
                role="tab"
                id="trainees-tab"
                aria-selected={activeTab === 'trainees'}
                aria-controls="trainees-panel"
                className={`${styles.tab} ${activeTab === 'trainees' ? styles.activeTab : ''}`}
                onClick={() => {
                  setActiveTab('trainees');
                  setSearchQuery('');
                  setMentorFilter('all');
                  setStatusFilter('all');
                  setCurrentPage(1);
                }}
              >
                Trainees
                <span className={styles.tabCount}>{trainees.length}</span>
              </button>
            </div>

            <div className={styles.headerControls}>
              <div className={styles.searchWrap}>
                <Search size={15} className={styles.searchIcon} aria-hidden="true" />
                <input
                  type="search"
                  className={styles.searchInput}
                  placeholder={
                    activeTab === 'staff' ? 'Search mentors & managers…' : 'Search trainees…'
                  }
                  aria-label={
                    activeTab === 'staff' ? 'Search mentors and managers' : 'Search trainees'
                  }
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className={styles.searchClear}
                    onClick={() => {
                      setSearchQuery('');
                      setCurrentPage(1);
                    }}
                    aria-label="Clear search input"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </div>

              {activeTab === 'trainees' && (
                <>
                  <select
                    aria-label="Filter by mentor"
                    className={styles.filterSelect}
                    value={mentorFilter}
                    onChange={(e) => {
                      setMentorFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                  >
                    <option value="all">All mentors</option>
                    <option value="unassigned">Unassigned</option>
                    {mentorFilterOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Filter by status"
                    className={styles.filterSelect}
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </>
              )}

              <button
                type="button"
                className={styles.primaryButton}
                onClick={() =>
                  setDialog({
                    kind: activeTab === 'staff' ? 'staff' : 'trainee',
                    mode: 'create',
                  })
                }
              >
                <UserPlus size={16} aria-hidden="true" />
                {activeTab === 'staff' ? 'Add staff' : 'Add trainee'}
              </button>
            </div>
          </div>

          {activeTab === 'staff' ? (
            <div id="staff-panel" role="tabpanel" aria-labelledby="staff-tab">
              <p className={styles.cardHint}>
                Only active mentors can be assigned. Reassign their trainees before deactivating.
              </p>

              {staff.length === 0 ? (
                <div className={styles.empty} role="status">
                  <div className={styles.emptyIcon} aria-hidden="true">
                    <Users size={22} />
                  </div>
                  <h3 className={styles.emptyTitle}>No staff accounts yet</h3>
                  <p className={styles.emptyText}>Add a mentor or manager to get started.</p>
                </div>
              ) : filteredStaff.length === 0 ? (
                <div className={styles.empty} role="status">
                  <div className={styles.emptyIcon} aria-hidden="true">
                    <Search size={22} />
                  </div>
                  <h3 className={styles.emptyTitle}>No matching accounts</h3>
                  <p className={styles.emptyText}>
                    No mentors or managers matched &ldquo;{searchQuery}&rdquo;.
                  </p>
                  <button
                    type="button"
                    className={styles.clearSearchButton}
                    onClick={() => {
                      setSearchQuery('');
                      setCurrentPage(1);
                    }}
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <>
                  <ManagerStaffTable
                    staff={pagedStaff}
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
                  {totalStaffPages > 1 && (
                    <div className={styles.pagination} aria-label="Staff pagination">
                      <span className={styles.paginationInfo}>
                        Showing {(safeStaffPage - 1) * PAGE_SIZE + 1}–
                        {Math.min(safeStaffPage * PAGE_SIZE, filteredStaff.length)} of{' '}
                        {filteredStaff.length}
                      </span>
                      <div className={styles.paginationControls}>
                        <button
                          type="button"
                          className={styles.pageButton}
                          disabled={safeStaffPage <= 1}
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          aria-label="Previous page"
                        >
                          <ChevronLeft size={16} aria-hidden="true" />
                          Previous
                        </button>
                        <span className={styles.pageIndicator}>
                          Page {safeStaffPage} of {totalStaffPages}
                        </span>
                        <button
                          type="button"
                          className={styles.pageButton}
                          disabled={safeStaffPage >= totalStaffPages}
                          onClick={() => setCurrentPage((p) => Math.min(totalStaffPages, p + 1))}
                          aria-label="Next page"
                        >
                          Next
                          <ChevronRight size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div id="trainees-panel" role="tabpanel" aria-labelledby="trainees-tab">
              <p className={styles.cardHint}>
                {`Changing a mentor takes effect immediately and removes the old mentor's access.`}
              </p>

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
              ) : filteredTrainees.length === 0 ? (
                <div className={styles.empty} role="status">
                  <div className={styles.emptyIcon} aria-hidden="true">
                    <Search size={22} />
                  </div>
                  <h3 className={styles.emptyTitle}>No matching trainees</h3>
                  <p className={styles.emptyText}>
                    {searchQuery
                      ? `No trainees matched "${searchQuery}".`
                      : 'No trainees matched the selected filters.'}
                  </p>
                  <button
                    type="button"
                    className={styles.clearSearchButton}
                    onClick={() => {
                      setSearchQuery('');
                      setMentorFilter('all');
                      setStatusFilter('all');
                      setCurrentPage(1);
                    }}
                  >
                    {searchQuery ? 'Clear search' : 'Clear filters'}
                  </button>
                </div>
              ) : (
                <>
                  <ManagerTraineeTable
                    trainees={pagedTrainees}
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
                  {totalTraineePages > 1 && (
                    <div className={styles.pagination} aria-label="Trainees pagination">
                      <span className={styles.paginationInfo}>
                        Showing {(safeTraineePage - 1) * PAGE_SIZE + 1}–
                        {Math.min(safeTraineePage * PAGE_SIZE, filteredTrainees.length)} of{' '}
                        {filteredTrainees.length}
                      </span>
                      <div className={styles.paginationControls}>
                        <button
                          type="button"
                          className={styles.pageButton}
                          disabled={safeTraineePage <= 1}
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          aria-label="Previous page"
                        >
                          <ChevronLeft size={16} aria-hidden="true" />
                          Previous
                        </button>
                        <span className={styles.pageIndicator}>
                          Page {safeTraineePage} of {totalTraineePages}
                        </span>
                        <button
                          type="button"
                          className={styles.pageButton}
                          disabled={safeTraineePage >= totalTraineePages}
                          onClick={() => setCurrentPage((p) => Math.min(totalTraineePages, p + 1))}
                          aria-label="Next page"
                        >
                          Next
                          <ChevronRight size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
