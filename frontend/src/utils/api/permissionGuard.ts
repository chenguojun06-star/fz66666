import { hasPermission, hasAnyPermission, hasAllPermissions } from '../permission';
import { useAuth } from '../AuthContext';
import type { UserInfo } from '../AuthContext';

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

export type PermissionRequirement =
  | string
  | { any: string[] }
  | { all: string[] };

export function checkPermissionRequirement(
  user: UserInfo | null,
  requirement: PermissionRequirement | undefined
): PermissionCheckResult {
  if (!requirement) {
    return { allowed: true };
  }

  if (!user) {
    return { allowed: false, reason: '请先登录' };
  }

  if (typeof requirement === 'string') {
    const allowed = hasPermission(user, requirement);
    return allowed
      ? { allowed: true }
      : { allowed: false, reason: `缺少权限: ${requirement}` };
  }

  if ('any' in requirement) {
    const allowed = hasAnyPermission(user, requirement.any);
    return allowed
      ? { allowed: true }
      : { allowed: false, reason: `缺少以下任意权限: ${requirement.any.join(', ')}` };
  }

  if ('all' in requirement) {
    const allowed = hasAllPermissions(user, requirement.all);
    return allowed
      ? { allowed: true }
      : { allowed: false, reason: `缺少以下权限: ${requirement.all.join(', ')}` };
  }

  return { allowed: true };
}

export function createPermissionGuard(getUser: () => UserInfo | null) {
  return {
    check: (requirement?: PermissionRequirement): PermissionCheckResult => {
      return checkPermissionRequirement(getUser(), requirement);
    },

    assert: (requirement?: PermissionRequirement): void => {
      const result = checkPermissionRequirement(getUser(), requirement);
      if (!result.allowed) {
        const error = new Error(result.reason || '无权限');
        (error as any).permissionDenied = true;
        throw error;
      }
    },
  };
}

export function usePermissionGuard() {
  const { user } = useAuth();
  return createPermissionGuard(() => user);
}

export function withPermissionCheck<T extends (...args: any[]) => any>(
  fn: T,
  requirement: PermissionRequirement,
  getUser: () => UserInfo | null
): T {
  return ((...args: Parameters<T>) => {
    const result = checkPermissionRequirement(getUser(), requirement);
    if (!result.allowed) {
      return Promise.reject(new Error(result.reason || '无权限'));
    }
    return fn(...args);
  }) as T;
}

/**
 * 数据库 t_permission 中实际存在的权限码。
 * ⚠️ 仅收录已在后端注册的权限码，禁止凭空虚构！
 * 虚构的权限码会导致 admin 以外的角色全部被拦截（等同全员 403）。
 * 菜单权限（MENU_*）数量较多且由后端动态下发，此处不重复列举。
 */
export const PERMISSION_REQUIREMENTS = {
  // --- 按钮/操作级权限（t_permission 表已注册）---
  STYLE_CREATE: 'STYLE_CREATE',
  STYLE_DELETE: 'STYLE_DELETE',
  PAYMENT_APPROVE: 'PAYMENT_APPROVE',
  MATERIAL_RECON_CREATE: 'MATERIAL_RECON_CREATE',
  SHIPMENT_RECON_AUDIT: 'SHIPMENT_RECON_AUDIT',
  INTELLIGENCE_MONTHLY_VIEW: 'INTELLIGENCE_MONTHLY_VIEW',
} as const;

export type PermissionRequirementKey = keyof typeof PERMISSION_REQUIREMENTS;
