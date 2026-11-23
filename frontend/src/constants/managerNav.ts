import type { AdminNavItem } from '../components/AdminHeader/AdminHeader';

export const MANAGER_NAV: AdminNavItem[] = [
  { to: '/manager', label: 'Users & assignments', end: true },
  { to: '/manager/checkpoints', label: 'Checkpoints', end: true },
  { to: '/manager/leave-requests', label: 'Leave requests', end: true },
];
