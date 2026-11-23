import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { LEAVE_REASON_MAX_LENGTH, LEAVE_SUBJECT_MAX_LENGTH, type LeaveRequest } from '@itp/types';
import { createLeaveRequest, getMyLeaveRequests } from '../../api/leave';
import type { ApiError } from '../../api/errors';
import Header from '../../components/Header';
import HelpButton from '../../components/HelpButton';
import LeaveStatusBadge from '../../components/LeaveStatusBadge/LeaveStatusBadge';
import { formatIstDateTime } from '../../lib/formatDateTime';
import {
  hasLeaveFormErrors,
  validateLeaveRequestForm,
  type LeaveFormErrors,
} from '../../lib/leaveRequestForm';
import styles from './LeaveRequestsPage.module.css';

export default function LeaveRequestsPage() {
  const subjectId = useId();
  const reasonId = useId();

  const [subject, setSubject] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<LeaveFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const loadRequests = useCallback(() => {
    setIsLoading(true);
    setListError(null);
    getMyLeaveRequests()
      .then(setRequests)
      .catch((error: ApiError) => setListError(error.message))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    // isLoading starts as true, so no synchronous state update is needed here.
    getMyLeaveRequests()
      .then((loaded) => {
        if (!cancelled) setRequests(loaded);
      })
      .catch((error: ApiError) => {
        if (!cancelled) setListError(error.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateLeaveRequestForm(subject, reason);
    setErrors(found);
    setFormError(null);
    setSuccess(null);
    if (hasLeaveFormErrors(found)) return;

    setIsSaving(true);
    try {
      const created = await createLeaveRequest({ subject: subject.trim(), reason: reason.trim() });
      setRequests((current) => [created, ...current]);
      setSubject('');
      setReason('');
      setSuccess(`“${created.subject}” was submitted. Your mentor or manager will review it.`);
    } catch (error) {
      setFormError(
        (error as ApiError).message ?? 'Could not submit the request. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Header />
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <h1 className={styles.title}>Leave requests</h1>
          <p className={styles.subtitle}>
            Request time away and follow your mentor’s or manager’s decision.
          </p>
        </header>

        <section className={styles.card} aria-labelledby="leave-form-heading">
          <h2 id="leave-form-heading" className={styles.sectionTitle}>
            New request
          </h2>
          <form noValidate onSubmit={(event) => void handleSubmit(event)}>
            <div className={styles.field}>
              <label htmlFor={subjectId} className={styles.label}>
                Subject
              </label>
              <input
                id={subjectId}
                className={styles.input}
                value={subject}
                maxLength={LEAVE_SUBJECT_MAX_LENGTH}
                disabled={isSaving}
                aria-invalid={Boolean(errors.subject)}
                aria-describedby={errors.subject ? `${subjectId}-error` : undefined}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="e.g. Medical appointment"
              />
              {errors.subject && (
                <p id={`${subjectId}-error`} className={styles.fieldError} role="alert">
                  {errors.subject}
                </p>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor={reasonId} className={styles.label}>
                Reason
              </label>
              <textarea
                id={reasonId}
                className={styles.textarea}
                value={reason}
                rows={4}
                maxLength={LEAVE_REASON_MAX_LENGTH}
                disabled={isSaving}
                aria-invalid={Boolean(errors.reason)}
                aria-describedby={errors.reason ? `${reasonId}-error` : undefined}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Tell us why you need leave and when."
              />
              {errors.reason && (
                <p id={`${reasonId}-error`} className={styles.fieldError} role="alert">
                  {errors.reason}
                </p>
              )}
            </div>

            {formError && (
              <p className={styles.formError} role="alert">
                {formError}
              </p>
            )}
            {success && (
              <p className={styles.success} role="status">
                {success}
              </p>
            )}

            <div className={styles.actions}>
              <button type="submit" className={styles.primaryButton} disabled={isSaving}>
                {isSaving ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </form>
        </section>

        <section className={styles.history} aria-labelledby="leave-history-heading">
          <div className={styles.historyHeading}>
            <h2 id="leave-history-heading" className={styles.sectionTitle}>
              Your requests
            </h2>
            {!isLoading && listError === null && (
              <span className={styles.count}>{requests.length} total</span>
            )}
          </div>

          {isLoading && (
            <p className={styles.message} role="status">
              Loading your requests…
            </p>
          )}
          {!isLoading && listError !== null && (
            <div className={styles.message} role="alert">
              <p>{listError}</p>
              <button type="button" className={styles.secondaryButton} onClick={loadRequests}>
                Retry
              </button>
            </div>
          )}
          {!isLoading && listError === null && requests.length === 0 && (
            <p className={styles.message}>
              You have not submitted any leave requests yet. Use the form above to create one.
            </p>
          )}

          {!isLoading && listError === null && requests.length > 0 && (
            <ul className={styles.list}>
              {requests.map((request) => (
                <li key={request.id} className={styles.requestCard}>
                  <div className={styles.cardTop}>
                    <h3 className={styles.subject}>{request.subject}</h3>
                    <LeaveStatusBadge status={request.status} />
                  </div>
                  <p className={styles.reason}>{request.reason}</p>
                  <dl className={styles.details}>
                    <div>
                      <dt>Submitted</dt>
                      <dd>{formatIstDateTime(request.submittedAt)}</dd>
                    </div>
                    {request.reviewerName && (
                      <div>
                        <dt>Reviewed by</dt>
                        <dd>
                          {request.reviewerName}
                          {request.reviewerRole ? ` (${request.reviewerRole.toLowerCase()})` : ''}
                        </dd>
                      </div>
                    )}
                    {request.reviewedAt && (
                      <div>
                        <dt>Review date</dt>
                        <dd>{formatIstDateTime(request.reviewedAt)}</dd>
                      </div>
                    )}
                  </dl>
                  {request.feedback && (
                    <p className={styles.feedback}>
                      <strong>Feedback:</strong> {request.feedback}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <HelpButton />
    </>
  );
}
