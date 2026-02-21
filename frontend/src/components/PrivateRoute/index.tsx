import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { isAdminUser as isAdminUserFn, useAuth } from '../../utils/AuthContext';
import { paths, resolvePermissionCode, superAdminOnlyPaths } from '../../routeConfig';

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

  // 超管专属路由：非超管直接拦截
  const currentPath = location.pathname.split('?')[0];
  if (superAdminOnlyPaths.has(currentPath) && !user?.isSuperAdmin) {
    return <Navigate to={paths.dashboard} replace />;
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
