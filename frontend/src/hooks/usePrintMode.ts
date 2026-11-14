import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

export type PrintJob<T> = {
  options: T;
  /** When printing started; shown on the printout as "Generated …". */
  startedAt: Date;
};

type UsePrintModeOptions<T> = {
  /** Used when printing starts from the browser (Ctrl/Cmd+P) instead of our button. */
  defaults: T;
  /** Tab title while printing; browsers suggest it as the "Save as PDF" file name. */
  documentTitle: string;
};

type SavedPage = { title: string };

function restorePage(saved: SavedPage): void {
  document.title = saved.title;
}

/**
 * Lets a page render a print-only view that exists only while printing:
 *
 * - `print(options)` renders the view synchronously, then opens the browser's print dialog.
 * - Printing from the browser menu (`beforeprint`) renders it with `defaults`.
 * - The document title is set to the report's title while printing (browsers suggest it as
 *   the "Save as PDF" filename). The user's theme is never changed.
 * - `afterprint` puts the title back and removes the view.
 */
export function usePrintMode<T>({ defaults, documentTitle }: UsePrintModeOptions<T>) {
  const [job, setJob] = useState<PrintJob<T> | null>(null);

  const jobRef = useRef<PrintJob<T> | null>(null);
  const savedRef = useRef<SavedPage | null>(null);
  const defaultsRef = useRef(defaults);
  const titleRef = useRef(documentTitle);

  useEffect(() => {
    defaultsRef.current = defaults;
    titleRef.current = documentTitle;
  });

  const enter = useCallback((options: T) => {
    if (!savedRef.current) {
      savedRef.current = { title: document.title };
    }
    document.title = titleRef.current;

    const next: PrintJob<T> = { options, startedAt: new Date() };
    jobRef.current = next;
    // The print snapshot is taken right after this returns, so the view must be in the DOM now.
    flushSync(() => setJob(next));
  }, []);

  const leave = useCallback(() => {
    if (savedRef.current) {
      restorePage(savedRef.current);
      savedRef.current = null;
    }
    jobRef.current = null;
    setJob(null);
  }, []);

  useEffect(() => {
    const handleBeforePrint = () => {
      if (!jobRef.current) enter(defaultsRef.current);
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', leave);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', leave);
      // Leaving the page mid-print must not leave the title stuck on the PDF name.
      if (savedRef.current) {
        restorePage(savedRef.current);
        savedRef.current = null;
      }
    };
  }, [enter, leave]);

  const print = useCallback(
    (options: T) => {
      enter(options);
      window.print();
    },
    [enter]
  );

  return { printJob: job, print, prepare: enter, restore: leave };
}
