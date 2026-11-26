import styles from './NotificationBadge.module.css';

type Props = {
  count: number;
  label: string;
  tone?: 'attention' | 'pending';
};

export default function NotificationBadge({ count, label, tone = 'attention' }: Props) {
  if (count <= 0) return null;
  const display = count > 9 ? '9+' : String(count);
  return (
    <span
      className={`${styles.badge} ${styles[tone]}`}
      aria-label={`${count} ${label}`}
      title={`${count} ${label}`}
    >
      {display}
    </span>
  );
}
