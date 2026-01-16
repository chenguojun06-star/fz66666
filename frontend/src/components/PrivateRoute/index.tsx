import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { routeToPermissionCode, useAuth } from '../../utils/authContext';

const PrivateRoute: React.FC = () => {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const normalize = (p: string) => p.split('?')[0];
  const path = normalize(location.pathname);
  const required = routeToPermissionCode[path];

  const isAdmin = (() => {
    const r = user?.role?.toLowerCase() || '';
    return r.includes('admin') || r.includes('管理员');
  })();

  if (!required || isAdmin) {
    return <Outlet />;
  }

  const hasAny = Array.isArray(user?.permissions) && (user!.permissions.includes('all') || user!.permissions.includes(required));
  return hasAny ? <Outlet /> : <Navigate to="/dashboard" replace />;
};

export default PrivateRoute;
