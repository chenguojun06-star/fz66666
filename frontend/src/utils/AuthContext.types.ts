import type { ReactNode } from 'react';

export interface UserInfo extends Record<string, unknown> {
  id: string;
  username: string;
  name: string;
  role: string;
  roleId?: string;
  permissions: string[];
  permissionRange?: 'all' | 'team' | 'own';
  phone?: string;
  email?: string;
  avatarUrl?: string;
  tenantId?: string;
  tenantName?: string;
  isTenantOwner?: boolean;
  isFactoryOwner?: boolean;
  isSuperAdmin?: boolean;
  factoryId?: string;
  tenantType?: 'SELF_FACTORY' | 'HYBRID' | 'BRAND';
  tenantModules?: string[];
}

export type WorkspaceRole = 'boss' | 'management' | 'merchandiser';

/** 用户信息 + 权限上下文（拆分后独立，减少认证状态变化引起的重渲染） */
export interface UserContextType {
  user: UserInfo | null;
  updateUser: (patch: Partial<UserInfo>) => void;
  isAdmin: boolean;
  canViewAll: boolean;
  isSuperAdmin: boolean;
  isTenantOwner: boolean;
}

/** 认证状态上下文（纯认证流程，不包含用户详情） */
export interface AuthStateContextType {
  isAuthenticated: boolean;
  loading: boolean;
  login: (username: string, password: string, tenantId?: number) => Promise<{ success: boolean; user?: UserInfo }>;
  loginWithSms: (phone: string, code: string, tenantId?: number) => Promise<{ success: boolean; user?: UserInfo }>;
  sendLoginSmsCode: (phone: string, tenantId?: number) => Promise<Record<string, unknown>>;
  logout: () => void;
}

/** 向后兼容的组合类型（useAuth 返回值，保持原有字段不变） */
export type AuthContextType = AuthStateContextType & UserContextType;

export interface AuthProviderProps {
  children: ReactNode;
}
