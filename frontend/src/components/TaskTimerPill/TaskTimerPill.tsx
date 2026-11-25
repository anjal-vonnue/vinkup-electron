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
  /**
   * Whether the timer should start counting on mount. Fresh tasks pass true;
   * already-submitted tasks pass false so they wait for the first keystroke.
   */
  autoStart?: boolean;
};

type TaskTimerOptions = {
  taskId: string;
  initialSeconds: number;
  activitySignal?: EventTarget | null;
  enabled: boolean;
  autoStart: boolean;
};

type TaskTimerState = {
  displayedSeconds: number;
  isRunning: boolean;
};

export default function TaskTimerPill({
  taskId,
  initialSeconds,
  activitySignal,
  enabled = true,
  autoStart = false,
}: Props) {
  const typedUseTaskTimer = useTaskTimer as unknown as (
    options: TaskTimerOptions
  ) => TaskTimerState;
  const { displayedSeconds, isRunning } = typedUseTaskTimer({
    taskId,
    initialSeconds,
    activitySignal,
    enabled,
    autoStart,
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
