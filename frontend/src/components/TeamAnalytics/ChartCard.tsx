import { useId, type ReactNode } from 'react';
import styles from './ChartCard.module.css';

type ChartCardProps = {
  title: string;
  /** One line under the title: what the chart shows and where the data comes from. */
  description: string;
  /** A plain-text summary of the chart, also read out by screen readers. */
  summary?: string;
  /** When true, `emptyText` is shown instead of the chart. */
  isEmpty: boolean;
  emptyText: string;
  /** Optional controls shown next to the title, also when the chart is empty. */
  actions?: ReactNode;
  children: ReactNode;
};

/** The frame every analytics chart sits in: title, description, summary, empty state. */
export default function ChartCard({
  title,
  description,
  summary,
  isEmpty,
  emptyText,
  actions,
  children,
}: ChartCardProps) {
  const titleId = useId();

  return (
    <figure className={styles.card} aria-labelledby={titleId}>
      <div className={styles.top}>
        <figcaption className={styles.caption}>
          <h3 id={titleId} className={styles.title}>
            {title}
          </h3>
          <p className={styles.description}>{description}</p>
          {!isEmpty && summary && <p className={styles.summary}>{summary}</p>}
        </figcaption>
        {actions}
      </div>

      {isEmpty ? (
        <p className={styles.empty} role="status">
          {emptyText}
        </p>
      ) : (
        <div className={styles.chart}>{children}</div>
      )}
    </figure>
  );
}
