import { describe, expect, it } from 'vitest';
import {
  buildPassage,
  evaluateTypingProgress,
  calculateTypingStatsFromProgress,
  formatTimer,
  formatClockTime,
  type TypingProgress,
} from './typingStats';

function createProgress(
  typedCharacters: Array<string | null>,
  options: Partial<TypingProgress> = {}
): TypingProgress {
  return {
    typedCharacters,
    skippedPositions: new Set<number>(),
    extraCharactersByPosition: {},
    correctedMistakes: 0,
    ...options,
  };
}

describe('buildPassage', () => {
  it('builds enough text for the chosen duration', () => {
    expect(buildPassage(30).length).toBeGreaterThanOrEqual(300);
    expect(buildPassage(120).length).toBeGreaterThanOrEqual(1200);
  });

  it('generates lowercase words when both options are disabled', () => {
    const passage = buildPassage(60, {
      punctuation: false,
      numbers: false,
    });

    expect(passage).toMatch(/^[a-z]+( [a-z]+)*$/);
  });

  it('adds capital letters and full stops when punctuation is enabled', () => {
    const passage = buildPassage(60, { punctuation: true, numbers: false }, () => 0.99);

    expect(passage).toMatch(/^[A-Z]/);
    expect(passage).toContain('.');
  });

  it('does not generate numbers when numbers are disabled', () => {
    const passage = buildPassage(60, {
      punctuation: true,
      numbers: false,
    });

    expect(passage).not.toMatch(/\d/);
  });

  it('generates numbers when numbers are enabled', () => {
    const passage = buildPassage(30, { punctuation: false, numbers: true }, () => 0);

    expect(passage).toMatch(/^\d+( \d+)*$/);
  });

  it('does not generate punctuation when punctuation is disabled', () => {
    const passage = buildPassage(60, {
      punctuation: false,
      numbers: true,
    });

    expect(passage).not.toMatch(/[.,()A-Z]/);
  });
});

describe('evaluateTypingProgress', () => {
  it('identifies correctly typed characters', () => {
    const result = evaluateTypingProgress('hello', createProgress(['h', 'e', 'l', 'l', 'o']));

    expect(result.characterStates).toEqual(['correct', 'correct', 'correct', 'correct', 'correct']);

    expect(result.correctCharacters).toBe(5);
    expect(result.incorrectCharacters).toBe(0);
    expect(result.missedCharacters).toBe(0);
  });

  it('identifies incorrectly typed characters', () => {
    const result = evaluateTypingProgress('hello', createProgress(['h', 'e', 'x', 'l', 'o']));

    expect(result.characterStates).toEqual([
      'correct',
      'correct',
      'incorrect',
      'correct',
      'correct',
    ]);

    expect(result.correctCharacters).toBe(4);
    expect(result.incorrectCharacters).toBe(1);
  });

  it('identifies missed characters', () => {
    const result = evaluateTypingProgress(
      'hello world',
      createProgress(['h', 'e', null, null, null, null, null, null, null, null, null], {
        skippedPositions: new Set([2, 3, 4, 5]),
      })
    );

    expect(result.characterStates.slice(0, 6)).toEqual([
      'correct',
      'correct',
      'missed',
      'missed',
      'missed',
      'missed',
    ]);

    expect(result.missedCharacters).toBe(3);
  });

  it('keeps untyped characters as pending', () => {
    const result = evaluateTypingProgress('hello', createProgress(['h', 'e', null, null, null]));

    expect(result.characterStates).toEqual(['correct', 'correct', 'pending', 'pending', 'pending']);
  });

  it('does not count skipped characters as correctly typed', () => {
    const result = evaluateTypingProgress(
      'cat',
      createProgress(['c', null, null], {
        skippedPositions: new Set([1, 2]),
      })
    );

    expect(result.correctCharacters).toBe(1);
    expect(result.missedCharacters).toBe(2);
    expect(result.incorrectCharacters).toBe(0);
  });

  it('does not include spaces in character counts', () => {
    const result = evaluateTypingProgress(
      'hi there',
      createProgress(['h', 'i', ' ', 't', 'h', 'e', 'r', 'e'])
    );

    expect(result.correctCharacters).toBe(7);
    expect(result.incorrectCharacters).toBe(0);
    expect(result.missedCharacters).toBe(0);
  });

  it('tracks extra characters separately', () => {
    const result = evaluateTypingProgress(
      'hello',
      createProgress(['h', 'e', 'l', 'l', 'o'], {
        extraCharactersByPosition: { 5: 2, 10: 3 },
      })
    );

    expect(result.extraCharacters).toBe(5);
    expect(result.correctCharacters).toBe(5);
  });

  it('includes corrected mistakes in the evaluation', () => {
    const result = evaluateTypingProgress(
      'hello',
      createProgress(['h', 'e', 'l', 'l', 'o'], {
        correctedMistakes: 2,
      })
    );

    expect(result.correctedMistakes).toBe(2);
  });
});

describe('calculateTypingStatsFromProgress', () => {
  it('calculates WPM using correctly typed characters only', () => {
    const stats = calculateTypingStatsFromProgress(
      'hello',
      createProgress(['h', 'e', 'l', 'l', 'o']),
      60
    );

    expect(stats.wpm).toBe(1);
    expect(stats.accuracy).toBe(100);
    expect(stats.durationSeconds).toBe(60);
  });

  it('reduces accuracy for incorrectly typed characters', () => {
    const stats = calculateTypingStatsFromProgress(
      'hello',
      createProgress(['h', 'e', 'x', 'l', 'o']),
      60
    );

    expect(stats.wpm).toBe(1);
    expect(stats.accuracy).toBe(80);
  });

  it('reduces accuracy for missed characters', () => {
    const stats = calculateTypingStatsFromProgress(
      'hello',
      createProgress(['h', 'e', null, null, null], { skippedPositions: new Set([2, 3, 4]) }),
      60
    );

    expect(stats.wpm).toBe(0);
    expect(stats.accuracy).toBe(40);
  });

  it('includes extra characters in accuracy calculations', () => {
    const stats = calculateTypingStatsFromProgress(
      'hello',
      createProgress(['h', 'e', 'l', 'l', 'o'], {
        extraCharactersByPosition: { 5: 5 },
      }),
      60
    );

    expect(stats.wpm).toBe(1);
    expect(stats.accuracy).toBe(50);
  });

  it('includes corrected mistakes in accuracy calculations', () => {
    const stats = calculateTypingStatsFromProgress(
      'hello',
      createProgress(['h', 'e', 'l', 'l', 'o'], {
        correctedMistakes: 5,
      }),
      60
    );

    expect(stats.wpm).toBe(1);
    expect(stats.accuracy).toBe(50);
  });

  it('excludes spaces from WPM and accuracy calculations', () => {
    const stats = calculateTypingStatsFromProgress(
      'hi there',
      createProgress(['h', 'i', ' ', 't', 'h', 'e', 'r', 'e']),
      60
    );

    expect(stats.wpm).toBe(1);
    expect(stats.accuracy).toBe(100);
  });

  it('handles zero elapsed time safely', () => {
    const stats = calculateTypingStatsFromProgress(
      'hello',
      createProgress(['h', 'e', 'l', 'l', 'o']),
      0
    );

    expect(stats.wpm).toBe(60);
    expect(stats.durationSeconds).toBe(1);
  });

  it('returns zero accuracy when no characters were typed or missed', () => {
    const stats = calculateTypingStatsFromProgress(
      'hello',
      createProgress([null, null, null, null, null]),
      60
    );

    expect(stats.accuracy).toBe(0);
    expect(stats.wpm).toBe(0);
  });
});

describe('formatTimer', () => {
  it('formats seconds as minutes and seconds', () => {
    expect(formatTimer(65)).toBe('01:05');
    expect(formatTimer(9)).toBe('00:09');
    expect(formatTimer(0)).toBe('00:00');
  });
});

describe('formatClockTime', () => {
  it('formats an ISO date string as a 12-hour clock time', () => {
    expect(formatClockTime('2026-11-11T13:05:00')).toBe('01:05 PM');
    expect(formatClockTime('2026-11-11T09:30:00')).toBe('09:30 AM');
    expect(formatClockTime('2026-11-11T00:00:00')).toBe('12:00 AM');
  });
});
