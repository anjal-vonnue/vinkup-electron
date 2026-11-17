import type { ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, Timer, Play, AlertCircle } from 'lucide-react';
import type { ReviewStatus } from '@itp/types';
import type { PaneId } from '../../types/workspaceTypes';
import type { Runner } from '../../runtimes/runnerContext';
import ViewToggleGroup from '../ViewToggleGroup';
import { formatMinutes } from '../../lib/formatMinutes';
import styles from './TaskToolbar.module.css';

export type TaskToolbarProps = {
  estimatedMinutes: number | null;
  visiblePanes: Record<PaneId, boolean>;
  onTogglePane: (pane: PaneId) => void;
  onBack: () => void;
  onRun: () => void;
  runner: Runner;
  saveIndicator: ReactNode;
  submitSlot: ReactNode;
  /** Submitted at least once (this visit, or the task was already completed) */
  hasSubmitted?: boolean;
  /** When it was submitted in this visit; null when only the task's status says so */
  submittedAt?: Date | null;
  /** Admin review status */
  reviewStatus?: ReviewStatus | null;
  /** Triggered when the rework indicator is clicked to view feedback */
  onViewFeedback?: () => void;
};

/** 14:32 */
function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function TaskToolbar({
  estimatedMinutes,
  visiblePanes,
  onTogglePane,
  onBack,
  onRun,
  runner,
  saveIndicator,
  submitSlot,
  hasSubmitted = false,
  submittedAt = null,
  reviewStatus = null,
  onViewFeedback,
}: TaskToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <button type="button" className={styles.backButton} onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        Back to tasks
      </button>

      {estimatedMinutes !== null && (
        <span className={styles.estimatePill}>
          <Timer size={14} aria-hidden="true" />
          Est: {formatMinutes(estimatedMinutes)}
        </span>
      )}

      {reviewStatus === 'rework' && (
        <button
          type="button"
          className={`${styles.estimatePill} ${styles.reworkPill}`}
          onClick={onViewFeedback}
          title="Modifications requested. Click to view feedback."
        >
          <AlertCircle size={14} aria-hidden="true" className={styles.reworkIcon} />
          Rework requested
        </button>
      )}

      {reviewStatus === 'approved' && (
        <span className={`${styles.estimatePill} ${styles.approvedPill}`}>
          <CheckCircle2 size={14} aria-hidden="true" className={styles.approvedIcon} />
          Approved
        </span>
      )}

      {reviewStatus !== 'rework' && reviewStatus !== 'approved' && hasSubmitted && (
        <span className={styles.estimatePill}>
          <CheckCircle2 size={14} aria-hidden="true" className={styles.submittedIcon} />
          {submittedAt ? `Submitted ${formatClock(submittedAt)}` : 'Submitted'}
        </span>
      )}

      <div className={styles.spacer} />

      <ViewToggleGroup visiblePanes={visiblePanes} onToggle={onTogglePane} />

      <div className={styles.divider} aria-hidden="true" />

      <button
        type="button"
        className={styles.runButton}
        onClick={onRun}
        disabled={!runner.canRun}
        title={runner.title}
      >
        {runner.isRunning ? (
          <span className={styles.runSpinner} aria-hidden="true" />
        ) : (
          <Play size={14} aria-hidden="true" />
        )}
        {runner.label}
      </button>

      {saveIndicator}
      {submitSlot}
    </div>
  );
}
