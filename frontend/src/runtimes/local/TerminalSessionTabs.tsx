import { Plus, X } from 'lucide-react';
import { MAX_TERMINALS_PER_TASK } from '@itp/types';
import type { LocalTerminalSession } from './useLocalNodeSession';
import styles from './TerminalSessionTabs.module.css';

type TerminalSessionTabsProps = {
  sessions: LocalTerminalSession[];
  activeKey: string | null;
  isCreating: boolean;
  onSelect: (key: string) => void;
  onNew: () => void;
  onClose: (key: string) => void;
};

const STATUS_LABELS: Record<LocalTerminalSession['status'], string> = {
  opening: 'Starting',
  ready: 'Running',
  exited: 'Exited',
  error: 'Failed',
};

export default function TerminalSessionTabs({
  sessions,
  activeKey,
  isCreating,
  onSelect,
  onNew,
  onClose,
}: TerminalSessionTabsProps) {
  const atLimit = sessions.length >= MAX_TERMINALS_PER_TASK;

  return (
    <div className={styles.bar}>
      <div role="tablist" aria-label="Terminal sessions" className={styles.tabs}>
        {sessions.map((session) => {
          const isActive = session.key === activeKey;
          return (
            <div
              key={session.key}
              className={`${styles.tabWrap} ${isActive ? styles.tabWrapActive : ''}`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                title={`${session.name} — ${STATUS_LABELS[session.status]}`}
                className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
                onClick={() => onSelect(session.key)}
              >
                <span
                  className={styles.statusDot}
                  data-status={session.status}
                  aria-hidden="true"
                />
                <span>{session.name}</span>
                {session.status !== 'ready' && (
                  <span className={styles.statusText}>{STATUS_LABELS[session.status]}</span>
                )}
              </button>
              <button
                type="button"
                className={styles.close}
                aria-label={`Close ${session.name}`}
                title={
                  sessions.length <= 1 ? 'Keep at least one terminal open' : `Close ${session.name}`
                }
                disabled={sessions.length <= 1}
                onClick={() => onClose(session.key)}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className={styles.add}
        aria-label="New terminal"
        title={
          isCreating
            ? 'Opening terminal…'
            : atLimit
              ? `Maximum ${MAX_TERMINALS_PER_TASK} terminals — close one first`
              : 'New terminal'
        }
        disabled={isCreating}
        onClick={onNew}
      >
        <Plus size={14} aria-hidden="true" />
      </button>

      {atLimit && (
        <span className={styles.limit} role="status">
          Max {MAX_TERMINALS_PER_TASK}
        </span>
      )}
    </div>
  );
}
