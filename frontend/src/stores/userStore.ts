/**
 * 用户状态管理
 * 
 * 管理用户登录状态、权限、个人信息等
 * 
 * 使用示例：
 * ```tsx
 * import { useUserStore } from '@/stores/userStore';
 * 
 * function MyComponent() {
 *   const { user, permissions, fetchUser, logout } = useUserStore();
 *   
 *   useEffect(() => {
 *     fetchUser();
 *   }, []);
 *   
 *   return <div>{user?.username}</div>;
 * }
 * ```
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../utils/api';

interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  roleName: string;
  permissionRange?: string;
}

interface Permission {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface UserState {
  // 状态
  user: User | null;
  permissions: Permission[];
  token: string | null;
  loading: boolean;
  error: string | null;
  
  // 操作
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setPermissions: (permissions: Permission[]) => void;
  fetchUser: () => Promise<void>;
  fetchPermissions: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permissionCode: string) => boolean;
  isAdmin: () => boolean;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      // 初始状态
      user: null,
      permissions: [],
      token: localStorage.getItem('authToken'),
      loading: false,
      error: null,

      // 设置用户信息
      setUser: (user) => {
        set({ user });
      },

      // 设置Token
      setToken: (token) => {
        set({ token });
        if (token) {
          localStorage.setItem('authToken', token);
        } else {
          localStorage.removeItem('authToken');
        }
      },

      // 设置权限列表
      setPermissions: (permissions) => {
        set({ permissions });
      },

      
      
      

      // 获取用户信息
      fetchUser: async () => {
        set({ loading: true, error: null });
        try {
          const response = await api.get<{ code: number; data: User; message?: string }>('/system/user/me');
          if (response.code === 200) {
            set({ user: response.data, loading: false });
          } else {
            set({ error: response.message, loading: false });
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : (typeof error === 'object' && error && 'message' in error ? String((error as { message?: unknown }).message || '') : '');
          set({ error: msg || '获取用户信息失败', loading: false });
        }
      },

      // 获取用户权限
      fetchPermissions: async () => {
        set({ loading: true, error: null });
        try {
          const response = await api.get<{ code: number; data: Permission[]; message?: string }>('/system/user/permissions');
          if (response.code === 200) {
            set({ permissions: response.data || [], loading: false });
          } else {
            set({ error: response.message, loading: false });
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : (typeof error === 'object' && error && 'message' in error ? String((error as { message?: unknown }).message || '') : '');
          set({ error: msg || '获取权限失败', loading: false });
        }
      },

      // 登录
      login: async (username: string, password: string) => {
        set({ loading: true, error: null });
        try {
          const response = await api.post<{ code: number; data?: { token?: string; user?: User }; message?: string }>('/system/user/login', { username, password });
          if (response.code === 200 && response.data) {
            const { token, user } = response.data;
            get().setToken(token || null);
            get().setUser(user || null);
            // 登录成功后获取权限
            await get().fetchPermissions();
            set({ loading: false });
          } else {
            set({ error: response.message || '登录失败', loading: false });
            throw new Error(response.message || '登录失败');
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : (typeof error === 'object' && error && 'message' in error ? String((error as { message?: unknown }).message || '') : '');
          const errorMessage = msg || '登录失败';
          set({ error: errorMessage, loading: false });
          throw new Error(errorMessage);
        }
      },

      // 登出
      logout: () => {
        get().setToken(null);
        get().setUser(null);
        get().setPermissions([]);
        // 跳转到登录页
        window.location.href = '/login';
      },

      // 检查是否有权限
      hasPermission: (permissionCode: string) => {
        const { permissions, user } = get();
        // 管理员拥有所有权限
        if (user?.role === 'admin' || user?.role === 'ADMIN') {
          return true;
        }
        // 检查权限列表
        return permissions.some(p => p.code === permissionCode);
      },

      // 检查是否是管理员
      isAdmin: () => {
        const { user } = get();
        return user?.role === 'admin' || user?.role === 'ADMIN';
      },
    }),
    {
      name: 'user-storage', // localStorage key
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        permissions: state.permissions,
      }), // 只持久化这些字段
    }
  )
);
