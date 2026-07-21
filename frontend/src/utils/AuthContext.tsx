import React, { createContext, useContext, useMemo } from 'react';
import type {
  UserContextType,
  AuthStateContextType,
  AuthContextType,
  AuthProviderProps,
} from './AuthContext.types';
import { isAdmin, canViewAllData } from './AuthContext.helpers';
import { useAuthProviderState } from './useAuthProviderState';

// ── 创建 Context ──────────────────────────────────────────────────────
const AuthStateContext = createContext<AuthStateContextType | undefined>(undefined);
const UserContext = createContext<UserContextType | undefined>(undefined);

// ── Fallback 值 ──────────────────────────────────────────────────────
const fallbackUserContext: UserContextType = {
  user: null,
  updateUser: () => {},
  isAdmin: false,
  canViewAll: false,
  isSuperAdmin: false,
  isTenantOwner: false,
};

const fallbackAuthStateContext: AuthStateContextType = {
  isAuthenticated: false,
  loading: false,
  login: async () => ({ success: false }),
  loginWithSms: async () => ({ success: false }),
  sendLoginSmsCode: async () => ({}),
  logout: () => {},
};

const fallbackAuthContext: AuthContextType = {
  ...fallbackAuthStateContext,
  ...fallbackUserContext,
};

// ── Provider ──────────────────────────────────────────────────────────
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const {
    user,
    isAuthenticated,
    loading,
    updateUser,
    login,
    loginWithSms,
    sendLoginSmsCode,
    logout,
  } = useAuthProviderState();

  const userValue = useMemo<UserContextType>(() => ({
    user,
    updateUser,
    isAdmin: isAdmin(user),
    canViewAll: canViewAllData(user),
    isSuperAdmin: user?.isSuperAdmin === true || (isAdmin(user) && !user?.tenantId),
    isTenantOwner: user?.isTenantOwner === true,
  }), [user, updateUser]);

  const authStateValue = useMemo<AuthStateContextType>(() => ({
    isAuthenticated,
    loading,
    login,
    loginWithSms,
    sendLoginSmsCode,
    logout,
  }), [isAuthenticated, loading, login, loginWithSms, sendLoginSmsCode, logout]);

  return (
    <AuthStateContext.Provider value={authStateValue}>
      <UserContext.Provider value={userValue}>
        {children}
      </UserContext.Provider>
    </AuthStateContext.Provider>
  );
};

// ── Hooks ──────────────────────────────────────────────────────────────

/**
 * 向后兼容的组合钩子，返回认证状态 + 用户信息 + 权限。
 * 订阅两个 Context，任一变化都会触发重渲染。
 * 推荐新代码按需使用 useUser() 或 useAuthState() 以减少不必要的重渲染。
 */
export const useAuth = (): AuthContextType => {
  const authState = useContext(AuthStateContext);
  const userState = useContext(UserContext);
  if (!authState || !userState) {
    const metaEnv = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
    if (metaEnv?.DEV) {
      console.error('[AuthContext] useAuth must be used within AuthProvider. Returning fallback context.');
    }
    return fallbackAuthContext;
  }
  return { ...authState, ...userState };
};

/**
 * 仅订阅用户信息 + 权限数据。
 * 当认证状态（isAuthenticated/loading）变化时不会触发重渲染，
 * 适合只需要 user/isAdmin/isSuperAdmin 等字段的组件。
 */
export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (!context) return fallbackUserContext;
  return context;
};

/**
 * 仅订阅认证状态（isAuthenticated/loading/login/logout）。
 * 当用户信息变化时不会触发重渲染，
 * 适合登录页、路由守卫等只需认证流程的组件。
 */
export const useAuthState = (): AuthStateContextType => {
  const context = useContext(AuthStateContext);
  if (!context) return fallbackAuthStateContext;
  return context;
};

// ── 向后兼容：重新导出拆分后的类型与纯函数 ─────────────────────────────
export type {
  UserInfo,
  WorkspaceRole,
  UserContextType,
  AuthStateContextType,
  AuthContextType,
  AuthProviderProps,
} from './AuthContext.types';
export {
  isAdmin,
  isSupervisorOrAbove,
  canViewAllData,
  isAdminUser,
  isSupervisorOrAboveUser,
  getWorkspaceRole,
} from './AuthContext.helpers';
