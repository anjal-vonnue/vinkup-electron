import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import styles from './PaneResizer.module.css';

type PaneResizerProps = {
  label: string;
  /** Pointer went down on the handle. */
  onResizeStart: () => void;
  /** Total horizontal movement since the pointer went down, in px (right is positive). */
  onResize: (deltaX: number) => void;
  onResizeEnd: () => void;
  /** Keyboard: move the boundary by this many px (right is positive). */
  onNudge: (deltaX: number) => void;
  /** Double-click or Enter. */
  onReset: () => void;
  valueNow?: number;
  valueMin?: number;
  valueMax?: number;
};

const KEY_STEP = 16;
const KEY_STEP_LARGE = 64;

export default function PaneResizer({
  label,
  onResizeStart,
  onResize,
  onResizeEnd,
  onNudge,
  onReset,
  valueNow,
  valueMin,
  valueMax,
}: PaneResizerProps) {
  const [isActive, setIsActive] = useState(false);
  const startX = useRef(0);
  const dragging = useRef(false);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    startX.current = event.clientX;
    dragging.current = true;
    setIsActive(true);
    onResizeStart();
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    onResize(event.clientX - startX.current);
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;

    dragging.current = false;
    setIsActive(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    onResizeEnd();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onNudge(-step);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      onNudge(step);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onReset();
    }
  }

  return (
    <div
      className={styles.resizer}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={valueNow}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      title="Drag to resize. Double-click to reset."
      tabIndex={0}
      data-active={isActive}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onKeyDown={handleKeyDown}
      onDoubleClick={onReset}
    />
  );
}
