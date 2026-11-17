import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../context/Useauth';
import LoaderOverlay from '../components/Common/LoadingState/Loader';

/** Layout route for pages like /login: signed-in users are sent to their home page. */
export function PublicOnlyRoute() {
  const { status, user } = useAuth();

  if (status === 'loading') return <LoaderOverlay fullPage={true} />;
  if (status === 'authenticated') {
    const to = user?.role === 'manager' ? '/manager' : user?.role === 'mentor' ? '/admin' : '/';
    return <Navigate to={to} replace />;
  }

  return <Outlet />;
}
