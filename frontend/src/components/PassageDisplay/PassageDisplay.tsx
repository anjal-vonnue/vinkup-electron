import { useLayoutEffect, useRef } from 'react';
import { evaluateTypingProgress, type TypingProgress } from '../../lib/typingStats';
import styles from './PassageDisplay.module.css';

const VISIBLE_LINES = 4;

type PassageDisplayProps = {
  passage: string;
  progress: TypingProgress;
  cursorPosition: number;
};

export default function PassageDisplay({ passage, progress, cursorPosition }: PassageDisplayProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const paragraphRef = useRef<HTMLParagraphElement>(null);
  const currentRef = useRef<HTMLSpanElement>(null);

  const evaluation = evaluateTypingProgress(passage, progress);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const paragraph = paragraphRef.current;
    const current = currentRef.current;

    if (!viewport || !paragraph) return;

    const lineHeight = parseFloat(getComputedStyle(paragraph).lineHeight);

    if (Number.isNaN(lineHeight)) return;

    viewport.style.height = `${lineHeight * VISIBLE_LINES}px`;

    if (!current) return;

    const lineIndex = Math.round(current.offsetTop / lineHeight);
    const offset = Math.max(0, lineIndex - 1) * lineHeight;

    paragraph.style.transform = `translateY(-${offset}px)`;
  }, [cursorPosition, passage]);

  return (
    <div ref={viewportRef} className={styles.viewport}>
      <p ref={paragraphRef} className={styles.passage} aria-label="Text to type">
        {passage.split('').map((char, index) => {
          const state = evaluation.characterStates[index];

          const stateClass: Record<string, string> = {
            correct: styles.correct,
            incorrect: styles.incorrect,
            missed: styles.missed,
            pending: styles.pending,
          };

          const className = [
            stateClass[state] ?? styles.pending,
            index === cursorPosition ? styles.current : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <span
              key={index}
              ref={index === cursorPosition ? currentRef : undefined}
              className={className}
            >
              {char}
            </span>
          );
        })}
      </p>
    </div>
  );
}
