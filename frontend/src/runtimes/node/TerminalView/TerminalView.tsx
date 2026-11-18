import { useEffect, useRef } from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { blockPasteEvents } from '../../../lib/blockPasteEvents';
import { useBlockedPasteReporter } from '../../../pages/TaskPage/hooks/useBlockedPasteReporter';
import { isPasteShortcut } from './isPasteShortcut';
import styles from './TerminalView.module.css';

type TerminalViewProps = {
  taskId: string;
  isVisible: boolean;
  onReady: (terminal: Terminal) => void;
  onResize: (cols: number, rows: number) => void;
};

/**
 * Reads terminal colors from the application's active theme.
 */
function readTheme(): ITheme {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim() || undefined;

  return {
    background: token('--color-bg-base'),
    foreground: token('--color-text-primary'),
    cursor: token('--color-accent-purple-soft'),
    selectionBackground: token('--color-accent-purple-wash'),
  };
}

export default function TerminalView({ taskId, isVisible, onReady, onResize }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const report = useBlockedPasteReporter(taskId, 'terminal');

  // The terminal is created once; these refs let it call the latest callbacks.
  const reportRef = useRef(report);
  const onReadyRef = useRef(onReady);
  const onResizeRef = useRef(onResize);

  useEffect(() => {
    reportRef.current = report;
    onReadyRef.current = onReady;
    onResizeRef.current = onResize;
  });

  // Create the terminal.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000,
      theme: readTheme(),
    });

    const fit = new FitAddon();

    terminal.loadAddon(fit);
    terminal.open(container);

    terminalRef.current = terminal;
    fitRef.current = fit;

    // FR-10: paste is blocked in the terminal too, with the same toast and PASTE_BLOCKED log.
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && isPasteShortcut(event)) {
        reportRef.current();
        return false;
      }

      return true;
    });

    const removePasteBlock = blockPasteEvents(container, () => reportRef.current());

    const fitAndReport = () => {
      // Measured while hidden, the terminal would get 0 columns.
      // Only fit a visible container.
      if (container.clientWidth === 0 || container.clientHeight === 0) return;

      fit.fit();
      onResizeRef.current(terminal.cols, terminal.rows);
    };

    fitAndReport();

    const resizeObserver = new ResizeObserver(fitAndReport);
    resizeObserver.observe(container);

    onReadyRef.current(terminal);

    return () => {
      resizeObserver.disconnect();
      removePasteBlock();
      terminal.dispose();

      terminalRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Update terminal colors whenever the application theme changes.
  useEffect(() => {
    const updateTerminalTheme = () => {
      const terminal = terminalRef.current;

      if (!terminal) return;

      terminal.options.theme = readTheme();
    };

    // Apply the current theme.
    updateTerminalTheme();

    const themeObserver = new MutationObserver(updateTerminalTheme);

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => themeObserver.disconnect();
  }, []);

  // Shown again after being hidden: the size may have changed meanwhile.
  useEffect(() => {
    const container = containerRef.current;
    const terminal = terminalRef.current;

    if (!isVisible || !container || !terminal || container.clientWidth === 0) {
      return;
    }

    fitRef.current?.fit();
    onResizeRef.current(terminal.cols, terminal.rows);
  }, [isVisible]);

  return <div ref={containerRef} className={styles.terminal} data-testid="terminal" />;
}
