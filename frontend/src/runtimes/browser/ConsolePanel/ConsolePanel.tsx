import { useLayoutEffect, useRef } from 'react';
import { Ban, DatabaseZap } from 'lucide-react';
import type { ConsoleEntry, ConsoleLevel } from '../../previewConsole';
import { formatTimestamp } from './formatTimestamp';
import styles from './ConsolePanel.module.css';

type ConsolePanelProps = {
  entries: ConsoleEntry[];
  onClear: () => void;
  onResetStorage: () => void;
};

const STICK_TO_BOTTOM_PX = 24;

const ROW_CLASS: Record<ConsoleLevel, string> = {
  log: styles.row,
  debug: styles.row,
  info: `${styles.row} ${styles.info}`,
  system: `${styles.row} ${styles.info}`,
  warn: `${styles.row} ${styles.warn}`,
  error: `${styles.row} ${styles.error}`,
  runtime: `${styles.row} ${styles.error}`,
  build: `${styles.row} ${styles.error}`,
};

export default function ConsolePanel({ entries, onClear, onResetStorage }: ConsolePanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    isAtBottomRef.current =
      list.scrollHeight - list.scrollTop - list.clientHeight <= STICK_TO_BOTTOM_PX;
  }

  // Follow new output only if the trainee was already at the bottom (not reading older lines).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && isAtBottomRef.current) list.scrollTop = list.scrollHeight;
  }, [entries]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>CONSOLE</span>
        <div className={styles.headerActions}>
          <button type="button" aria-label="Clear console" title="Clear console" onClick={onClear}>
            <Ban size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Reset localStorage"
            title="Reset localStorage"
            onClick={onResetStorage}
          >
            <DatabaseZap size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div ref={listRef} className={styles.list} onScroll={handleScroll}>
        {entries.length === 0 ? (
          <p className={styles.empty}>Console output from your page appears here.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className={ROW_CLASS[entry.level]} data-level={entry.level}>
              <span className={styles.time}>{formatTimestamp(entry.ts)}</span>
              <span className={styles.tagCell}>
                <span className={styles.tag}>{entry.level}</span>
              </span>
              <span className={styles.message}>
                {entry.text}
                {entry.source && <span className={styles.source}> {entry.source}</span>}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
