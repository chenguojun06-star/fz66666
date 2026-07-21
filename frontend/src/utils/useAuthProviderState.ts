import { useCallback, useEffect, useState } from 'react';
import api from './api';
import { resetSmartFeatureFlags } from '@/smart/core/featureFlags';
import type { UserInfo } from './AuthContext.types';
import {
  TOKEN_STORAGE_KEY,
  REFRESH_TOKEN_KEY,
  USER_STORAGE_KEY,
  FALLBACK_THEME,
  toPermissionRange,
  applyThemeValue,
  loadTenantSmartFlags,
  isJwtExpired,
} from './AuthContext.helpers';

/**
 * 内部状态管理 hook：封装 AuthProvider 的所有 state/effect/业务逻辑。
 * Provider 组件仅负责 Context 注入，本 hook 负责状态变更。
 */
export const useAuthProviderState = () => {
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

  return {
    user,
    isAuthenticated,
    loading,
    updateUser,
    login,
    loginWithSms,
    sendLoginSmsCode,
    logout,
  };
};
