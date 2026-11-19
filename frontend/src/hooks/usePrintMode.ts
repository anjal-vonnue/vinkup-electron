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
 * Lets a page render a print-only view, hidden on screen and shown only when printing:
 *
 * - `print(options)` renders the view synchronously, then opens the browser's print dialog.
 * - Printing from the browser menu (`beforeprint`) renders it with `defaults`.
 * - `prepare(options)` / `restore()` render and remove the view for a PDF export that does not
 *   use the browser's print dialog (the desktop shell).
 * - The document title is set to the report's title while printing (browsers suggest it as
 *   the "Save as PDF" filename). The user's theme is never changed.
 * - `afterprint` puts the title back. The view stays mounted (hidden on screen) because a
 *   print pipeline can take its snapshot after `afterprint`; unmounting there prints a blank
 *   page. The next print replaces it, and `restore()` removes it once a PDF capture is done.
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

  /** Put the title back and forget the job; the rendered view stays for a late snapshot. */
  const leave = useCallback(() => {
    // Not our print (e.g. another page printed): nothing to restore.
    if (!savedRef.current && !jobRef.current) return;

    if (savedRef.current) {
      restorePage(savedRef.current);
      savedRef.current = null;
    }
    jobRef.current = null;
  }, []);

  /** Put the title back and remove the view; safe once the PDF capture has finished. */
  const clear = useCallback(() => {
    leave();
    setJob(null);
  }, [leave]);

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
      try {
        window.print();
      } catch (error) {
        // A window that refuses to open the dialog must not leave the page in print mode.
        clear();
        throw error;
      }
    },
    [enter, clear]
  );

  return { printJob: job, print, prepare: enter, restore: clear };
}
