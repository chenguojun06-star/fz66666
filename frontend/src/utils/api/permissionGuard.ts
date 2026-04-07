import { hasPermission, hasAnyPermission, hasAllPermissions } from '../permission';
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

