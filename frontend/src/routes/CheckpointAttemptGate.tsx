import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { getActiveCheckpointAttempt } from '../api/checkpoints';

/**
 * While an attempt is running, every other trainee module is off-limits.
 *
 * The backend enforces this by rejecting those API calls; this guard restores
 * the running attempt when the trainee navigates by URL or history. It checks
 * on each non-checkpoint route, because starting/finishing an attempt happens
 * under /checkpoints.
 */
export function CheckpointAttemptGate() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === '/checkpoints' || location.pathname.startsWith('/checkpoints/')) {
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
  }, [location.pathname, navigate]);

  return <Outlet />;
}
