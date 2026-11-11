import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { TypingTestStats } from '@itp/types';

import { useTypingTest } from './useTypingTest';

function pressKey(
  handleKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void,
  key: string
) {
  const event = {
    key,
    preventDefault: vi.fn(),
  } as unknown as ReactKeyboardEvent<HTMLInputElement>;

  act(() => {
    handleKeyDown(event);
  });

  return event;
}

describe('useTypingTest', () => {
  let onFinish: (stats: TypingTestStats) => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-11T10:00:00'));

    onFinish = vi.fn<(stats: TypingTestStats) => void>();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('initializes the typing test correctly', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      expect(result.current.passage.length).toBeGreaterThan(0);
      expect(result.current.cursorPosition).toBe(0);
      expect(result.current.status).toBe('idle');
      expect(result.current.secondsLeft).toBe(30);
      expect(result.current.durationSeconds).toBe(30);
      expect(result.current.isPaused).toBe(false);

      expect(result.current.progress.typedCharacters).toHaveLength(result.current.passage.length);

      expect(result.current.progress.typedCharacters.every((character) => character === null)).toBe(
        true
      );

      expect(result.current.progress.skippedPositions.size).toBe(0);
      expect(result.current.progress.correctedMistakes).toBe(0);
    });
  });

  describe('typing', () => {
    it('records a correctly typed character', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      const expectedCharacter = result.current.passage[0];

      pressKey(result.current.handleKeyDown, expectedCharacter);

      expect(result.current.progress.typedCharacters[0]).toBe(expectedCharacter);
      expect(result.current.cursorPosition).toBe(1);
      expect(result.current.status).toBe('running');
    });

    it('records an incorrectly typed character', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      const expectedCharacter = result.current.passage[0];
      const incorrectCharacter = expectedCharacter === 'a' ? 'b' : 'a';

      pressKey(result.current.handleKeyDown, incorrectCharacter);

      expect(result.current.progress.typedCharacters[0]).toBe(incorrectCharacter);
      expect(result.current.cursorPosition).toBe(1);
    });

    it('does not start the timer for an invalid key', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      pressKey(result.current.handleKeyDown, 'Shift');

      expect(result.current.status).toBe('idle');
      expect(result.current.cursorPosition).toBe(0);
    });

    it('starts the countdown after the first valid character', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      pressKey(result.current.handleKeyDown, result.current.passage[0]);

      expect(result.current.status).toBe('running');

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.secondsLeft).toBe(29);
    });

    it('ignores letters when the cursor reaches a word boundary', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      const firstSpace = result.current.passage.indexOf(' ');

      expect(firstSpace).toBeGreaterThan(0);

      for (let i = 0; i < firstSpace; i++) {
        pressKey(result.current.handleKeyDown, result.current.passage[i]);
      }

      expect(result.current.cursorPosition).toBe(firstSpace);

      const cursorBefore = result.current.cursorPosition;

      pressKey(result.current.handleKeyDown, 'x');

      expect(result.current.cursorPosition).toBe(cursorBefore);
      expect(result.current.progress.typedCharacters[firstSpace]).toBeNull();
    });
  });

  describe('word navigation', () => {
    it('ignores leading spaces', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      pressKey(result.current.handleKeyDown, ' ');

      expect(result.current.cursorPosition).toBe(0);
      expect(result.current.status).toBe('idle');
    });

    it('advances to the next word when Space is pressed', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      const firstSpace = result.current.passage.indexOf(' ');

      for (let i = 0; i < firstSpace; i++) {
        pressKey(result.current.handleKeyDown, result.current.passage[i]);
      }

      pressKey(result.current.handleKeyDown, ' ');

      expect(result.current.cursorPosition).toBe(firstSpace + 1);
      expect(result.current.progress.typedCharacters[firstSpace]).toBe(' ');
    });

    it('marks unfinished characters as missed when skipping a word', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      const firstSpace = result.current.passage.indexOf(' ');

      // Type only the first character.
      pressKey(result.current.handleKeyDown, result.current.passage[0]);

      // Skip the rest of the word.
      pressKey(result.current.handleKeyDown, ' ');

      expect(result.current.cursorPosition).toBe(firstSpace + 1);

      for (let i = 1; i < firstSpace; i++) {
        expect(result.current.progress.skippedPositions.has(i)).toBe(true);
      }
    });

    it('ignores repeated spaces', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      const firstSpace = result.current.passage.indexOf(' ');

      // Complete the first word and advance.
      for (let i = 0; i < firstSpace; i++) {
        pressKey(result.current.handleKeyDown, result.current.passage[i]);
      }

      pressKey(result.current.handleKeyDown, ' ');

      const cursorAfterAdvance = result.current.cursorPosition;

      // Try pressing Space again at the beginning of the next word.
      pressKey(result.current.handleKeyDown, ' ');

      expect(result.current.cursorPosition).toBe(cursorAfterAdvance);
    });
  });

  describe('backspace', () => {
    it('moves the cursor backwards and clears the previous character', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      pressKey(result.current.handleKeyDown, result.current.passage[0]);

      pressKey(result.current.handleKeyDown, 'Backspace');

      expect(result.current.cursorPosition).toBe(0);
      expect(result.current.progress.typedCharacters[0]).toBeNull();
    });

    it('increments correctedMistakes when deleting an incorrect character', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      const expectedCharacter = result.current.passage[0];
      const incorrectCharacter = expectedCharacter === 'a' ? 'b' : 'a';

      pressKey(result.current.handleKeyDown, incorrectCharacter);
      pressKey(result.current.handleKeyDown, 'Backspace');

      expect(result.current.progress.correctedMistakes).toBe(1);
      expect(result.current.progress.typedCharacters[0]).toBeNull();
    });

    it('does not increment correctedMistakes for a correct character', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      pressKey(result.current.handleKeyDown, result.current.passage[0]);

      pressKey(result.current.handleKeyDown, 'Backspace');

      expect(result.current.progress.correctedMistakes).toBe(0);
    });

    it('does nothing when Backspace is pressed at the beginning', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      pressKey(result.current.handleKeyDown, 'Backspace');

      expect(result.current.cursorPosition).toBe(0);
      expect(result.current.status).toBe('idle');
    });
  });

  describe('inactivity pause', () => {
    it('pauses after five seconds of inactivity', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      pressKey(result.current.handleKeyDown, result.current.passage[0]);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.isPaused).toBe(true);
    });

    it('resumes when any key is pressed without typing that key', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      pressKey(result.current.handleKeyDown, result.current.passage[0]);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.isPaused).toBe(true);

      const cursorBeforeResume = result.current.cursorPosition;

      act(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'x',
            bubbles: true,
          })
        );
      });

      expect(result.current.isPaused).toBe(false);
      expect(result.current.cursorPosition).toBe(cursorBeforeResume);
    });
  });

  describe('completion', () => {
    it('finishes when the countdown reaches zero', () => {
      const { result } = renderHook(() => useTypingTest(5, onFinish));

      pressKey(result.current.handleKeyDown, result.current.passage[0]);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.status).toBe('finished');
      expect(result.current.secondsLeft).toBe(0);
      expect(onFinish).toHaveBeenCalledTimes(1);

      expect(onFinish).toHaveBeenCalledTimes(1);

      const stats = vi.mocked(onFinish).mock.calls[0][0];

      expect(typeof stats.wpm).toBe('number');
      expect(typeof stats.accuracy).toBe('number');
    });

    it('does not accept additional typing after completion', () => {
      const { result } = renderHook(() => useTypingTest(5, onFinish));

      pressKey(result.current.handleKeyDown, result.current.passage[0]);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      const cursorAfterFinish = result.current.cursorPosition;

      pressKey(result.current.handleKeyDown, 'x');

      expect(result.current.cursorPosition).toBe(cursorAfterFinish);
      expect(onFinish).toHaveBeenCalledTimes(1);
    });
  });

  describe('restart and options', () => {
    it('resets the test to its initial state', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      pressKey(result.current.handleKeyDown, result.current.passage[0]);

      act(() => {
        result.current.restart();
      });

      expect(result.current.cursorPosition).toBe(0);
      expect(result.current.status).toBe('idle');
      expect(result.current.secondsLeft).toBe(30);
      expect(result.current.isPaused).toBe(false);

      expect(result.current.progress.typedCharacters.every((character) => character === null)).toBe(
        true
      );

      expect(result.current.progress.skippedPositions.size).toBe(0);
      expect(result.current.progress.correctedMistakes).toBe(0);
    });

    it('restarts with a new duration', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      act(() => {
        result.current.restart(60);
      });

      expect(result.current.durationSeconds).toBe(60);
      expect(result.current.secondsLeft).toBe(60);
      expect(result.current.status).toBe('idle');
      expect(result.current.cursorPosition).toBe(0);
    });

    it('toggles a passage option and resets the test', () => {
      const { result } = renderHook(() => useTypingTest(30, onFinish));

      const optionKey = Object.keys(
        result.current.options
      )[0] as keyof typeof result.current.options;

      const previousValue = result.current.options[optionKey];

      pressKey(result.current.handleKeyDown, result.current.passage[0]);

      act(() => {
        result.current.toggleOption(optionKey);
      });

      expect(result.current.options[optionKey]).toBe(!previousValue);
      expect(result.current.cursorPosition).toBe(0);
      expect(result.current.status).toBe('idle');
      expect(result.current.secondsLeft).toBe(30);
    });
  });
});
