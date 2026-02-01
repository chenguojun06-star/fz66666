import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import api from './api';

// 定义用户信息类型
export interface UserInfo {
  id: string;
  username: string;
  name: string;
  role: string;
  roleId?: string;
  permissions: string[];
  /** 数据权限范围: all=全部, team=团队, own=仅自己 */
  permissionRange?: 'all' | 'team' | 'own';
  phone?: string;
  email?: string;
  avatarUrl?: string;
}

/**
 * 判断是否为管理员
 */
export function isAdmin(user: UserInfo | null): boolean {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  return role.includes('admin') || role.includes('管理员') || user.roleId === '1';
}

/**
 * 判断是否为主管或以上
 */
export function isSupervisorOrAbove(user: UserInfo | null): boolean {
  if (isAdmin(user)) return true;
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  return role.includes('主管') || role.includes('manager') || role.includes('supervisor') || role.includes('组长');
}

/**
 * 判断是否可以查看所有数据
 */
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

// 定义上下文类型
interface AuthContextType {
  user: UserInfo | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  updateUser: (patch: Partial<UserInfo>) => void;
  logout: () => void;
  /** 便捷方法：是否管理员 */
  isAdmin: boolean;
  /** 便捷方法：是否可查看所有数据 */
  canViewAll: boolean;
}

// 创建上下文
const AuthContext = createContext<AuthContextType | undefined>(undefined);

const fallbackAuthContext: AuthContextType = {
  user: null,
  isAuthenticated: false,
  loading: false,
  login: async () => false,
  updateUser: () => {
  },
  logout: () => {
  },
  isAdmin: false,
  canViewAll: false,
};

// 上下文提供者组件
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const tokenStorageKey = 'authToken';
  const userStorageKey = 'userInfo';

  // 从本地缓存加载用户信息
  useEffect(() => {
    const boot = async () => {
      try {
        const token = String(localStorage.getItem(tokenStorageKey) || '').trim();
        if (!token) {
          setUser(null);
          setIsAuthenticated(false);
          setLoading(false);
          return;
        }

        // 恢复用户主题设置
        const restoreUserTheme = (userId: string) => {
          try {
            const userThemeKey = `app.theme.user.${userId}`;
            const userTheme = localStorage.getItem(userThemeKey);
            if (userTheme) {
              localStorage.setItem('app.theme', userTheme);
              if (typeof document !== 'undefined') {
                const root = document.documentElement;
                if (userTheme === 'default') {
                  root.removeAttribute('data-theme');
                } else {
                  root.setAttribute('data-theme', userTheme);
                }
              }
            }
          } catch {
            // Intentionally empty
            // 忽略错误
          }
        };

        setIsAuthenticated(true);

        const storedUser = localStorage.getItem(userStorageKey);
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
          } catch {
            // Intentionally empty
            // 忽略错误
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
              role: String(u.roleName || u.role || 'admin'),
              roleId: u.roleId != null ? String(u.roleId) : undefined,
              permissions: Array.isArray(u.permissions) ? (u.permissions as string[]) : ['all'],
              permissionRange: toPermissionRange(u.permissionRange),
              phone: u.phone != null ? String(u.phone) : undefined,
              email: u.email != null ? String(u.email) : undefined,
              avatarUrl: u.avatarUrl != null ? String(u.avatarUrl) : u.avatar != null ? String(u.avatar) : u.headUrl != null ? String(u.headUrl) : undefined,
            };
            localStorage.setItem(userStorageKey, JSON.stringify(next));
            setUser(next);

            // 恢复用户主题
            restoreUserTheme(next.id);
            // 触发用户登录事件
            window.dispatchEvent(new CustomEvent('user-login', { detail: { userId: next.id } }));
          } else {
            localStorage.removeItem(tokenStorageKey);
            localStorage.removeItem(userStorageKey);
            setUser(null);
            setIsAuthenticated(false);
          }
        } catch {
          // Intentionally empty
          // 忽略错误
          localStorage.removeItem(tokenStorageKey);
          localStorage.removeItem(userStorageKey);
          setUser(null);
          setIsAuthenticated(false);
        }
      } catch {
        // Intentionally empty
        // 忽略错误
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    boot();
  }, []);

  // 登录函数
  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = (await api.post('/system/user/login', { username, password })) as {
        code?: number;
        data?: Record<string, unknown> & { token?: unknown; user?: Record<string, unknown> };
      };
      const token = String(response?.data?.token || '').trim();
      const u = response?.data?.user || response?.data || null;
      if (response?.code === 200 && token && u) {
        const baseUser: UserInfo = {
          id: String(u.id || ''),
          username: String(u.username || ''),
          name: String(u.name || ''),
          role: String(u.roleName || u.role || 'admin'),
          roleId: u.roleId != null ? String(u.roleId) : undefined,
          permissions: ['all'],
          permissionRange: toPermissionRange(u.permissionRange),
          phone: u.phone != null ? String(u.phone) : undefined,
          email: u.email != null ? String(u.email) : undefined,
          avatarUrl: u.avatarUrl != null ? String(u.avatarUrl) : u.avatar != null ? String(u.avatar) : u.headUrl != null ? String(u.headUrl) : undefined,
        };

        localStorage.setItem(tokenStorageKey, token);
        localStorage.setItem(userStorageKey, JSON.stringify(baseUser));
        setUser(baseUser);
        setIsAuthenticated(true);

        // 恢复用户主题设置
        try {
          const userThemeKey = `app.theme.user.${baseUser.id}`;
          const userTheme = localStorage.getItem(userThemeKey) || 'default';
          localStorage.setItem('app.theme', userTheme);
          if (typeof document !== 'undefined') {
            const root = document.documentElement;
            if (userTheme === 'default') {
              root.removeAttribute('data-theme');
            } else {
              root.setAttribute('data-theme', userTheme);
            }
          }
          // 触发用户登录事件
          window.dispatchEvent(new CustomEvent('user-login', { detail: { userId: baseUser.id } }));
        } catch {
          // Intentionally empty
          // 忽略错误
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
        } catch {
          // Intentionally empty
          // 忽略错误
        }

        return true;
      }
      return false;
    } catch {
      // Intentionally empty
      // 忽略错误
      return false;
    }
  };

  const updateUser = (patch: Partial<UserInfo>) => {
    if (!patch) return;
    setUser((prev) => {
      if (!prev) return prev;
      const next: UserInfo = { ...prev, ...patch };
      try {
        localStorage.setItem(userStorageKey, JSON.stringify(next));
      } catch {
        // Intentionally empty
        // 忽略错误
      }
      return next;
    });
  };

  // 登出函数
  const logout = () => {
    localStorage.removeItem(tokenStorageKey);
    localStorage.removeItem(userStorageKey);

    // 更新状态
    setUser(null);
    setIsAuthenticated(false);

    // 清除主题设置，恢复默认主题
    try {
      localStorage.setItem('app.theme', 'default');
      if (typeof document !== 'undefined') {
        document.documentElement.removeAttribute('data-theme');
      }
      // 触发用户退出事件
      window.dispatchEvent(new Event('user-logout'));
    } catch {
      // Intentionally empty
      // 忽略错误
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      loading,
      login,
      updateUser,
      logout,
      isAdmin: isAdmin(user),
      canViewAll: canViewAllData(user),
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// 自定义钩子，方便组件使用上下文
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    // 在开发环境下给出警告，但不抛出错误（避免热重载问题）
    const metaEnv = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
    if (metaEnv?.DEV) {
      console.error('[AuthContext] useAuth must be used within AuthProvider. Returning fallback context.');
    }
    return fallbackAuthContext;
  }
  return context;
};

export const isAdminUser = (user?: Partial<UserInfo> | null) => {
  const role = String((user as Record<string, unknown>)?.role ?? (user as Record<string, unknown>)?.roleName ?? '').trim();
  const username = String((user as Record<string, unknown>)?.username ?? '').trim();
  if (username === 'admin') return true;
  if (role === '1') return true;
  const lower = role.toLowerCase();
  return lower.includes('admin') || role.includes('管理员');
};

export const isSupervisorOrAboveUser = (user?: Partial<UserInfo> | null) => {
  if (isAdminUser(user)) return true;
  const role = String((user as Record<string, unknown>)?.role ?? (user as Record<string, unknown>)?.roleName ?? '').trim();
  if (!role) return false;
  const lower = role.toLowerCase();
  if (lower.includes('manager') || lower.includes('supervisor') || role.includes('主管')) return true;
  const perms = Array.isArray((user as Record<string, unknown>)?.permissions)
    ? ((user as Record<string, unknown>).permissions as string[])
    : [];
  return perms.includes('all');
};
