/**
 * 应用全局状态管理
 * 
 * 管理应用级别的状态：主题、语言、加载状态等
 * 
 * 使用示例：
 * ```tsx
 * import { useAppStore } from '@/stores/appStore';
 * 
 * function MyComponent() {
 *   const { loading, setLoading, showMessage } = useAppStore();
 *   
 *   return (
 *     <Spin spinning={loading}>
 *       <div>Content</div>
 *     </Spin>
 *   );
 * }
 * ```
 */

import { create } from 'zustand';
import { message } from 'antd';

interface AppState {
  // 状态
  loading: boolean;
  collapsed: boolean; // 侧边栏折叠状态
  theme: 'light' | 'dark';
  
  // 操作
  setLoading: (loading: boolean) => void;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  showMessage: (type: 'success' | 'error' | 'info' | 'warning', content: string) => void;
}

export const useAppStore = create<AppState>()((set, get) => ({
  // 初始状态
  loading: false,
  collapsed: false,
  theme: 'light',

  // 设置全局加载状态
  setLoading: (loading) => {
    set({ loading });
  },

  // 设置侧边栏折叠状态
  setCollapsed: (collapsed) => {
    set({ collapsed });
  },

  // 切换侧边栏折叠状态
  toggleCollapsed: () => {
    set({ collapsed: !get().collapsed });
  },

  // 设置主题
  setTheme: (theme) => {
    set({ theme });
  },

  // 显示消息提示
  showMessage: (type, content) => {
    message[type](content);
  },
}));
