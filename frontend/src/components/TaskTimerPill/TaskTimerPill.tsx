import { Pause, Timer } from 'lucide-react';
import { useTaskTimer } from '../../hooks/useTaskTimer';
import styles from './TaskTimerPill.module.css';

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

type Props = {
  taskId: string;
  initialSeconds: number;
  /** Wire this to an EventTarget fed by Electron IPC from the reference window. */
  activitySignal?: EventTarget | null;
  enabled?: boolean;
};

export default function TaskTimerPill({
  taskId,
  initialSeconds,
  activitySignal,
  enabled = true,
}: Props) {
  const { displayedSeconds, isRunning } = useTaskTimer({
    taskId,
    initialSeconds,
    activitySignal,
    enabled,
  });

  return (
    <span
      className={`${styles.pill} ${isRunning ? '' : styles.paused}`}
      data-testid="task-timer"
      title={isRunning ? 'Time on task — running' : 'Time on task — paused (idle)'}
    >
      {isRunning ? <Timer size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
      {formatDuration(displayedSeconds)}
    </span>
  );
}
