import { CheckCircle2, Clock } from 'lucide-react';
import { useSessionTimer } from '../../hooks/useSessionTimer';
import { describeElapsed, formatElapsed } from '../../lib/formatElapsed';
import styles from './SessionTimer.module.css';

type SessionTimerProps = {
  /** True while the task is submitted (waiting for review or approved): the clock stops. */
  isStopped?: boolean;
};

/** Time spent on the open task in this visit. Give it `key={taskId}` so it restarts per task. */
export default function SessionTimer({ isStopped = false }: SessionTimerProps) {
  const elapsedSeconds = useSessionTimer(isStopped);

  if (isStopped) {
    // Counted time means it was submitted in this visit; 0 means it was opened already submitted.
    const hasTime = elapsedSeconds > 0;
    const text = hasTime ? `Submitted in ${formatElapsed(elapsedSeconds)}` : 'Submitted';
    const spoken = hasTime ? `Submitted in ${describeElapsed(elapsedSeconds)}` : 'Submitted';

    return (
      <span className={styles.timer} role="status" aria-label={spoken} title="Task submitted.">
        <CheckCircle2 size={14} aria-hidden="true" className={styles.submittedIcon} />
        <span>{text}</span>
      </span>
    );
  }

  return (
    <span
      className={styles.timer}
      role="timer"
      aria-label={`Time on this task: ${describeElapsed(elapsedSeconds)}`}
      title="Time on this task. Pauses when you leave the tab."
    >
      <Clock size={14} aria-hidden="true" />
      <span className={styles.value}>{formatElapsed(elapsedSeconds)}</span>
    </span>
  );
}
