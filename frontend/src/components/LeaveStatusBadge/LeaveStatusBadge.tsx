import type { LeaveStatus } from '@itp/types';
import styles from './LeaveStatusBadge.module.css';

function classNameFor(status: LeaveStatus): string {
  if (status === 'APPROVED') return `${styles.badge} ${styles.approved}`;
  if (status === 'REJECTED') return `${styles.badge} ${styles.rejected}`;
  return `${styles.badge} ${styles.pending}`;
}

export default function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  return <span className={classNameFor(status)}>{status.toLowerCase()}</span>;
}
