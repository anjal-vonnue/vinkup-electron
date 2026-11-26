import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { getActiveCheckpointAttempt } from '../api/checkpoints';
import { useAuth } from '../context/Useauth';
import { useCheckpointDisplayLock } from '../pages/CheckpointsPage/useCheckpointDisplayLock';

/**
 * While an attempt is running, every other trainee module is off-limits.
 *
 * The backend enforces this by rejecting those API calls; this guard restores
 * the running attempt when the trainee navigates by URL or history. It checks
 * on each non-checkpoint route, because starting/finishing an attempt happens
 * under /checkpoints.
 *
 * It also keeps the secondary display on the good-luck screen for the whole
 * Checkpoints section — the list, a detail page, an attempt and its summary —
 * so References and Resources are not usable while a checkpoint is open.
 */
export function CheckpointAttemptGate() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const onCheckpointsPage =
    location.pathname === '/checkpoints' || location.pathname.startsWith('/checkpoints/');
  useCheckpointDisplayLock(onCheckpointsPage ? user?.name : null);

  useEffect(() => {
    if (onCheckpointsPage) {
      return;
    }

    let cancelled = false;
    getActiveCheckpointAttempt()
      .then((attempt) => {
        if (!cancelled && attempt) {
          void navigate(`/checkpoints/attempts/${attempt.id}`, { replace: true });
        }
      })
      .catch(() => {
        // A network error must not trap the trainee on a blank page.
      });

    return () => {
      cancelled = true;
    };
  }, [onCheckpointsPage, navigate]);

  return <Outlet />;
}
