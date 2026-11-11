import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../context/Useauth';
import LoaderOverlay from '../components/Common/LoadingState/Loader';

/** Layout route: renders child routes only for authenticated users. */
export function ProtectedRoute() {
  const { status } = useAuth();

  // Wait for /me before deciding, otherwise a page refresh would flash the login page
  if (status === 'loading' || status === 'pending') return <LoaderOverlay fullPage={true} />;
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;

  return <Outlet />;
}
