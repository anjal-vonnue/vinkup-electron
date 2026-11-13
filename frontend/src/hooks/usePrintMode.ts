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
  /** Temporarily suppress desktop focus alerts for a button-triggered print dialog. */
  desktopPrintException?: boolean;
};

type SavedPage = { theme: string | undefined; title: string };

function restorePage(saved: SavedPage): void {
  if (saved.theme === undefined) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = saved.theme;
  document.title = saved.title;
}

/**
 * Lets a page render a print-only view that exists only while printing:
 *
 * - `print(options)` renders the view synchronously, then opens the browser's print dialog.
 * - Printing from the browser menu (`beforeprint`) renders it with `defaults`.
 * - While printing, the page uses the light theme and the report's title. The saved theme
 *   preference is not touched (this sets `data-theme` directly, not through useTheme).
 * - `afterprint` puts the theme and title back and removes the view.
 */
export function usePrintMode<T>({
  defaults,
  documentTitle,
  desktopPrintException = false,
}: UsePrintModeOptions<T>) {
  const [job, setJob] = useState<PrintJob<T> | null>(null);

  const jobRef = useRef<PrintJob<T> | null>(null);
  const savedRef = useRef<SavedPage | null>(null);
  const desktopPrintExceptionActiveRef = useRef(false);
  const printAttemptRef = useRef(0);
  const defaultsRef = useRef(defaults);
  const titleRef = useRef(documentTitle);

  useEffect(() => {
    defaultsRef.current = defaults;
    titleRef.current = documentTitle;
  });

  const enter = useCallback((options: T) => {
    if (!savedRef.current) {
      savedRef.current = { theme: document.documentElement.dataset.theme, title: document.title };
    }
    document.documentElement.dataset.theme = 'light';
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
    if (desktopPrintExceptionActiveRef.current) {
      desktopPrintExceptionActiveRef.current = false;
      const desktop = window.desktop;
      if (desktop) {
        void desktop.window.endCertificatePrint().catch((error: unknown) => {
          console.error('[certificate] Failed to restore screen protection after printing', error);
        });
      }
    }
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
      printAttemptRef.current += 1;
      if (desktopPrintExceptionActiveRef.current) {
        desktopPrintExceptionActiveRef.current = false;
        const desktop = window.desktop;
        if (desktop) {
          void desktop.window.endCertificatePrint().catch((error: unknown) => {
            console.error(
              '[certificate] Failed to restore screen protection after leaving the page',
              error
            );
          });
        }
      }
      // Leaving the page mid-print must not leave the app stuck in the light theme.
      if (savedRef.current) {
        restorePage(savedRef.current);
        savedRef.current = null;
      }
    };
  }, [enter, leave]);

  const print = useCallback(
    async (options: T): Promise<void> => {
      enter(options);
      const attempt = ++printAttemptRef.current;
      const desktop = desktopPrintException ? window.desktop : undefined;
      try {
        if (desktop) {
          await desktop.window.beginCertificatePrint();
          if (attempt !== printAttemptRef.current) {
            await desktop.window.endCertificatePrint();
            return;
          }
          desktopPrintExceptionActiveRef.current = true;
        }
        window.print();
      } catch (error) {
        if (attempt === printAttemptRef.current) leave();
        throw error;
      }
    },
    [desktopPrintException, enter, leave]
  );

  return { printJob: job, print };
}
