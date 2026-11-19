import { Link } from 'react-router';
import styles from './TaskBreadcrumb.module.css';

type TaskBreadcrumbProps = {
  courseTitle: string;
  dayId: string;
  dayNumber: number;
  taskNumber: number;
  /** Called when the breadcrumb is used to leave the workspace. */
  onNavigateAway?: () => void;
};

export default function TaskBreadcrumb({
  courseTitle,
  dayId,
  dayNumber,
  taskNumber,
  onNavigateAway,
}: TaskBreadcrumbProps) {
  const dayLabel = `Day ${String(dayNumber).padStart(2, '0')}`;

  return (
    <nav aria-label="Breadcrumb">
      <ol className={styles.list}>
        <li>
          <Link to={`/days/${dayId}`} className={styles.link} onClick={onNavigateAway}>
            <span>{`${courseTitle}`}</span>
            {dayLabel}
          </Link>
        </li>
        <li>
          <span aria-current="page" className={styles.current}>
            {`Task ${taskNumber}`}
          </span>
        </li>
      </ol>
    </nav>
  );
}
