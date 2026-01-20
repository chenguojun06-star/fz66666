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
  phone?: string;
  email?: string;
  avatarUrl?: string;
}

// 定义上下文类型
interface AuthContextType {
  user: UserInfo | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  updateUser: (patch: Partial<UserInfo>) => void;
  logout: () => void;
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

        setIsAuthenticated(true);

        const storedUser = localStorage.getItem(userStorageKey);
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
          } catch {
          }
        }

        try {
          const res: any = await api.get('/system/user/me');
          if (res?.code === 200 && res.data) {
            const u = res.data;
            const next: UserInfo = {
              id: String(u.id),
              username: u.username,
              name: u.name,
              role: u.roleName || u.role || 'admin',
              roleId: u.roleId ? String(u.roleId) : undefined,
              permissions: Array.isArray(u.permissions) ? u.permissions : ['all'],
              phone: u.phone || undefined,
              email: u.email || undefined,
              avatarUrl: u.avatarUrl || u.avatar || u.headUrl || undefined,
            };
            localStorage.setItem(userStorageKey, JSON.stringify(next));
            setUser(next);
          } else {
            localStorage.removeItem(tokenStorageKey);
            localStorage.removeItem(userStorageKey);
            setUser(null);
            setIsAuthenticated(false);
          }
        } catch {
          localStorage.removeItem(tokenStorageKey);
          localStorage.removeItem(userStorageKey);
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

  // 登录函数
  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await api.post('/system/user/login', { username, password }) as any;
      const token = String(response?.data?.token || '').trim();
      const u = response?.data?.user || response?.data || null;
      if (response?.code === 200 && token && u) {
        const baseUser: UserInfo = {
          id: String(u.id),
          username: u.username,
          name: u.name,
          role: u.roleName || u.role || 'admin',
          roleId: u.roleId ? String(u.roleId) : undefined,
          permissions: ['all'],
          phone: u.phone || undefined,
          email: u.email || undefined,
          avatarUrl: u.avatarUrl || u.avatar || u.headUrl || undefined,
        };

        localStorage.setItem(tokenStorageKey, token);
        localStorage.setItem(userStorageKey, JSON.stringify(baseUser));
        setUser(baseUser);
        setIsAuthenticated(true);

        try {
          const rid = baseUser.roleId;
          if (rid != null) {
            const pRes: any = await api.get('/system/user/permissions', {
              params: { roleId: rid },
            });
            if (pRes?.code === 200 && Array.isArray(pRes.data) && pRes.data.length) {
              updateUser({ permissions: pRes.data as string[] });
            }
          }
        } catch {
        }

        return true;
      }
      return false;
    } catch {
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
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, login, updateUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// 自定义钩子，方便组件使用上下文
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context) return context;
  if ((import.meta as any)?.env?.DEV) {
    throw new Error('必须在认证上下文提供者内部使用该钩子');
  }
  return fallbackAuthContext;
};

export const isAdminUser = (user?: Partial<UserInfo> | null) => {
  const role = String((user as any)?.role ?? (user as any)?.roleName ?? '').trim();
  const username = String((user as any)?.username ?? '').trim();
  if (username === 'admin') return true;
  if (role === '1') return true;
  const lower = role.toLowerCase();
  return lower.includes('admin') || role.includes('管理员');
};

export const isSupervisorOrAboveUser = (user?: Partial<UserInfo> | null) => {
  if (isAdminUser(user)) return true;
  const role = String((user as any)?.role ?? (user as any)?.roleName ?? '').trim();
  if (!role) return false;
  const lower = role.toLowerCase();
  if (lower.includes('manager') || lower.includes('supervisor') || role.includes('主管')) return true;
  const perms = Array.isArray((user as any)?.permissions) ? (user as any).permissions : [];
  return perms.includes('all');
};
