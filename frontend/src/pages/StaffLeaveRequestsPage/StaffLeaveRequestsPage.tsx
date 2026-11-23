import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { LeaveRequest, LeaveStatus } from '@itp/types';
import {
  getLeaveRequestsForReviewer,
  reviewLeaveRequest,
  type LeaveReviewerArea,
} from '../../api/leave';
import { ApiError } from '../../api/errors';
import AdminHeader, { type AdminNavItem } from '../../components/AdminHeader';
import { ErrorState } from '../../components/Common/ErrorState';
import LoaderOverlay from '../../components/Common/LoadingState';
import LeaveReviewHistory from '../../components/LeaveReviewHistory';
import LeaveStatusBadge from '../../components/LeaveStatusBadge/LeaveStatusBadge';
import { useToast } from '../../components/Toast';
import { formatIstDateTime } from '../../lib/formatDateTime';
import styles from './StaffLeaveRequestsPage.module.css';

type StatusFilter = 'ALL' | LeaveStatus;

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Rejected' },
];

type StaffLeaveRequestsPageProps = {
  /** Determines the API guard and whether the assigned Mentor column is shown. */
  area: LeaveReviewerArea;
};

/** One review UI for both roles; only the data scope and header differ. */
export default function StaffLeaveRequestsPage({ area }: StaffLeaveRequestsPageProps) {
  const isManager = area === 'manager';
  const toast = useToast();
  const feedbackId = useId();

  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);

  const reload = useCallback(async () => {
    const data = await getLeaveRequestsForReviewer(area);
    setRequests(data);
    return data;
  }, [area]);

  useEffect(() => {
    let cancelled = false;
    getLeaveRequestsForReviewer(area)
      .then((data) => {
        if (!cancelled) setRequests(data);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught : new Error('Something went wrong.'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [area, attempt]);

  const visible = useMemo(
    () =>
      statusFilter === 'ALL'
        ? (requests ?? [])
        : (requests ?? []).filter((request) => request.status === statusFilter),
    [requests, statusFilter]
  );

  const counts = useMemo(() => {
    const all = requests ?? [];
    return {
      ALL: all.length,
      PENDING: all.filter((request) => request.status === 'PENDING').length,
      APPROVED: all.filter((request) => request.status === 'APPROVED').length,
      REJECTED: all.filter((request) => request.status === 'REJECTED').length,
    } satisfies Record<StatusFilter, number>;
  }, [requests]);

  const selected = requests?.find((request) => request.id === selectedId) ?? null;

  /**
   * A Manager may reject a Mentor approval or override a Mentor rejection
   * (approve or re-reject). Nobody else may change a decided request.
   */
  const canReview = (request: LeaveRequest) =>
    request.status === 'PENDING' ||
    (isManager && (request.status === 'APPROVED' || request.status === 'REJECTED'));

  const openRequest = (request: LeaveRequest) => {
    setSelectedId(request.id);
    setFeedback('');
    setFeedbackError(null);
    setReviewError(null);
  };

  const closeDialog = () => {
    if (isReviewing) return;
    setSelectedId(null);
    setFeedback('');
    setFeedbackError(null);
    setReviewError(null);
  };

  const submitReview = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!selected) return;
    const note = feedback.trim();
    if (decision === 'REJECTED' && note.length === 0) {
      setFeedbackError('Add feedback before rejecting the request.');
      return;
    }

    setIsReviewing(true);
    setFeedbackError(null);
    setReviewError(null);
    try {
      const updated = await reviewLeaveRequest(area, selected.id, {
        decision,
        ...(note.length > 0 ? { feedback: note } : {}),
      });
      setRequests(
        (current) =>
          current?.map((request) => (request.id === updated.id ? updated : request)) ?? null
      );
      setFeedback('');
      setFeedbackError(null);
      setReviewError(null);
      setSelectedId(null);
      toast.show({
        message: `Leave request ${decision === 'APPROVED' ? 'approved' : 'rejected'}.`,
        variant: 'success',
      });
    } catch (caught: unknown) {
      const apiError = caught instanceof ApiError ? caught : null;
      if (apiError?.code === 'ALREADY_REVIEWED') {
        // Someone else decided first: refresh so the table no longer says PENDING.
        try {
          const fresh = await reload();
          const current = fresh.find((request) => request.id === selected.id);
          if (current) setSelectedId(current.id);
        } catch {
          setAttempt((n) => n + 1);
        }
      }
      setReviewError(apiError?.message ?? 'Could not review the request. Please try again.');
    } finally {
      setIsReviewing(false);
    }
  };

  const navItems: AdminNavItem[] = isManager
    ? [
        { to: '/manager', label: 'Users & assignments', end: true },
        { to: '/manager/leave-requests', label: 'Leave requests', end: true },
        { to: '/manager/verify-certificate', label: 'Verify certificate', end: true },
      ]
    : [
        { to: '/admin', label: 'My trainees', end: true },
        { to: '/admin/leave-requests', label: 'Leave requests', end: true },
        { to: '/admin/verify-certificate', label: 'Verify certificate', end: true },
      ];

  const header = (
    <AdminHeader
      homePath={isManager ? '/manager' : '/admin'}
      badge={isManager ? 'Manager view' : 'Mentor view'}
      navItems={navItems}
      navLabel={isManager ? 'Manager navigation' : 'Mentor navigation'}
    />
  );

  if (error) {
    return (
      <>
        {header}
        <main className={styles.page}>
          <ErrorState
            fullPage
            title="Unable to load leave requests"
            message={error.message}
            onRetry={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
          />
        </main>
      </>
    );
  }

  if (requests === null) {
    return (
      <>
        {header}
        <main className={styles.page}>
          <LoaderOverlay label="Loading leave requests…" />
        </main>
      </>
    );
  }

  const subtitle = isManager
    ? 'Every leave request submitted by a Trainee. Review pending requests, reject a Mentor approval, or override a Mentor rejection.'
    : 'Requests from Trainees assigned to you. You can review pending requests.';

  return (
    <>
      {header}
      <main className={styles.page}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Leave requests</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>

        <div className={styles.filters} role="group" aria-label="Filter by status">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`${styles.filter} ${statusFilter === filter.id ? styles.filterActive : ''}`}
              aria-pressed={statusFilter === filter.id}
              onClick={() => setStatusFilter(filter.id)}
            >
              {filter.label} <span className={styles.filterCount}>{counts[filter.id]}</span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className={styles.empty}>
            {counts.ALL === 0
              ? 'No leave requests have been submitted yet.'
              : `No ${statusFilter.toLowerCase()} leave requests.`}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Trainee</th>
                  {isManager && <th scope="col">Assigned Mentor</th>}
                  <th scope="col">Subject</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className={styles.srOnly}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((request) => (
                  <tr key={request.id}>
                    <td className={styles.strong}>{request.traineeName}</td>
                    {isManager && (
                      <td>
                        {request.assignedMentor?.name ?? <span className={styles.muted}>—</span>}
                      </td>
                    )}
                    <td>{request.subject}</td>
                    <td>{formatIstDateTime(request.submittedAt)}</td>
                    <td>
                      <LeaveStatusBadge status={request.status} />
                    </td>
                    <td className={styles.actions}>
                      <button
                        type="button"
                        className={styles.viewButton}
                        onClick={() => openRequest(request)}
                      >
                        {canReview(request) ? 'Review' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {selected && (
        <div className={styles.overlay} role="presentation" onMouseDown={closeDialog}>
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-detail-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.dialogHeader}>
              <div>
                <h2 id="leave-detail-title" className={styles.dialogTitle}>
                  {selected.subject}
                </h2>
                <p className={styles.dialogSubtitle}>
                  Submitted by {selected.traineeName} on {formatIstDateTime(selected.submittedAt)}
                </p>
              </div>
              <LeaveStatusBadge status={selected.status} />
            </div>

            <dl className={styles.details}>
              {isManager && (
                <div>
                  <dt>Assigned Mentor</dt>
                  <dd>{selected.assignedMentor?.name ?? 'Not assigned'}</dd>
                </div>
              )}
              <div className={styles.reasonBlock}>
                <dt>Reason</dt>
                <dd>{selected.reason}</dd>
              </div>
            </dl>

            <LeaveReviewHistory reviews={selected.reviews} />

            {reviewError && (
              <p className={styles.reviewError} role="alert">
                {reviewError}
              </p>
            )}

            {canReview(selected) ? (
              <div className={styles.reviewForm}>
                {isManager && selected.status === 'APPROVED' && (
                  <p className={styles.subtitle}>
                    A Mentor approved this request. Add feedback to reject it.
                  </p>
                )}
                {isManager && selected.status === 'REJECTED' && (
                  <p className={styles.subtitle}>
                    A Mentor rejected this request. You can approve it or record your own rejection.
                  </p>
                )}
                <label htmlFor={feedbackId} className={styles.label}>
                  Feedback / note
                </label>
                <textarea
                  id={feedbackId}
                  className={styles.textarea}
                  value={feedback}
                  rows={3}
                  disabled={isReviewing}
                  aria-invalid={Boolean(feedbackError)}
                  aria-describedby={feedbackError ? `${feedbackId}-error` : undefined}
                  placeholder="Add feedback (required when rejecting)."
                  onChange={(event) => {
                    setFeedback(event.target.value);
                    setFeedbackError(null);
                  }}
                />
                {feedbackError && (
                  <p id={`${feedbackId}-error`} className={styles.fieldError} role="alert">
                    {feedbackError}
                  </p>
                )}
                <div className={styles.dialogActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={isReviewing}
                    onClick={closeDialog}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.rejectButton}
                    disabled={isReviewing}
                    onClick={() => void submitReview('REJECTED')}
                  >
                    Reject
                  </button>
                  {(selected.status === 'PENDING' ||
                    (isManager && selected.status === 'REJECTED')) && (
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={isReviewing}
                      onClick={() => void submitReview('APPROVED')}
                    >
                      {isReviewing ? 'Saving…' : 'Approve'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.dialogActions}>
                <button type="button" className={styles.secondaryButton} onClick={closeDialog}>
                  Close
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
