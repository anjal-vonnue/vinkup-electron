import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { TypingTestStats } from '@itp/types';

import {
  buildPassage,
  calculateTypingStatsFromProgress,
  DEFAULT_PASSAGE_OPTIONS,
  type PassageOptions,
  type TypingProgress,
} from '../lib/typingStats';

export type TypingStatus = 'idle' | 'running' | 'finished';

const TICK_MS = 200;
const EXTEND_THRESHOLD = 300;
const INACTIVITY_MS = 5000;

function createEmptyProgress(length: number): TypingProgress {
  return {
    typedCharacters: Array<string | null>(length).fill(null),
    skippedPositions: new Set<number>(),
    extraCharactersByPosition: {},
    correctedMistakes: 0,
  };
}

export function useTypingTest(initialDuration: number, onFinish: (stats: TypingTestStats) => void) {
  const [initialState] = useState(() => {
    const initialPassage = buildPassage(initialDuration, DEFAULT_PASSAGE_OPTIONS);

    return {
      passage: initialPassage,
      progress: createEmptyProgress(initialPassage.length),
    };
  });

  const [durationSeconds, setDurationSeconds] = useState(initialDuration);
  const [options, setOptions] = useState<PassageOptions>(DEFAULT_PASSAGE_OPTIONS);

  const [passage, setPassage] = useState(initialState.passage);
  const [progress, setProgress] = useState(initialState.progress);

  const [cursorPosition, setCursorPosition] = useState(0);
  const [status, setStatus] = useState<TypingStatus>('idle');
  const [secondsLeft, setSecondsLeft] = useState(initialDuration);
  const [isPaused, setIsPaused] = useState(false);

  const passageRef = useRef(passage);
  const progressRef = useRef(progress);
  const cursorRef = useRef(0);

  const startedAtRef = useRef(0);
  const lastInputAtRef = useRef(0);
  const pausedAtRef = useRef(0);

  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const updateProgress = useCallback((next: TypingProgress) => {
    progressRef.current = next;
    setProgress(next);
  }, []);

  const updateCursor = useCallback((next: number) => {
    cursorRef.current = next;
    setCursorPosition(next);
  }, []);

  const startTest = useCallback((now: number) => {
    if (startedAtRef.current !== 0) return;

    startedAtRef.current = now;
    lastInputAtRef.current = now;
    setStatus('running');
  }, []);

  const finish = useCallback(() => {
    if (finishedRef.current || startedAtRef.current === 0) return;

    finishedRef.current = true;

    const elapsed = Math.min((Date.now() - startedAtRef.current) / 1000, durationSeconds);

    setStatus('finished');
    setSecondsLeft(0);

    const stats = calculateTypingStatsFromProgress(
      passageRef.current,
      progressRef.current,
      elapsed
    );

    onFinishRef.current(stats);
  }, [durationSeconds]);

  // Handles the countdown and inactivity pause.
  useEffect(() => {
    if (status !== 'running' || isPaused) return;

    const timer = window.setInterval(() => {
      const now = Date.now();
      const elapsed = (now - startedAtRef.current) / 1000;
      const remaining = durationSeconds - elapsed;

      if (remaining <= 0) {
        window.clearInterval(timer);
        finish();
        return;
      }

      if (now - lastInputAtRef.current >= INACTIVITY_MS) {
        window.clearInterval(timer);
        pausedAtRef.current = now;
        setIsPaused(true);
        return;
      }

      setSecondsLeft(Math.ceil(remaining));
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [status, isPaused, durationSeconds, finish]);

  // Extends the passage before the cursor reaches its end.
  const extendPassageIfNeeded = useCallback(
    (nextCursor: number) => {
      const currentPassage = passageRef.current;

      if (currentPassage.length - nextCursor > EXTEND_THRESHOLD) {
        return;
      }

      const chunk = buildPassage(durationSeconds, options);
      const nextPassage = `${currentPassage} ${chunk}`;

      passageRef.current = nextPassage;
      setPassage(nextPassage);

      const additionalLength = nextPassage.length - currentPassage.length;

      updateProgress({
        ...progressRef.current,
        typedCharacters: [
          ...progressRef.current.typedCharacters,
          ...Array<string | null>(additionalLength).fill(null),
        ],
      });
    },
    [durationSeconds, options, updateProgress]
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (status === 'finished' || isPaused) return;

      const key = event.key;

      if (key.length !== 1 && key !== 'Backspace') {
        return;
      }

      event.preventDefault();

      const currentPassage = passageRef.current;
      const currentProgress = progressRef.current;
      const cursor = cursorRef.current;

      if (key === 'Backspace') {
        if (cursor === 0) return;

        const now = Date.now();
        const previousPosition = cursor - 1;
        const previousCharacter = currentProgress.typedCharacters[previousPosition];

        const wasIncorrect =
          previousCharacter != null &&
          currentPassage[previousPosition] !== ' ' &&
          previousCharacter !== currentPassage[previousPosition];

        const nextCharacters = [...currentProgress.typedCharacters];

        const nextSkipped = new Set(currentProgress.skippedPositions);

        nextCharacters[previousPosition] = null;
        nextSkipped.delete(previousPosition);

        updateProgress({
          ...currentProgress,
          typedCharacters: nextCharacters,
          skippedPositions: nextSkipped,
          correctedMistakes: currentProgress.correctedMistakes + (wasIncorrect ? 1 : 0),
        });

        updateCursor(previousPosition);

        if (status === 'running') {
          lastInputAtRef.current = now;
        }

        return;
      }

      const now = Date.now();

      // Space advances to the next word and marks unfinished characters as missed.
      if (key === ' ') {
        const wordStart = currentPassage.lastIndexOf(' ', cursor - 1) + 1;

        const wordEnd = currentPassage.indexOf(' ', cursor);

        // Ignore leading and repeated spaces.
        if (cursor === wordStart) return;

        startTest(now);
        lastInputAtRef.current = now;

        const nextCharacters = [...currentProgress.typedCharacters];

        const nextSkipped = new Set(currentProgress.skippedPositions);

        if (currentPassage[cursor] === ' ') {
          nextCharacters[cursor] = ' ';
        } else {
          const end = wordEnd === -1 ? currentPassage.length : wordEnd;

          for (let i = cursor; i < end; i++) {
            nextSkipped.add(i);
          }

          if (end < currentPassage.length) {
            nextCharacters[end] = ' ';
          }
        }

        updateProgress({
          ...currentProgress,
          typedCharacters: nextCharacters,
          skippedPositions: nextSkipped,
        });

        const end = wordEnd === -1 ? currentPassage.length : wordEnd;

        const nextCursor = Math.min(end + 1, currentPassage.length);

        updateCursor(nextCursor);
        extendPassageIfNeeded(nextCursor);

        return;
      }

      // Ignore letters typed at a word boundary.
      if (cursor >= currentPassage.length || currentPassage[cursor] === ' ') {
        return;
      }

      startTest(now);
      lastInputAtRef.current = now;

      const nextCharacters = [...currentProgress.typedCharacters];

      const nextSkipped = new Set(currentProgress.skippedPositions);

      nextCharacters[cursor] = key;
      nextSkipped.delete(cursor);

      updateProgress({
        ...currentProgress,
        typedCharacters: nextCharacters,
        skippedPositions: nextSkipped,
      });

      const nextCursor = cursor + 1;

      updateCursor(nextCursor);
      extendPassageIfNeeded(nextCursor);
    },
    [status, isPaused, startTest, updateProgress, updateCursor, extendPassageIfNeeded]
  );

  // Resets the test and all its progress.
  const reset = useCallback((nextDuration: number, nextOptions: PassageOptions) => {
    const nextPassage = buildPassage(nextDuration, nextOptions);

    const nextProgress = createEmptyProgress(nextPassage.length);

    passageRef.current = nextPassage;
    progressRef.current = nextProgress;
    cursorRef.current = 0;

    finishedRef.current = false;

    setDurationSeconds(nextDuration);
    setOptions(nextOptions);

    setPassage(nextPassage);
    setProgress(nextProgress);

    setCursorPosition(0);
    setStatus('idle');
    setSecondsLeft(nextDuration);
    setIsPaused(false);

    startedAtRef.current = 0;
    lastInputAtRef.current = 0;
    pausedAtRef.current = 0;
  }, []);

  const restart = useCallback(
    (nextDuration: number = durationSeconds) => {
      reset(nextDuration, options);
    },
    [durationSeconds, options, reset]
  );

  const toggleOption = useCallback(
    (key: keyof PassageOptions) => {
      reset(durationSeconds, {
        ...options,
        [key]: !options[key],
      });
    },
    [durationSeconds, options, reset]
  );

  // Pauses elapsed time until the next key press.
  useEffect(() => {
    if (!isPaused) return;

    function onKeyDown(event: KeyboardEvent) {
      event.preventDefault();

      const now = Date.now();

      startedAtRef.current += now - pausedAtRef.current;
      lastInputAtRef.current = now;

      setIsPaused(false);
    }

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isPaused]);

  // Enter restarts the test.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Enter' || event.repeat || isPaused) {
        return;
      }

      if (event.target instanceof HTMLButtonElement) {
        return;
      }

      event.preventDefault();
      restart();
    }

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [restart, isPaused]);

  return {
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
  };
}
