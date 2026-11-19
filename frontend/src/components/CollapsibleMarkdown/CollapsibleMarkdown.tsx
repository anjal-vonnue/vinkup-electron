import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Ellipsis } from 'lucide-react';
import MarkdownRenderer from '../MarkdownRenderer/MarkdownRenderer';
import styles from './CollapsibleMarkdown.module.css';

type CollapsibleMarkdownProps = {
  markdown: string;
  className?: string;
};

const INITIAL_LINES = 8;
const LINES_PER_EXPANSION = 50;

/** Shows review feedback progressively, expanding by a few rendered lines per click. */
export default function CollapsibleMarkdown({ markdown, className }: CollapsibleMarkdownProps) {
  const [visibleLines, setVisibleLines] = useState(INITIAL_LINES);
  const [hasMore, setHasMore] = useState(markdown.split('\n').length > INITIAL_LINES);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const updateOverflow = () =>
      setHasMore(
        markdown.split('\n').length > visibleLines ||
          content.scrollHeight > content.clientHeight + 1
      );
    updateOverflow();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(content);
    return () => observer.disconnect();
  }, [markdown, visibleLines]);

  return (
    <div className={className ? `${styles.container} ${className}` : styles.container}>
      <div
        ref={contentRef}
        className={styles.content}
        data-visible-lines={visibleLines}
        style={{ maxHeight: `${(visibleLines * 1.6).toFixed(1)}em` }}
      >
        <MarkdownRenderer markdown={markdown} />
      </div>
      {(hasMore || visibleLines > INITIAL_LINES) && (
        <div className={styles.controls}>
          {hasMore && (
            <button
              type="button"
              className={styles.expand}
              aria-label="Show more feedback"
              onClick={() => setVisibleLines((lines) => lines + LINES_PER_EXPANSION)}
            >
              <Ellipsis size={16} aria-hidden="true" />
            </button>
          )}
          {visibleLines > INITIAL_LINES && (
            <button
              type="button"
              className={styles.expand}
              aria-label="Show less feedback"
              onClick={() => setVisibleLines(INITIAL_LINES)}
            >
              <ArrowUp size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
