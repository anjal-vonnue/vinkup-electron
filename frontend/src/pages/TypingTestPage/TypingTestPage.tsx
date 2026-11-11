import { useCallback, useEffect, useRef, useState } from 'react';
import type { TypingResultRecord, TypingTestStats } from '@itp/types';
import { getTypingResults, saveTypingResult } from '../../api/typingTest';
import { ApiError } from '../../api/errors';
import { TYPING_DURATIONS } from '../../constants/typingWords';
import { formatTimer, type PassageOptions } from '../../lib/typingStats';
import { useTypingTest } from '../../hooks/useTypingTest';
import Header from '../../components/Header';
import PassageDisplay from '../../components/PassageDisplay';
import TestHistory from '../../components/TestHistory';
import styles from './TypingTestPage.module.css';
import HelpButton from '../../components/HelpButton';

const DEFAULT_DURATION = 30;

const OPTION_LABELS: { key: keyof PassageOptions; label: string }[] = [
  { key: 'punctuation', label: 'punctuation' },
  { key: 'numbers', label: 'numbers' },
];

export default function TypingTestPage() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [results, setResults] = useState<TypingResultRecord[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [lastResult, setLastResult] = useState<TypingTestStats | null>(null);

  useEffect(() => {
    getTypingResults()
      .then(setResults)
      .catch((err: ApiError) => setLoadError(err))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Save the finished test, then reload the trainee's history.
  const handleFinish = useCallback((stats: TypingTestStats) => {
    setLastResult(stats);
    setSaveError(null);
    setIsSaving(true);

    saveTypingResult({ wpm: stats.wpm, accuracy: stats.accuracy })
      .then(() => getTypingResults())
      .then(setResults)
      .catch((err: ApiError) => setSaveError(err))
      .finally(() => setIsSaving(false));
  }, []);

  const {
    passage,
    progress,
    cursorPosition,
    status,
    secondsLeft,
    durationSeconds,
    options,
    handleKeyDown,
    restart,
    toggleOption,
    isPaused,
  } = useTypingTest(DEFAULT_DURATION, handleFinish);

  function clearMessages() {
    setLastResult(null);
    setSaveError(null);
  }

  function handleRestart(nextDuration?: number) {
    clearMessages();
    restart(nextDuration);
    inputRef.current?.focus();
  }

  function handleToggleOption(key: keyof PassageOptions) {
    clearMessages();
    toggleOption(key);
    inputRef.current?.focus();
  }

  return (
    <>
      <Header />

      <div className={styles.page}>
        <div>
          <h1 className={styles.title}>Typing Test</h1>
          <p className={styles.subtitle}>Test your typing speed and accuracy!</p>
        </div>

        <div className={styles.card}>
          <div className={styles.toolbar}>
            <div className={styles.timerGroup}>
              <span className={styles.timerLabel}>TIMER</span>
              <span className={styles.timer} role="timer" aria-live="off">
                {formatTimer(secondsLeft)}
              </span>
            </div>

            <div className={styles.controls}>
              <div className={styles.modes}>
                <span className={styles.modeLabel}>Mode:</span>

                {TYPING_DURATIONS.map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    className={seconds === durationSeconds ? styles.modeActive : styles.mode}
                    aria-pressed={seconds === durationSeconds}
                    disabled={isSaving}
                    onClick={() => handleRestart(seconds)}
                  >
                    {seconds}s
                  </button>
                ))}
              </div>

              <div className={styles.modes}>
                <span className={styles.modeLabel}>Include:</span>

                {OPTION_LABELS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    className={options[key] ? styles.modeActive : styles.mode}
                    aria-pressed={options[key]}
                    disabled={isSaving}
                    onClick={() => handleToggleOption(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.arenaWrap}>
            <div
              className={styles.arena}
              onClick={() => inputRef.current?.focus()}
              role="presentation"
            >
              <PassageDisplay
                passage={passage}
                progress={progress}
                cursorPosition={cursorPosition}
              />

              <input
                ref={inputRef}
                type="text"
                className={styles.hiddenInput}
                onKeyDown={handleKeyDown}
                onPaste={(event) => event.preventDefault()}
                onDrop={(event) => event.preventDefault()}
                readOnly={status === 'finished'}
                aria-label="Type the text shown above"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>

            {status === 'running' && isPaused && (
              <div className={styles.pauseOverlay} role="status">
                <p className={styles.pauseTitle}>PAUSED</p>
                <p className={styles.timeoutHint}>Test paused after 5 seconds of inactivity.</p>
                <p className={styles.timeoutHint}>Press any key to continue</p>
              </div>
            )}

            {status === 'finished' && (
              <div className={styles.timeoutOverlay} role="status">
                <p className={styles.timeoutTitle}>Time&apos;s up!</p>

                {lastResult && (
                  <div className={styles.resultStats}>
                    <div className={styles.resultStat}>
                      <span className={styles.resultValue}>{lastResult.wpm}</span>
                      <span className={styles.resultLabel}>WPM</span>
                    </div>

                    <div className={styles.resultStat}>
                      <span className={styles.resultValueGreen}>{lastResult.accuracy}%</span>
                      <span className={styles.resultLabel}>ACCURACY</span>
                    </div>
                  </div>
                )}

                {isSaving && <p className={styles.timeoutHint}>Saving result...</p>}

                {saveError && (
                  <p className={styles.error} role="alert">
                    Could not save your result: {saveError.message}
                  </p>
                )}

                <p className={styles.timeoutHint}>
                  Press <kbd>Enter</kbd> or Restart Test to try again
                </p>
              </div>
            )}
          </div>

          <div className={styles.footer}>
            <p className={styles.hint}>
              Press <kbd>Enter</kbd> to restart test
            </p>

            <button
              type="button"
              className={styles.restart}
              disabled={isSaving}
              onClick={() => handleRestart()}
            >
              Restart Test
            </button>
          </div>
        </div>

        {isLoading ? (
          <p className={styles.status}>Loading history...</p>
        ) : loadError ? (
          <p className={styles.status}>{loadError.message}</p>
        ) : results ? (
          <TestHistory results={results} />
        ) : null}
      </div>

      <HelpButton />
    </>
  );
}
