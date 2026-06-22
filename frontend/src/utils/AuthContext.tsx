import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo, useCallback } from 'react';
import api from './api';
import { resetSmartFeatureFlags } from '@/smart/core/featureFlags';
import { useSmartFeatureStore } from '@/smart/core/smartFeatureStore';

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

const toPermissionRange = (value: unknown): UserInfo['permissionRange'] => {
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

// ── 常量（提取到模块级，避免组件内重复创建）──────────────────────────
const TOKEN_STORAGE_KEY = 'authToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_STORAGE_KEY = 'userInfo';
const FALLBACK_THEME = 'white';

const applyThemeValue = (nextTheme: string | null | undefined) => {
  if (typeof document === 'undefined') return;
  const raw = String(nextTheme || '').trim();
  const resolvedTheme = !raw || raw === 'default' ? FALLBACK_THEME : raw;
  document.documentElement.setAttribute('data-theme', resolvedTheme);
};

const loadTenantSmartFlags = async () => {
  try {
    await useSmartFeatureStore.getState().fetchFromServer();
  } catch {
    // Ignore smart feature bootstrap failures and keep local fallback.
  }
};

// ── Context 类型定义 ──────────────────────────────────────────────────

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
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const updateUser = useCallback((patch: Partial<UserInfo>) => {
    if (!patch) return;
    setUser((prev) => {
      if (!prev) return prev;
      const next: UserInfo = { ...prev, ...patch };
      try {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Intentionally empty
      }
      return next;
    });
  }, []);

  const completeLogin = useCallback(async (
    response: {
      code?: number;
      data?: Record<string, unknown> & { token?: unknown; user?: Record<string, unknown> };
    },
    defaultErrorMessage: string,
  ): Promise<{ success: boolean; user?: UserInfo }> => {
    const token = String(response?.data?.token || '').trim();
    const refreshToken = String((response?.data as Record<string, unknown>)?.refreshToken || '').trim();
    const u = response?.data?.user || response?.data || null;
    if (response?.code === 200 && token && u) {
      const keysToRemove = [TOKEN_STORAGE_KEY, REFRESH_TOKEN_KEY, USER_STORAGE_KEY, 'user-storage', 'userId'];
      keysToRemove.forEach(k => {
        try { localStorage.removeItem(k); } catch { /* ignore */ }
      });
      window.dispatchEvent(new Event('user-logout'));

      const baseUser: UserInfo = {
        id: String(u.id || ''),
        username: String(u.username || ''),
        name: String(u.name || ''),
        role: String(u.roleName || u.role || ''),
        roleId: u.roleId != null ? String(u.roleId) : undefined,
        // 默认空权限，接口获取真实权限后再更新；避免接口失败时保留 ['all'] 导致权限绕过
        permissions: [],
        permissionRange: toPermissionRange(u.permissionRange),
        phone: u.phone != null ? String(u.phone) : undefined,
        email: u.email != null ? String(u.email) : undefined,
        avatarUrl: u.avatarUrl != null ? String(u.avatarUrl) : u.avatar != null ? String(u.avatar) : u.headUrl != null ? String(u.headUrl) : undefined,
        tenantId: u.tenantId != null ? String(u.tenantId) : undefined,
        tenantName: u.tenantName != null ? String(u.tenantName) : undefined,
        isTenantOwner: u.isTenantOwner === true,
        isFactoryOwner: u.isFactoryOwner === true,
        isSuperAdmin: u.isSuperAdmin === true,
        factoryId: u.factoryId != null ? String(u.factoryId) : undefined,
        tenantType: u.tenantType != null ? (u.tenantType as 'SELF_FACTORY' | 'HYBRID' | 'BRAND') : undefined,
        tenantModules: (() => {
          try {
            const raw = u.tenantEnabledModules;
            if (!raw) return undefined;
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return Array.isArray(parsed) && parsed.length > 0 ? (parsed as string[]) : undefined;
          } catch { return undefined; }
        })(),
      };

      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(baseUser));
      setUser(baseUser);
      setIsAuthenticated(true);

      await loadTenantSmartFlags();

      try {
        const userThemeKey = `app.theme.user.${baseUser.id}`;
        const userTheme = localStorage.getItem(userThemeKey) || FALLBACK_THEME;
        localStorage.setItem('app.theme', userTheme);
        applyThemeValue(userTheme);
        window.dispatchEvent(new CustomEvent('user-login', { detail: { userId: baseUser.id } }));
      } catch (e) {
        console.warn('[AuthContext] 登录后主题恢复失败', e);
      }

      try {
        const rid = baseUser.roleId;
        if (rid != null) {
          const pRes = (await api.get('/system/user/permissions', {
            params: { roleId: rid },
          })) as { code?: number; data?: unknown };
          if (pRes?.code === 200 && Array.isArray(pRes.data) && pRes.data.length) {
            updateUser({ permissions: pRes.data as string[] });
          }
        }
      } catch (e) {
        console.warn('[AuthContext] 权限列表获取失败，使用默认权限', e);
      }

      window.location.href = '/';
      return { success: true, user: baseUser };
    }
    throw new Error(defaultErrorMessage);
  }, [updateUser]);

  const login = useCallback(async (username: string, password: string, tenantId?: number): Promise<{ success: boolean; user?: UserInfo }> => {
    try {
      const response = (await api.post('/system/user/login', { username, password, tenantId })) as {
        code?: number;
        data?: Record<string, unknown> & { token?: unknown; user?: Record<string, unknown> };
      };
      return await completeLogin(response, '登录失败，请检查用户名和密码');
    } catch (e: unknown) {
      const msg = (e instanceof Error ? e.message : String((e as any)?.message || '')) || '登录失败，请检查用户名和密码';
      throw new Error(msg);
    }
  }, [completeLogin]);

  const loginWithSms = useCallback(async (phone: string, code: string, tenantId?: number): Promise<{ success: boolean; user?: UserInfo }> => {
    try {
      const response = (await api.post('/system/user/login/sms', { phone, code, tenantId })) as {
        code?: number;
        data?: Record<string, unknown> & { token?: unknown; user?: Record<string, unknown> };
      };
      return await completeLogin(response, '登录失败，请检查手机号和验证码');
    } catch (e: unknown) {
      const msg = (e instanceof Error ? e.message : String((e as any)?.message || '')) || '登录失败，请检查手机号和验证码';
      throw new Error(msg);
    }
  }, [completeLogin]);

  const sendLoginSmsCode = useCallback(async (phone: string, tenantId?: number): Promise<Record<string, unknown>> => {
    try {
      const response = (await api.post('/system/user/login/sms-code', { phone, tenantId })) as {
        code?: number;
        data?: Record<string, unknown>;
        message?: string;
      };
      if (response?.code === 200) {
        return response.data || {};
      }
      throw new Error(String(response?.message || '验证码发送失败，请稍后重试'));
    } catch (e: unknown) {
      const msg = (e instanceof Error ? e.message : String((e as any)?.message || '')) || '验证码发送失败，请稍后重试';
      throw new Error(msg);
    }
  }, []);

  const logout = useCallback(() => {
    const keysToRemove = [
      TOKEN_STORAGE_KEY,
      REFRESH_TOKEN_KEY,
      USER_STORAGE_KEY,
      'user-storage',
      'userId',
    ];
    keysToRemove.forEach(k => {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    });
    resetSmartFeatureFlags();

    setUser(null);
    setIsAuthenticated(false);

    try {
      localStorage.setItem('app.theme', FALLBACK_THEME);
      applyThemeValue(FALLBACK_THEME);
      window.dispatchEvent(new Event('user-logout'));
    } catch {
      // Intentionally empty
    }
  }, []);

  useEffect(() => {
    const boot = async () => {
      try {
        const token = String(localStorage.getItem(TOKEN_STORAGE_KEY) || '').trim();
        if (!token) {
          resetSmartFeatureFlags();
          setUser(null);
          setIsAuthenticated(false);
          setLoading(false);
          return;
        }

        const isJwtExpired = (t: string): boolean => {
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

        if (isJwtExpired(token)) {
          const savedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
          if (savedRefreshToken) {
            try {
              const refreshRes = (await api.post('/system/user/refresh-token', { refreshToken: savedRefreshToken })) as { code?: number; data?: Record<string, unknown> };
              if (refreshRes?.code === 200 && refreshRes.data?.token) {
                const newToken = String(refreshRes.data.token).trim();
                const newRefresh = String(refreshRes.data.refreshToken || '').trim();
                localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
                if (newRefresh) localStorage.setItem(REFRESH_TOKEN_KEY, newRefresh);
              } else {
                localStorage.removeItem(TOKEN_STORAGE_KEY);
                localStorage.removeItem(REFRESH_TOKEN_KEY);
                localStorage.removeItem('userId');
                resetSmartFeatureFlags();
                setUser(null);
                setIsAuthenticated(false);
                setLoading(false);
                return;
              }
            } catch {
              localStorage.removeItem(TOKEN_STORAGE_KEY);
              localStorage.removeItem(REFRESH_TOKEN_KEY);
              localStorage.removeItem('userId');
              resetSmartFeatureFlags();
              setUser(null);
              setIsAuthenticated(false);
              setLoading(false);
              return;
            }
          } else {
            localStorage.removeItem(TOKEN_STORAGE_KEY);
            localStorage.removeItem('userId');
            resetSmartFeatureFlags();
            setUser(null);
            setIsAuthenticated(false);
            setLoading(false);
            return;
          }
        }

        const restoreUserTheme = (userId: string) => {
          try {
            const userThemeKey = `app.theme.user.${userId}`;
            const userTheme = localStorage.getItem(userThemeKey);
            const resolvedTheme = userTheme || FALLBACK_THEME;
            localStorage.setItem('app.theme', resolvedTheme);
          } catch {
            // Intentionally empty
          }
        };

        setIsAuthenticated(true);

        const storedUser = localStorage.getItem(USER_STORAGE_KEY);
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
          } catch {
            // Intentionally empty
          }
        }

        try {
          const res = (await api.get('/system/user/me')) as { code?: number; data?: Record<string, unknown> };
          if (res?.code === 200 && res.data) {
            const u = res.data;
            const next: UserInfo = {
              id: String(u.id || ''),
              username: String(u.username || ''),
              name: String(u.name || ''),
              role: String(u.roleName || u.role || ''),
              roleId: u.roleId != null ? String(u.roleId) : undefined,
              // 从接口获取权限，接口失败时默认为空
              permissions: Array.isArray(u.permissions) ? (u.permissions as string[]) : [],
              permissionRange: toPermissionRange(u.permissionRange),
              phone: u.phone != null ? String(u.phone) : undefined,
              email: u.email != null ? String(u.email) : undefined,
              avatarUrl: u.avatarUrl != null ? String(u.avatarUrl) : u.avatar != null ? String(u.avatar) : u.headUrl != null ? String(u.headUrl) : undefined,
              tenantId: u.tenantId != null ? String(u.tenantId) : undefined,
              tenantName: u.tenantName != null ? String(u.tenantName) : undefined,
              isTenantOwner: u.isTenantOwner === true,
              isFactoryOwner: u.isFactoryOwner === true,
              isSuperAdmin: u.isSuperAdmin === true,
              factoryId: u.factoryId != null ? String(u.factoryId) : undefined,
              tenantType: u.tenantType != null ? (u.tenantType as 'SELF_FACTORY' | 'HYBRID' | 'BRAND') : undefined,
              tenantModules: (() => {
                try {
                  const raw = u.tenantEnabledModules;
                  if (!raw) return undefined;
                  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                  return Array.isArray(parsed) && parsed.length > 0 ? (parsed as string[]) : undefined;
                } catch { return undefined; }
              })(),
            };
            localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(next));
            setUser(next);

            await loadTenantSmartFlags();

            restoreUserTheme(next.id);
            window.dispatchEvent(new CustomEvent('user-login', { detail: { userId: next.id } }));
          } else {
            localStorage.removeItem(TOKEN_STORAGE_KEY);
            localStorage.removeItem(USER_STORAGE_KEY);
            resetSmartFeatureFlags();
            setUser(null);
            setIsAuthenticated(false);
          }
        } catch {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          localStorage.removeItem(USER_STORAGE_KEY);
          resetSmartFeatureFlags();
          setUser(null);
          setIsAuthenticated(false);
        }
      } catch {
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    boot();
  }, []);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === TOKEN_STORAGE_KEY) {
        if (!e.newValue) {
          setUser(null);
          setIsAuthenticated(false);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

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
