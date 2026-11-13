import { useRef, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { ReviewStatus } from '@itp/types';
import type { SaveState } from '../../pages/TaskPage/hooks/useAutosave';
import ConfirmDialog from '../ConfirmDialog';
import styles from './SubmitTaskButton.module.css';

type SubmitTaskButtonProps = {
  taskTitle: string;
  hasSubmitted: boolean; // changes the label to "Resubmit"
  saveState: SaveState; // from useAutosave
  flush: () => Promise<boolean>; // from useAutosave
  onSubmit: () => Promise<void>; // TaskWorkspace: submitTask(task.id) + follow-up
  reviewStatus?: ReviewStatus | null;
};

const BLOCKING_STATUSES: SaveState['status'][] = ['offline', 'error', 'blocked'];
const UNSAVED_TOOLTIP = "Your latest changes aren't saved yet.";
const APPROVED_TOOLTIP = 'This task has been approved and cannot be resubmitted.';
const SAVE_FAILED_MESSAGE =
  "We couldn't save your latest changes. Check your connection and try again.";
const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

export default function SubmitTaskButton({
  taskTitle,
  hasSubmitted,
  saveState,
  flush,
  onSubmit,
  reviewStatus = null,
}: SubmitTaskButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // State updates are async, so a fast double click could pass an `isSubmitting` check twice.
  const submittingRef = useRef(false);

  const isApproved = reviewStatus === 'approved';
  const isSaveBlocked = BLOCKING_STATUSES.includes(saveState.status);

  function open() {
    if (isApproved) return;
    setError(null);
    setIsOpen(true);
  }

  async function confirm() {
    if (submittingRef.current || isApproved) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setError(null);

    try {
      // Save first: the mentor reviews the saved code, so the latest edit must be on the server.
      const isSaved = await flush();
      if (!isSaved) {
        setError(SAVE_FAILED_MESSAGE);
        return;
      }
      await onSubmit();
      setIsOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : GENERIC_ERROR_MESSAGE);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.button}
        onClick={open}
        disabled={isApproved || isSaveBlocked || isSubmitting}
        title={isApproved ? APPROVED_TOOLTIP : isSaveBlocked ? UNSAVED_TOOLTIP : undefined}
      >
        {isApproved
          ? 'Approved'
          : isSubmitting
            ? 'Submitting…'
            : hasSubmitted || reviewStatus === 'rework'
              ? 'Resubmit'
              : 'Submit Task'}
        {isSubmitting ? (
          <span className={styles.spinner} aria-hidden="true" />
        ) : isApproved ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <ArrowRight size={16} aria-hidden="true" />
        )}
      </button>

      <ConfirmDialog
        open={isOpen}
        title={reviewStatus === 'rework' ? 'Resubmit this task?' : 'Submit this task?'}
        confirmLabel={reviewStatus === 'rework' ? 'Resubmit' : 'Submit'}
        cancelLabel="Keep working"
        isConfirming={isSubmitting}
        error={error}
        onConfirm={() => void confirm()}
        onCancel={() => setIsOpen(false)}
      >
        Your mentor will review your latest saved code for &apos;{taskTitle}&apos;. You can keep
        working and submit again later.
      </ConfirmDialog>
    </>
  );
}
