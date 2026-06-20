import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { LoadingState } from './ui';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Verificando sessão..." />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
