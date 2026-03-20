import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import api from './api';
import tenantSmartFeatureService from '@/services/system/tenantSmartFeatureService';
import { replaceSmartFeatureFlags, resetSmartFeatureFlags } from '@/smart/core/featureFlags';

// 定义用户信息类型
export interface UserInfo extends Record<string, unknown> {
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
  /** 租户ID（多租户隔离） */
  tenantId?: string;
  /** 租户名称 */
  tenantName?: string;
  /** 是否为租户主账号 */
  isTenantOwner?: boolean;
  /** 是否为平台超级管理员 */
  isSuperAdmin?: boolean;
  /**
   * 外发工厂联系人账号的工厂 ID（普通品牌账号为 undefined）。
   * 不为空时表示该用户是某外发工厂的联系人，应显示工厂端视图。
   */
  factoryId?: string;
  /**
   * 所属租户类型：SELF_FACTORY | HYBRID | BRAND
   * 用于前端菜单裁剪提示（已由后端权限控制实际访问）
   */
  tenantType?: 'SELF_FACTORY' | 'HYBRID' | 'BRAND';
  /**
   * 租户已启用的菜单路径列表。
   * - undefined / null / 空数组 → 全部开放（向后兼容）
   * - 有值 → 仅显示列表内的菜单项，其余全部隐藏
   */
  tenantModules?: string[];
}

export type WorkspaceRole = 'boss' | 'management' | 'merchandiser';

/**
 * 判断是否为管理员
 */
export function isAdmin(user: UserInfo | null): boolean {
  if (!user) return false;
  // 租户主账号和超级管理员天然是管理员
  if (user.isTenantOwner || user.isSuperAdmin) return true;
  const role = (user.role || '').toLowerCase();
  return role.includes('admin') || role.includes('管理员') || role.includes('管理') || user.roleId === '1';
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
  login: (username: string, password: string, tenantId?: number) => Promise<boolean>;
  updateUser: (patch: Partial<UserInfo>) => void;
  logout: () => void;
  /** 便捷方法：是否管理员 */
  isAdmin: boolean;
  /** 便捷方法：是否可查看所有数据 */
  canViewAll: boolean;
  /** 便捷方法：是否超级管理员（无租户限制） */
  isSuperAdmin: boolean;
  /** 便捷方法：是否租户主账号 */
  isTenantOwner: boolean;
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
  isSuperAdmin: false,
  isTenantOwner: false,
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

  const loadTenantSmartFlags = async () => {
    try {
      const flags = await tenantSmartFeatureService.list();
      replaceSmartFeatureFlags(flags);
    } catch {
      // Ignore smart feature bootstrap failures and keep local fallback.
    }
  };

  // 从本地缓存加载用户信息
  useEffect(() => {
    const boot = async () => {
      try {
        const token = String(localStorage.getItem(tokenStorageKey) || '').trim();
        if (!token) {
          resetSmartFeatureFlags();
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
              tenantId: u.tenantId != null ? String(u.tenantId) : undefined,
              tenantName: u.tenantName != null ? String(u.tenantName) : undefined,
              isTenantOwner: u.isTenantOwner === true,
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
            localStorage.setItem(userStorageKey, JSON.stringify(next));
            setUser(next);

            await loadTenantSmartFlags();

            // 恢复用户主题
            restoreUserTheme(next.id);
            // 触发用户登录事件
            window.dispatchEvent(new CustomEvent('user-login', { detail: { userId: next.id } }));
          } else {
            localStorage.removeItem(tokenStorageKey);
            localStorage.removeItem(userStorageKey);
            resetSmartFeatureFlags();
            setUser(null);
            setIsAuthenticated(false);
          }
        } catch {
          // Intentionally empty
          // 忽略错误
          localStorage.removeItem(tokenStorageKey);
          localStorage.removeItem(userStorageKey);
          resetSmartFeatureFlags();
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

  // 🔐 跨标签页 token 变更检测：当其他标签页登录/登出时，自动同步状态
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === tokenStorageKey) {
        if (!e.newValue) {
          // 其他标签页登出了 → 本标签页也登出
          setUser(null);
          setIsAuthenticated(false);
        } else if (e.newValue !== e.oldValue) {
          // 其他标签页切换了用户 → 刷新页面以加载新用户数据
          window.location.reload();
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // 登录函数
  const login = async (username: string, password: string, tenantId?: number): Promise<boolean> => {
    try {
      const response = (await api.post('/system/user/login', { username, password, tenantId })) as {
        code?: number;
        data?: Record<string, unknown> & { token?: unknown; user?: Record<string, unknown> };
      };
      const token = String(response?.data?.token || '').trim();
      const u = response?.data?.user || response?.data || null;
      if (response?.code === 200 && token && u) {
        // 🔐 登录成功：先清除所有旧账号数据，防止跨账号数据残留
        const keysToRemove = [tokenStorageKey, userStorageKey, 'user-storage', 'userId'];
        keysToRemove.forEach(k => {
          try { localStorage.removeItem(k); } catch { /* ignore */ }
        });
        // 通知业务组件清理旧数据
        window.dispatchEvent(new Event('user-logout'));

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
          tenantId: u.tenantId != null ? String(u.tenantId) : undefined,
          tenantName: u.tenantName != null ? String(u.tenantName) : undefined,
          isTenantOwner: u.isTenantOwner === true,
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

        localStorage.setItem(tokenStorageKey, token);
        localStorage.setItem(userStorageKey, JSON.stringify(baseUser));
        setUser(baseUser);
        setIsAuthenticated(true);

        await loadTenantSmartFlags();

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

        // 🔐 强制刷新页面，清空所有 React 组件状态（防止跨租户数据残留）
        // 这是最可靠的方式：unmount 所有组件 → 重新 mount → 每个组件重新请求数据
        window.location.href = '/';
        return true;
      }
      return false;
    } catch (e: unknown) {
      // 把后端真实错误消息作为 Error 抛出，让调用方展示
      const msg = (e instanceof Error ? e.message : String((e as any)?.message || '')) || '登录失败，请检查用户名和密码';
      throw new Error(msg);
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
    // 清除所有与登录态相关的 localStorage key
    const keysToRemove = [
      tokenStorageKey,   // 'authToken'
      userStorageKey,    // 'userInfo'
      'user-storage',    // Zustand persist (userStore)
      'userId',          // api core.ts 用于 X-User-Id header
    ];
    keysToRemove.forEach(k => {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    });
    resetSmartFeatureFlags();

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
      isSuperAdmin: user?.isSuperAdmin === true || (isAdmin(user) && !user?.tenantId),
      isTenantOwner: user?.isTenantOwner === true,
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
  const role = String((user as any)?.role ?? (user as any)?.roleName ?? '').trim();
  const username = String((user as any)?.username ?? '').trim();
  if (username === 'admin') return true;
  // 租户主账号和超级管理员天然是管理员
  if ((user as any)?.isTenantOwner === true) return true;
  if ((user as any)?.isSuperAdmin === true) return true;
  if (role === '1') return true;
  const lower = role.toLowerCase();
  return lower.includes('admin') || role.includes('管理员') || role.includes('管理');
};

export const isSupervisorOrAboveUser = (user?: Partial<UserInfo> | null) => {
  if (isAdminUser(user)) return true;
  // 超级管理员（云裳智链平台）也有退回权限
  if ((user as any)?.isSuperAdmin === true) return true;
  const role = String((user as any)?.role ?? (user as any)?.roleName ?? '').trim();
  if (!role) return false;
  const lower = role.toLowerCase();
  // 全能管理包含所有权限，视同主管以上
  if (lower.includes('manager') || lower.includes('supervisor') || role.includes('主管') || role.includes('全能')) return true;
  const perms = Array.isArray((user as any)?.permissions)
    ? ((user as any).permissions as string[])
    : [];
  return perms.includes('all');
};

export const getWorkspaceRole = (user?: Partial<UserInfo> | null): WorkspaceRole => {
  const role = String((user as any)?.role ?? (user as any)?.roleName ?? '').trim();
  if ((user as any)?.isTenantOwner === true || role.includes('老板') || role.includes('总经理')) {
    return 'boss';
  }
  if ((user as any)?.isSuperAdmin === true) {
    return 'boss';
  }
  if (isSupervisorOrAboveUser(user)) {
    return 'management';
  }
  return 'merchandiser';
};
