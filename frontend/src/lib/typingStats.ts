import type { TypingTestStats } from '@itp/types';
import { TYPING_WORDS } from '../constants/typingWords';

export type PassageOptions = {
  punctuation: boolean;
  numbers: boolean;
};

export type CharacterState = 'correct' | 'incorrect' | 'missed' | 'pending';

export type TypingProgress = {
  typedCharacters: Array<string | null>;
  skippedPositions: Set<number>;
  extraCharactersByPosition: Record<number, number>;
  correctedMistakes: number;
};

export type TypingEvaluation = {
  characterStates: CharacterState[];
  correctCharacters: number;
  incorrectCharacters: number;
  missedCharacters: number;
  extraCharacters: number;
  correctedMistakes: number;
};

export const DEFAULT_PASSAGE_OPTIONS: PassageOptions = {
  punctuation: false,
  numbers: false,
};

export const MAX_EXTRA_CHARACTERS_PER_WORD = 20;

const CHARS_PER_SECOND = 10;
const NUMBER_CHANCE = 0.15;
const COMMA_CHANCE = 0.12;
const WRAP_CHANCE = 0.06;
const SENTENCE_MIN_WORDS = 5;
const SENTENCE_MAX_WORDS = 12;

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

export function buildPassage(
  durationSeconds: number,
  options: PassageOptions = DEFAULT_PASSAGE_OPTIONS,
  random: () => number = Math.random
): string {
  const targetLength = durationSeconds * CHARS_PER_SECOND + 1;
  const tokens: string[] = [];
  let length = 0;
  let wordsLeftInSentence = 0;

  while (length < targetLength) {
    let token =
      options.numbers && random() < NUMBER_CHANCE
        ? String(Math.floor(random() * 10000))
        : pick(TYPING_WORDS, random);

    if (options.punctuation) {
      if (wordsLeftInSentence === 0) {
        wordsLeftInSentence =
          SENTENCE_MIN_WORDS + Math.floor(random() * (SENTENCE_MAX_WORDS - SENTENCE_MIN_WORDS + 1));

        token = token.charAt(0).toUpperCase() + token.slice(1);
      }

      if (random() < WRAP_CHANCE) token = `(${token})`;

      wordsLeftInSentence -= 1;

      if (wordsLeftInSentence === 0) {
        token += '.';
      } else if (random() < COMMA_CHANCE) {
        token += ',';
      }
    }

    tokens.push(token);
    length += token.length + 1;
  }

  return tokens.join(' ');
}

export function evaluateTypingProgress(
  passage: string,
  progress: TypingProgress
): TypingEvaluation {
  let correctCharacters = 0;
  let incorrectCharacters = 0;
  let missedCharacters = 0;

  const characterStates = Array.from({ length: passage.length }, (_, index) => {
    const typedCharacter = progress.typedCharacters[index];

    if (passage[index] === ' ') {
      if (typedCharacter === ' ') return 'correct' as const;
      if (typedCharacter != null) return 'incorrect' as const;
      if (progress.skippedPositions.has(index)) return 'missed' as const;

      return 'pending' as const;
    }

    if (typedCharacter != null) {
      if (typedCharacter === passage[index]) {
        correctCharacters += 1;
        return 'correct' as const;
      }

      incorrectCharacters += 1;
      return 'incorrect' as const;
    }

    if (progress.skippedPositions.has(index)) {
      missedCharacters += 1;
      return 'missed' as const;
    }

    return 'pending' as const;
  });

  const extraCharacters = Object.values(progress.extraCharactersByPosition).reduce(
    (total, count) => total + count,
    0
  );

  return {
    characterStates,
    correctCharacters,
    incorrectCharacters,
    missedCharacters,
    extraCharacters,
    correctedMistakes: progress.correctedMistakes,
  };
}

export function calculateTypingStatsFromProgress(
  passage: string,
  progress: TypingProgress,
  elapsedSeconds: number
): TypingTestStats {
  const {
    correctCharacters,
    incorrectCharacters,
    missedCharacters,
    extraCharacters,
    correctedMistakes,
  } = evaluateTypingProgress(passage, progress);

  const totalCharacters =
    correctCharacters +
    incorrectCharacters +
    missedCharacters +
    extraCharacters +
    correctedMistakes;

  const minutes = Math.max(elapsedSeconds, 1) / 60;

  return {
    wpm: Math.round(correctCharacters / 5 / minutes),
    accuracy: totalCharacters === 0 ? 0 : Math.round((correctCharacters / totalCharacters) * 100),
    durationSeconds: Math.max(1, Math.round(elapsedSeconds)),
  };
}

export function calculateTypingStats(
  passage: string,
  typed: string,
  elapsedSeconds: number
): TypingTestStats {
  const typedCharacters = Array.from({ length: passage.length }, (_, index) =>
    index < typed.length ? typed[index] : null
  );

  return calculateTypingStatsFromProgress(
    passage,
    {
      typedCharacters,
      skippedPositions: new Set<number>(),
      extraCharactersByPosition: {},
      correctedMistakes: 0,
    },
    elapsedSeconds
  );
}

export function formatTimer(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}
