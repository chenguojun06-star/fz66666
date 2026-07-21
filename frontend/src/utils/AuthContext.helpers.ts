import { useSmartFeatureStore } from '@/smart/core/smartFeatureStore';
import type { UserInfo, WorkspaceRole } from './AuthContext.types';

// ── 常量（提取到模块级，避免组件内重复创建）──────────────────────────
export const TOKEN_STORAGE_KEY = 'authToken';
export const REFRESH_TOKEN_KEY = 'refreshToken';
export const USER_STORAGE_KEY = 'userInfo';
export const FALLBACK_THEME = 'white';

/**
 * 判断是否为管理员/老板/超管
 * 收紧判定条件：只根据明确的标识判断，不依赖字符串包含匹配
 */
export function isAdmin(user: UserInfo | null): boolean {
  if (!user) return false;
  // 明确标识：租户主账号、平台超管
  if (user.isTenantOwner || user.isSuperAdmin) return true;
  // 精确匹配 roleId = '1'（系统管理员角色）
  if (user.roleId === '1') return true;
  // 精确匹配 role（如"管理员"、"老板"、"admin"全词，不接受包含匹配）
  const role = (user.role || '').trim();
  const normalizedRole = role.toLowerCase();
  // 只允许精确匹配或前后有边界的包含（如" 管理员 "）
  if (normalizedRole === 'admin' || normalizedRole === '管理员' || normalizedRole === '老板' || normalizedRole === 'supermanager') return true;
  return false;
}

/**
 * 判断是否为管理员/主管及以上级别
 * 收紧判定条件：只根据明确的标识判断
 */
export function isSupervisorOrAbove(user: UserInfo | null): boolean {
  if (isAdmin(user)) return true;
  if (!user) return false;
  // 精确匹配主管相关角色
  const role = (user.role || '').trim().toLowerCase();
  if (role === '主管' || role === 'manager' || role === 'supervisor' || role === '组长' || role === '全能管理') return true;
  return false;
}

export function canViewAllData(user: UserInfo | null): boolean {
  if (isAdmin(user)) return true;
  if (!user) return false;
  return user.permissionRange === 'all';
}

export const toPermissionRange = (value: unknown): UserInfo['permissionRange'] => {
  const v = String(value || '').trim();
  if (v === 'team' || v === 'own') return v;
  return 'all';
};

export const isAdminUser = (user?: Partial<UserInfo> | null) => {
  if (!user) return false;
  // 明确标识
  if ((user as any)?.isTenantOwner === true) return true;
  if ((user as any)?.isSuperAdmin === true) return true;
  // 精确匹配 roleId
  if ((user as any)?.roleId === '1') return true;
  // 精确匹配 role
  const role = String((user as any)?.role ?? (user as any)?.roleName ?? '').trim().toLowerCase();
  if (role === 'admin' || role === '管理员' || role === '老板') return true;
  return false;
};

export const isSupervisorOrAboveUser = (user?: Partial<UserInfo> | null) => {
  if (isAdminUser(user)) return true;
  if ((user as any)?.isSuperAdmin === true) return true;
  const role = String((user as any)?.role ?? (user as any)?.roleName ?? '').trim().toLowerCase();
  if (role === '主管' || role === 'manager' || role === 'supervisor' || role === '组长') return true;
  // 检查 permissions 是否包含 'all'
  const perms = Array.isArray((user as any)?.permissions)
    ? ((user as any).permissions as string[])
    : [];
  return perms.includes('all');
};

export const getWorkspaceRole = (user?: Partial<UserInfo> | null): WorkspaceRole => {
  if (!user) return 'merchandiser';
  const role = String((user as any)?.role ?? (user as any)?.roleName ?? '').trim().toLowerCase();
  // 精确匹配老板级别
  if ((user as any)?.isTenantOwner === true || role === '老板' || role === '总经理') {
    return 'boss';
  }
  if ((user as any)?.isSuperAdmin === true) {
    return 'boss';
  }
  // 精确匹配管理层
  if (isSupervisorOrAboveUser(user)) {
    return 'management';
  }
  return 'merchandiser';
};

export const applyThemeValue = (nextTheme: string | null | undefined) => {
  if (typeof document === 'undefined') return;
  const raw = String(nextTheme || '').trim();
  const resolvedTheme = !raw || raw === 'default' ? FALLBACK_THEME : raw;
  document.documentElement.setAttribute('data-theme', resolvedTheme);
};

export const loadTenantSmartFlags = async () => {
  try {
    await useSmartFeatureStore.getState().fetchFromServer();
  } catch {
    // Ignore smart feature bootstrap failures and keep local fallback.
  }
};

/**
 * 判断 JWT token 是否已过期（含 5 分钟提前量）
 */
export const isJwtExpired = (t: string): boolean => {
  if (!t) return true;
  try {
    const parts = t.split('.');
    if (parts.length < 2) return true;
    let payload = parts[1];
    payload = payload.replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    const decoded = JSON.parse(atob(payload));
    if (!decoded.exp) return true;
    return Date.now() / 1000 > decoded.exp - 300;
  } catch {
    return true;
  }
};
