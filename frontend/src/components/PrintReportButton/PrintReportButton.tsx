import { useEffect, useId, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import { DEFAULT_PRINT_OPTIONS, type PrintReportOptions } from '../../lib/printReport';
import styles from './PrintReportButton.module.css';

type PrintReportButtonProps = {
  onPrint: (options: PrintReportOptions) => void | Promise<void>;
  disabled?: boolean;
};

/** "Print report" with a small popover to choose the optional sections. */
export default function PrintReportButton({ onPrint, disabled = false }: PrintReportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<PrintReportOptions>(DEFAULT_PRINT_OPTIONS);
  const anchorRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  // Close on Esc or on a click outside the button + popover.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    const handleMouseDown = (event: MouseEvent) => {
      const anchor = anchorRef.current;
      if (anchor && !anchor.contains(event.target as Node)) setIsOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isOpen]);

  const handlePrint = () => {
    setIsOpen(false);
    // The page may save a PDF asynchronously; errors are handled there.
    void onPrint(options);
  };

  return (
    <div ref={anchorRef} className={styles.anchor}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-controls={isOpen ? popoverId : undefined}
      >
        <Printer size={16} aria-hidden="true" />
        Print report
      </button>

      {isOpen && (
        <div id={popoverId} className={styles.popover} role="dialog" aria-label="Print report">
          <p className={styles.heading}>Include in the report</p>

          <label className={styles.option}>
            <input
              type="checkbox"
              checked={options.includeJournal}
              onChange={(event) =>
                setOptions((current) => ({ ...current, includeJournal: event.target.checked }))
              }
            />
            Journal entries
          </label>

          <label className={styles.option}>
            <input
              type="checkbox"
              checked={options.includeFlags}
              onChange={(event) =>
                setOptions((current) => ({ ...current, includeFlags: event.target.checked }))
              }
            />
            Flagged events
          </label>

          <p className={styles.hint}>Print the report, or save it as a PDF.</p>

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={() => setIsOpen(false)}>
              Cancel
            </button>
            <button type="button" className={styles.print} onClick={handlePrint}>
              Print
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
