import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { isAdminUser as isAdminUserFn, useAuth } from '../../utils/AuthContext';
import { paths, resolvePermissionCode } from '../../routeConfig';

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
    return <Navigate to={paths.login} replace />;
  }

  const required = resolvePermissionCode(location.pathname);

  const isAdmin = isAdminUserFn(user);

  if (!required || isAdmin) {
    return <Outlet />;
  }

  const hasAny = Array.isArray(user?.permissions) && (user!.permissions.includes('all') || user!.permissions.includes(required));
  return hasAny ? <Outlet /> : <Navigate to={paths.dashboard} replace />;
};

export default PrivateRoute;
