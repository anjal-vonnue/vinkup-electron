import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router';
import { useAuth } from '../../context/Useauth';
import styles from './AdminHeader.module.css';
import ThemeToggle from '../ThemeToggle';
import NotificationBadge from '../NotificationBadge/NotificationBadge';
import { getPendingLeaveCount } from '../../api/leave';
import { useRealtimeEvent } from '../../context/useRealtime';

export type AdminNavItem = {
  to: string;
  label: string;
  /** Match the route exactly instead of keeping the link active on child routes. */
  end?: boolean;
};

type AdminHeaderProps = {
  /** Replaces the app name on the left (for example a breadcrumb on the detail page). */
  leading?: ReactNode;
  /** Where the app name links. Defaults to the mentor dashboard. */
  homePath?: string;
  /** Small role badge next to the app name. */
  badge?: string;
  /** Links shown in the header. Defaults to the mentor's trainee list. */
  navItems?: AdminNavItem[];
  /** Accessible name for the navigation landmark. */
  navLabel?: string;
};

function UsersIcon() {
  return (
    <svg
      width="18"
      height="16"
      viewBox="0 0 18 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6.5" cy="4.5" r="2.75" />
      <path d="M1 14.5c.4-2.5 2.5-4 5.5-4s5.1 1.5 5.5 4" />
      <path d="M12 2.2a2.75 2.75 0 0 1 0 5.2M13.5 10.7c1.9.4 3 1.6 3.4 3.8" />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15.3 5.53a7.5 7.5 0 1 1-10.61 0" />
      <path d="M10 1.67V10" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 4.5 6 7.5 9 4.5" />
    </svg>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const second = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + second).toUpperCase();
}

/**
 * Header for the staff area. The trainee Header links to Home, Typing Test and Profile,
 * which staff cannot open, and it flushes trainee activity time on logout (staff have none).
 */
const MENTOR_NAV: AdminNavItem[] = [
  { to: '/admin', label: 'My trainees', end: true },
  { to: '/admin/leave-requests', label: 'Leave requests', end: true },
  { to: '/admin/verify-certificate', label: 'Verify certificate', end: true },
];

export default function AdminHeader({
  leading,
  homePath = '/admin',
  badge = 'Mentor view',
  navItems = MENTOR_NAV,
  navLabel = 'Mentor navigation',
}: AdminHeaderProps) {
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

  useEffect(() => {
    if (!user || (user.role !== 'mentor' && user.role !== 'manager')) return;
    void getPendingLeaveCount(user.role)
      .then(setPendingLeaveCount)
      .catch(() => undefined);
  }, [user]);

  // Close the menu on outside click or Escape
  useEffect(() => {
    if (!isMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
      // On success the auth state clears and the app leaves this page.
      setIsMenuOpen(false);
    } catch (error) {
      console.error('Logout failed', error);
      setLogoutError('Could not log out. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  useRealtimeEvent((event) => {
    if (event.type !== 'leave.reviewed' && event.type !== 'leave.submitted') return;
    if (!user || (user.role !== 'mentor' && user.role !== 'manager')) return;
    void getPendingLeaveCount(user.role)
      .then(setPendingLeaveCount)
      .catch(() => undefined);
  });

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.start}>
          <div className={styles.brand}>
            {leading ?? (
              <Link to={homePath} className={styles.appName} aria-label="VinkUp home">
                Vink<span className={styles.up}>Up</span>
              </Link>
            )}
            <span className={styles.badge}>{badge}</span>
          </div>

          <span className={styles.divider} aria-hidden="true" />

          {/* No `end` prop: stays active on /admin and on a selected trainee's page */}
          <nav className={styles.nav} aria-label={navLabel}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
              >
                <UsersIcon />
                <span className={styles.label} data-text={item.label}>
                  {item.label}
                </span>
                {item.to.endsWith('/leave-requests') && (
                  <NotificationBadge
                    count={pendingLeaveCount}
                    label={
                      pendingLeaveCount === 1 ? 'pending leave request' : 'pending leave requests'
                    }
                    tone="pending"
                  />
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className={styles.end}>
          <ThemeToggle />
          <span className={styles.divider} aria-hidden="true" />

          {user && (
            <div className={styles.account} ref={menuRef}>
              <button
                type="button"
                className={styles.accountButton}
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
                aria-label="Account menu"
                onClick={() => {
                  setLogoutError(null);
                  setIsMenuOpen((open) => !open);
                }}
              >
                <span className={styles.avatar} aria-hidden="true">
                  {getInitials(user.name)}
                </span>
                <ChevronIcon
                  className={`${styles.chevron} ${isMenuOpen ? styles.chevronOpen : ''}`}
                />
              </button>

              {isMenuOpen && (
                <div className={styles.menu} role="menu">
                  <div className={styles.menuHeader}>
                    <span className={styles.menuName}>{user.name}</span>
                    <span className={styles.menuEmail}>{user.email}</span>
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    disabled={isLoggingOut}
                    onClick={() => {
                      void handleLogout();
                    }}
                  >
                    <PowerIcon />
                    {isLoggingOut ? 'Logging out…' : 'Log out'}
                  </button>

                  {logoutError && (
                    <p className={styles.menuError} role="alert">
                      {logoutError}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
