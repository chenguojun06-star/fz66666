import { useMemo } from 'react';
import { isAdminUser as isAdminUserFn, useAuth } from '../../utils/AuthContext';
import { menuConfig, resolvePermissionCode, paths } from '../../routeConfig';

const normalizePath = (path: string) => path.split('?')[0];

const FACTORY_VISIBLE_SECTIONS = new Set<string>(['procurement', 'production', 'finance', 'system']);
const FACTORY_VISIBLE_PATHS = new Set<string>([
  paths.productionList,
  paths.progressDetail,
  paths.cutting,
  paths.materialPurchase,
  paths.financeCenter,
  paths.factoryWorkers,
  paths.organization,
  paths.tutorial,
  paths.orderFlow,
]);

const ALWAYS_VISIBLE_PATHS = new Set(['/integration/center', '/system/app-store']);

export interface LayoutAuthResult {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isFactoryAccount: boolean;
  factoryName: string | undefined;
  tenantModules: string[] | undefined;
  hasPermissionForPath: (path: string) => boolean;
  isTenantModuleEnabled: (path: string) => boolean;
  factoryVisibleSections: Set<string>;
  factoryVisiblePaths: Set<string>;
  alwaysVisiblePaths: Set<string>;
}

export function useLayoutAuth(): LayoutAuthResult {
  const { user } = useAuth();

  const isAdmin = useMemo(() => isAdminUserFn(user), [user]);
  const isSuperAdmin = user?.isSuperAdmin === true;
  const isFactoryAccount = !!(user as any)?.factoryId;
  const factoryName = (user as any)?.factoryName as string | undefined;
  const tenantModules = (user as any)?.tenantModules as string[] | undefined;

  const hasPermissionForPath = (path: string) => {
    if (isAdmin) return true;
    const code = resolvePermissionCode(normalizePath(path));
    if (!code) return true;
    return Array.isArray(user?.permissions) && (user!.permissions.includes('all') || user!.permissions.includes(code));
  };

  const isTenantModuleEnabled = (path: string) =>
    !tenantModules || tenantModules.length === 0 || tenantModules.includes(path);

  return {
    isAdmin,
    isSuperAdmin,
    isFactoryAccount,
    factoryName,
    tenantModules,
    hasPermissionForPath,
    isTenantModuleEnabled,
    factoryVisibleSections: FACTORY_VISIBLE_SECTIONS,
    factoryVisiblePaths: FACTORY_VISIBLE_PATHS,
    alwaysVisiblePaths: ALWAYS_VISIBLE_PATHS,
  };
}

export { normalizePath, FACTORY_VISIBLE_SECTIONS, FACTORY_VISIBLE_PATHS, ALWAYS_VISIBLE_PATHS };
