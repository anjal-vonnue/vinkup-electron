import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/Useauth';
import styles from './Header.module.css';
import { useActivity } from '../../context/useActivity';
import { matchPath, NavLink, useLocation } from 'react-router';
import { ConfirmPopover } from '../Common/ConfirmDialog';
import ThemeToggle from '../ThemeToggle';
import { useWorkspaceSession } from '../../context/WorkspaceSessionContext';
import NotificationBadge from '../NotificationBadge/NotificationBadge';
import { getUnreadLeaveCount } from '../../api/leave';

type HeaderProps = {
  /** Replaces the app name on the left. The task page puts its breadcrumb here. */
  leading?: ReactNode;
  /** Shown just before the nav links. The task page's session timer goes here later. */
  status?: ReactNode;
};

type BrowserAvailability = {
  mainResourcesActive: boolean;
  secondaryResourcesActive: boolean;
};

function HomeIcon() {
  return (
    <svg
      width="16"
      height="18"
      viewBox="0 0 16 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1.5 7.2 8 1.5l6.5 5.7v8.3a1 1 0 0 1-1 1H10v-5H6v5H2.5a1 1 0 0 1-1-1V7.2Z" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg
      width="20"
      height="14"
      viewBox="0 0 20 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="18" height="12" rx="2" />
      <path d="M5 5h.01M8 5h.01M11 5h.01M14 5h.01M6 9h8" />
    </svg>
  );
}

function JournalIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3.5h9a2 2 0 0 1 2 2v9H5a2 2 0 0 1-2-2v-9Z" />
      <path d="M5 3.5v9a2 2 0 0 0 2 2M7 7h4M7 10h4" />
    </svg>
  );
}

function ResourcesIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="7" />
      <path d="m12 6-1.9 4.1L6 12l1.9-4.1L12 6Z" />
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="4" width="13" height="11" rx="2" />
      <path d="M6 2.5v3M12 2.5v3M2.5 8h13M6.5 11h2" />
    </svg>
  );
}

function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function PowerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
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

function NavLabel({ text }: { text: string }) {
  return (
    <span className={styles.label} data-text={text}>
      {text}
    </span>
  );
}

export default function Header({ leading, status }: HeaderProps) {
  const activity = useActivity();
  const { user, logout } = useAuth();
  const location = useLocation();
  const { exitWorkspace } = useWorkspaceSession();
  // The Home link is shared by every page. Only when it is shown *inside* the
  // workspace is it an intentional exit rather than a return to saved work.
  const isInWorkspace = Boolean(matchPath('/tasks/:taskId', location.pathname));
  // Visually, Home also owns the day flow that leads into a workspace. This is
  // display-only: clicking Home on the day page is still an ordinary navigation.
  const isInHomeFlow =
    isInWorkspace ||
    Boolean(matchPath('/days/:dayId', location.pathname)) ||
    Boolean(matchPath('/days/:dayId/references', location.pathname));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [browserAvailability, setBrowserAvailability] = useState<BrowserAvailability>({
    mainResourcesActive: false,
    secondaryResourcesActive: false,
  });

  const [unreadLeaveCount, setUnreadLeaveCount] = useState(0);

  const isOnLeavePage = location.pathname.startsWith('/leave-requests');
  // Derived: on the leave page, everything visible is already "seen".
  const displayedLeaveCount = isOnLeavePage ? 0 : unreadLeaveCount;

  useEffect(() => {
    if (!user || user.role !== 'trainee') return;

    if (isOnLeavePage) {
      // Side effect only. The rendered count is derived above, so no setState here.
      localStorage.setItem('vinkup.leave.lastSeen', new Date().toISOString());
      return;
    }

    let cancelled = false;
    const since = localStorage.getItem('vinkup.leave.lastSeen');
    void getUnreadLeaveCount(since)
      .then((count) => {
        if (!cancelled) setUnreadLeaveCount(count);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isOnLeavePage, user]);

  useEffect(() => {
    const desktopWindow = window.desktop?.window;
    if (!desktopWindow) return;

    let active = true;
    let availabilityRevision = 0;
    const unsubscribe = desktopWindow.onBrowserAvailabilityChange((availability) => {
      availabilityRevision += 1;
      setBrowserAvailability(availability);
    });
    const requestedAvailabilityRevision = availabilityRevision;
    void desktopWindow
      .getBrowserAvailability()
      .then((availability) => {
        if (active && availabilityRevision === requestedAvailabilityRevision) {
          setBrowserAvailability(availability);
        }
      })
      .catch((error: unknown) => {
        console.error('[header] Failed to read browser availability', error);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const openConfirm = () => {
    setLogoutError(null);
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    if (isLoggingOut) return;
    setConfirmOpen(false);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      // Save pending progress / active time before the session ends.
      await activity?.flushNow();
      await logout();
      // On success the auth state clears and the app leaves this page,
      // so the dialog doesn't need to be closed manually.
      setConfirmOpen(false);
    } catch (error) {
      console.error('Logout failed', error);
      setLogoutError('Could not log out. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const profileLabel = user?.name ?? 'Profile';

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.start}>
          {leading ?? (
            <span className={styles.appName}>
              Vink<span className={styles.up}>Up</span>
            </span>
          )}
        </div>

        <nav className={styles.nav} aria-label="Main">
          <NavLink
            to="/"
            end
            onClick={() => {
              if (isInWorkspace) exitWorkspace();
            }}
            className={({ isActive }) =>
              `${styles.link} ${isActive || isInHomeFlow ? styles.active : ''} ${
                isInWorkspace ? styles.workspaceActive : ''
              }`
            }
          >
            <HomeIcon />
            <NavLabel text="Home" />
          </NavLink>
          <NavLink
            to="/typing-test"
            end
            className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
          >
            <KeyboardIcon />
            <NavLabel text="Typing Test" />
          </NavLink>
          <NavLink
            to="/journal"
            end
            className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
          >
            <JournalIcon />
            <NavLabel text="Journal" />
          </NavLink>
          <NavLink
            to="/leave-requests"
            end
            className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
          >
            <LeaveIcon />
            <NavLabel text="Leave" />
            <NotificationBadge
              count={displayedLeaveCount}
              label={displayedLeaveCount === 1 ? 'unread leave decision' : 'unread leave decisions'}
              tone="attention"
            />
          </NavLink>
          <NavLink
            to="/resources"
            end
            aria-disabled={browserAvailability.secondaryResourcesActive}
            tabIndex={browserAvailability.secondaryResourcesActive ? -1 : undefined}
            title={
              browserAvailability.secondaryResourcesActive
                ? 'Resources are active on the secondary display'
                : undefined
            }
            onClick={(event) => {
              if (browserAvailability.secondaryResourcesActive) event.preventDefault();
            }}
            className={({ isActive }) =>
              `${styles.link} ${isActive ? styles.active : ''} ${
                browserAvailability.secondaryResourcesActive ? styles.linkDisabled : ''
              }`
            }
          >
            <ResourcesIcon />
            <NavLabel text="Resources" />
          </NavLink>
        </nav>

        <div className={styles.end}>
          {status}
          <NavLink
            to="/profile"
            aria-label={profileLabel}
            title={profileLabel}
            className={({ isActive }) =>
              `${styles.profile} ${isActive ? styles.profileActive : ''}`
            }
          >
            <span className={styles.avatar} aria-hidden="true">
              {getInitials(user?.name)}
            </span>
            <span className={styles.profileName}>{profileLabel}</span>
          </NavLink>
          <span className={styles.divider} aria-hidden="true" />
          <div className={styles.actions}>
            <ThemeToggle />
            <ConfirmPopover
              open={confirmOpen}
              message="Log out?"
              confirmLabel="Log out"
              busyLabel="Logging out…"
              isBusy={isLoggingOut}
              error={logoutError}
              onConfirm={() => {
                void handleLogout();
              }}
              onCancel={closeConfirm}
            >
              <button
                type="button"
                className={styles.logoutButton}
                aria-label="Log out"
                aria-haspopup="dialog"
                aria-expanded={confirmOpen}
                title="Log out"
                onClick={openConfirm}
              >
                <PowerIcon className={styles.logoutIcon} />
              </button>
            </ConfirmPopover>
          </div>
        </div>
      </div>
    </header>
  );
}
