import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../context/Useauth';
import LoaderOverlay from '../components/Common/LoadingState/Loader';
import { RealtimeProvider } from '../context/RealtimeProvider';

/** Layout route: renders child routes only for authenticated users. */
export function ProtectedRoute() {
  const { status } = useAuth();

  // Wait for /me before deciding, otherwise a page refresh would flash the login page
  if (status === 'loading' || status === 'pending') return <LoaderOverlay fullPage={true} />;
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;

  // Inside the guard, so the cookie-authenticated stream never runs on the login page.
  return (
    <RealtimeProvider>
      <Outlet />
    </RealtimeProvider>
  );
}
