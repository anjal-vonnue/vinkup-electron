import { Navigate, Outlet } from 'react-router';
import type { UserRole } from '@itp/types';
import { useAuth } from '../context/Useauth';

function homeForRole(role: UserRole): string {
  if (role === 'manager') return '/manager';
  if (role === 'mentor') return '/admin';
  return '/';
}

/** Renders child routes only for the given role; sends other roles to their own home. */
export function RoleRoute({ role }: { role: UserRole }) {
  const { user } = useAuth();
  if (user && user.role !== role) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }
  return <Outlet />;
}
