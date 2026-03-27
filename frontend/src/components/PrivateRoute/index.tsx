import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isAdminUser as isAdminUserFn, useAuth } from '../../utils/AuthContext';
import { paths, resolvePermissionCode, superAdminOnlyPaths } from '../../routeConfig';
import XiaoyunPageLoader from '../common/XiaoyunPageLoader';

// 工厂账号可访问路径（与 Layout.FACTORY_VISIBLE_PATHS 保持一致）
// 注意：paths.productionList ('/production') 仅做精确匹配，避免放行 /production/picking 等非白名单路径
const FACTORY_EXACT_PATHS = new Set<string>([
  paths.productionList, // /production（我的订单，精确匹配）
]);
const FACTORY_PREFIX_PATHS: string[] = [
  paths.progressDetail,          // /production/progress-detail
  paths.cutting,                 // /production/cutting（含子路由 /task/:orderNo）
  paths.materialPurchase,        // /production/material（含 /:styleNo）
  paths.financeCenter,           // /finance/center
  paths.factoryWorkers,          // /system/factory-workers
  paths.templateCenter,          // /basic/template-center
  paths.organization,            // /system/organization
  paths.tutorial,                // /system/tutorial（系统教学）
];

const PrivateRoute: React.FC = () => {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return <XiaoyunPageLoader message="小云正在核对登录状态，请稍等一下…" />;
  }

  if (!isAuthenticated) {
    return <Navigate to={paths.login} replace />;
  }

  // 超管专属路由：非超管直接拦截
  const currentPath = location.pathname.split('?')[0];
  if (superAdminOnlyPaths.has(currentPath) && !user?.isSuperAdmin) {
    return <Navigate to={paths.dashboard} replace />;
  }

  // 工厂账号：白名单路径直接放行，跳过权限码检查；白名单外直接回我的订单（消除闪现）
  if (user?.factoryId) {
    const allowed =
      FACTORY_EXACT_PATHS.has(currentPath) ||
      FACTORY_PREFIX_PATHS.some((p) => currentPath === p || currentPath.startsWith(p + '/'));
    return allowed ? <Outlet /> : <Navigate to={paths.productionList} replace />;
  }

  const required = resolvePermissionCode(location.pathname);

  const isAdmin = isAdminUserFn(user);

  if (!required || isAdmin) {
    return <Outlet />;
  }

  const hasAny = Array.isArray(user?.permissions) && (user!.permissions.includes('all') || user!.permissions.includes(required));
  if (hasAny) {
    return <Outlet />;
  }

  // 避免死循环：如果当前路径就是 dashboard，或者其他没有权限的路径，
  // 我们需要寻找一个他们有权限的后备路径，或者去 profile
  if (user?.permissions?.includes('MENU_PRODUCTION_LIST')) {
    return <Navigate to={paths.productionList} replace />;
  }
  
  return <Navigate to={paths.profile} replace />;
};

export default PrivateRoute;
