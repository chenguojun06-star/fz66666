import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isAdmin, useUser, useAuthState } from '../../utils/AuthContext';
import { paths, resolvePermissionCode, superAdminOnlyPaths } from '../../routeConfig';
import XiaoyunPageLoader from '../common/XiaoyunPageLoader';
import Layout from '../Layout';

const FACTORY_EXACT_PATHS = new Set<string>([
  paths.productionList,
]);
const FACTORY_PREFIX_PATHS: string[] = [
  paths.progressDetail,
  paths.cutting,
  paths.materialPurchase,
  paths.orderFlow,
  paths.financeCenter,
  paths.factoryWorkers,
  paths.templateCenter,
  paths.organization,
  paths.tutorial,
];

const PrivateRoute: React.FC = () => {
  const { user } = useUser();
  const { isAuthenticated, loading } = useAuthState();
  const location = useLocation();

  if (loading) {
    return <XiaoyunPageLoader message="小云正在核对登录状态，请稍等一下…" />;
  }

  if (!isAuthenticated) {
    return <Navigate to={paths.login} replace />;
  }

  const currentPath = location.pathname.split('?')[0];
  if (superAdminOnlyPaths.has(currentPath) && !user?.isSuperAdmin) {
    return <Navigate to={paths.dashboard} replace />;
  }

  // 收银台独立全屏（对标银豹/美团收银）：收银员作业界面不套后台管理框架，
  // 没有侧边栏/顶栏就没有误点跳走的入口；「返回后台」由收银台自带按钮提供。
  // 电子小票列表（/pos/tickets）是后台页面，仍走 Layout。
  const page = currentPath === paths.pos ? (
    <Outlet />
  ) : (
    <Layout><Outlet /></Layout>
  );

  if (user?.factoryId) {
    const allowed =
      FACTORY_EXACT_PATHS.has(currentPath) ||
      FACTORY_PREFIX_PATHS.some((p) => currentPath === p || currentPath.startsWith(p + '/'));
    return allowed ? page : <Navigate to={paths.productionList} replace />;
  }

  const required = resolvePermissionCode(location.pathname);

  if (required === 'PUBLIC') {
    return page;
  }

  const isAdminUser = isAdmin(user);

  if (isAdminUser) {
    return page;
  }

  if (!required) {
    console.warn(`[PrivateRoute] 路由 ${currentPath} 未注册权限码，默认拒绝访问`);
    if (user?.permissions?.includes('MENU_PRODUCTION_LIST')) {
      return <Navigate to={paths.productionList} replace />;
    }
    return <Navigate to={paths.profile} replace />;
  }

  const hasAny = Array.isArray(user?.permissions) && (user!.permissions.includes('all') || user!.permissions.includes(required));
  if (hasAny) {
    return page;
  }

  if (user?.permissions?.includes('MENU_PRODUCTION_LIST')) {
    return <Navigate to={paths.productionList} replace />;
  }

  return <Navigate to={paths.profile} replace />;
};

export default PrivateRoute;
