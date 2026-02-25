// 屏蔽腾讯云 CloudBase 宿主环境注入的 SDK 噪音日志
// 这些日志与业务无关（CloudBase 客户端DB SDK尝试初始化但找不到配置，正常现象）
(function suppressCloudBaseNoise() {
  const NOISE = ['[lite]', '@@ multi_tenant', '[ASSERT]', 'single-spa minified', 'res_test'];
  const wrap = (fn: (...args: unknown[]) => void) => (...args: unknown[]) => {
    const msg = String(args[0] ?? '');
    if (NOISE.some(k => msg.includes(k))) return;
    fn.apply(console, args);
  };
  console.log  = wrap(console.log.bind(console));
  console.warn = wrap(console.warn.bind(console));
  console.info = wrap(console.info.bind(console));
})();

import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { AuthProvider } from './utils/AuthContext';
import { AppProvider } from './utils/AppContext';
import 'antd/dist/reset.css'; // 引入组件库样式
import './styles/global.css';
import './styles/design-system.css'; // 设计系统
import './styles/dark-theme-global.css'; // 深色主题全局覆盖
import './styles/button-override.css'; // 按钮统一样式

const themeStorageKey = 'app.theme';

const applyTheme = (themeValue: string | null) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const t = String(themeValue || '').trim();
  if (!t || t === 'default') {
    root.removeAttribute('data-theme');
    return;
  }
  root.setAttribute('data-theme', t);
};

const shouldSuppressExternalError = (message: string, filename?: string, stack?: string) => {
  const msg = String(message || '').trim();
  const file = String(filename || '').trim();
  const st = String(stack || '').trim();
  if (!msg) return false;

  if (msg.includes('No checkout popup config found')) return true;

  const isExtension =
    file.startsWith('chrome-extension://') ||
    file.startsWith('moz-extension://') ||
    st.includes('chrome-extension://') ||
    st.includes('moz-extension://');

  if (isExtension && msg.includes('A listener indicated an asynchronous response')) return true;
  return false;
};

try {
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (e) => {
      const reason: any = (e as any)?.reason;
      const msg = String(reason?.message || reason || '').trim();
      const stack = String(reason?.stack || '').trim();
      if (shouldSuppressExternalError(msg, undefined, stack)) {
        e.preventDefault();
      }
    });

    window.addEventListener('error', (e) => {
      const ev: any = e as any;
      const msg = String(ev?.message || '').trim();
      const file = String(ev?.filename || '').trim();
      const stack = String(ev?.error?.stack || '').trim();
      if (shouldSuppressExternalError(msg, file, stack)) {
        e.preventDefault();
      }
    });
  }
} catch {
    // Intentionally empty
      // 忽略错误
}

try {
  applyTheme(localStorage.getItem(themeStorageKey));
} catch {
    // Intentionally empty
      // 忽略错误
}

// 深色主题 token 配置（雾黑色调）
const darkThemeTokens = {
  colorPrimary: '#6ba3ff',
  colorPrimaryBg: 'rgba(107, 163, 255, 0.15)',
  colorPrimaryBgHover: 'rgba(107, 163, 255, 0.25)',
  colorPrimaryBorder: 'rgba(107, 163, 255, 0.3)',
  colorPrimaryBorderHover: 'rgba(107, 163, 255, 0.5)',
  colorPrimaryHover: '#85b8ff',
  colorPrimaryActive: '#5a9cff',
  colorBgContainer: '#1a1d24',
  colorBgElevated: '#1a1d24',
  colorBgLayout: '#0f1115',
  colorBgSpotlight: '#23272f',
  colorBorder: 'rgba(255, 255, 255, 0.1)',
  colorBorderSecondary: 'rgba(255, 255, 255, 0.06)',
  colorText: '#f0f2f5',
  colorTextSecondary: '#b8bdc6',
  colorTextTertiary: '#8b92a0',
  colorTextQuaternary: 'rgba(240, 242, 245, 0.4)',
  colorFill: 'rgba(255, 255, 255, 0.06)',
  colorFillSecondary: 'rgba(255, 255, 255, 0.04)',
  colorFillTertiary: 'rgba(255, 255, 255, 0.02)',
  colorBgTextHover: 'rgba(255, 255, 255, 0.06)',
  colorBgTextActive: 'rgba(255, 255, 255, 0.1)',
  colorSuccess: '#63d97a',
  colorWarning: '#ffc247',
  colorError: '#ff5f5f',
  colorInfo: '#6ba3ff',
  controlItemBgHover: 'rgba(107, 163, 255, 0.1)',
  controlItemBgActive: 'rgba(107, 163, 255, 0.18)',
};

// 蓝色主题 token 配置
const blueThemeTokens = {
  colorPrimary: '#2D7FF9',
  colorBgContainer: '#ffffff',
  colorBgElevated: '#ffffff',
  colorBgLayout: '#eaf1ff',
  colorBorder: 'rgba(45, 127, 249, 0.18)',
  colorBorderSecondary: 'rgba(45, 127, 249, 0.12)',
  colorText: '#0b2d5c',
  colorTextSecondary: 'rgba(11, 45, 92, 0.72)',
  colorTextTertiary: 'rgba(11, 45, 92, 0.52)',
};

// 浅蓝色主题 token 配置（与小程序统一）
const lightBlueThemeTokens = {
  colorPrimary: '#3b82f6',
  colorPrimaryBg: 'rgba(224, 242, 254, 0.3)',
  colorPrimaryBgHover: 'rgba(224, 242, 254, 0.5)',
  colorPrimaryBorder: 'rgba(147, 197, 253, 0.5)',
  colorPrimaryBorderHover: 'rgba(147, 197, 253, 0.8)',
  colorPrimaryHover: '#60a5fa',
  colorPrimaryActive: '#2563eb',
  colorPrimaryTextHover: '#60a5fa',
  colorPrimaryText: '#3b82f6',
  colorPrimaryTextActive: '#2563eb',
  colorBgContainer: '#ffffff',
  colorBgElevated: '#ffffff',
  colorBgLayout: '#eaf1ff', // @design-system: 纯色浅蓝背景（禁止渐变）
  colorBgSpotlight: 'rgba(224, 242, 254, 0.8)',
  colorBorder: 'rgba(147, 197, 253, 0.5)',
  colorBorderSecondary: 'rgba(224, 242, 254, 0.6)',
  colorText: '#111827',
  colorTextSecondary: '#6b7280',
  colorTextTertiary: '#9ca3af',
  colorTextQuaternary: 'rgba(17, 24, 39, 0.45)',
  colorFill: 'rgba(224, 242, 254, 0.3)',
  colorFillSecondary: 'rgba(224, 242, 254, 0.2)',
  colorFillTertiary: 'rgba(224, 242, 254, 0.1)',
  colorBgTextHover: 'rgba(224, 242, 254, 0.5)',
  colorBgTextActive: 'rgba(224, 242, 254, 0.7)',
  controlItemBgHover: 'rgba(59, 130, 246, 0.08)',
  controlItemBgActive: 'rgba(59, 130, 246, 0.15)',
  colorSuccess: '#10b981',
  colorWarning: '#f59e0b',
  colorError: '#ef4444',
  colorInfo: '#3b82f6',
};

// 主应用包装组件
const AppWrapper: React.FC = () => {
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    try {
      return localStorage.getItem(themeStorageKey) || 'default';
    } catch {
    // Intentionally empty
      // 忽略错误
      return 'default';
    }
  });

  useEffect(() => {
    // 监听主题变化
    const handleStorageChange = () => {
      const newTheme = localStorage.getItem(themeStorageKey) || 'default';
      setCurrentTheme(newTheme);
    };

    // 监听用户登录事件，恢复该用户的主题设置
    const handleUserLogin = (event: Event) => {
      try {
        const customEvent = event as CustomEvent;
        const userId = customEvent.detail?.userId;
        if (userId) {
          const userThemeKey = `app.theme.user.${userId}`;
          const userTheme = localStorage.getItem(userThemeKey) || 'default';
          localStorage.setItem(themeStorageKey, userTheme);
          setCurrentTheme(userTheme);
          applyTheme(userTheme);
        }
      } catch {
    // Intentionally empty
      // 忽略错误
      }
    };

    // 监听用户登出事件，恢复默认主题
    const handleUserLogout = () => {
      try {
        localStorage.setItem(themeStorageKey, 'default');
        setCurrentTheme('default');
        applyTheme('default');
      } catch {
    // Intentionally empty
      // 忽略错误
      }
    };

    // 监听自定义事件
    window.addEventListener('theme-change', handleStorageChange);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('user-login', handleUserLogin);
    window.addEventListener('user-logout', handleUserLogout);

    return () => {
      window.removeEventListener('theme-change', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('user-login', handleUserLogin);
      window.removeEventListener('user-logout', handleUserLogout);
    };
  }, []);

  // 根据主题选择配置
  const getThemeConfig = () => {
    const isDark = currentTheme === 'dark';
    const isBlue = currentTheme === 'blue';
    const isLightBlue = currentTheme === 'lightblue';

    return {
      algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: isDark ? darkThemeTokens : isBlue ? blueThemeTokens : isLightBlue ? lightBlueThemeTokens : undefined,
      components: isDark ? {
        Table: {
          headerBg: '#0f1115',
          headerColor: '#f0f2f5',
          colorText: '#f0f2f5',
          colorTextHeading: '#f0f2f5',
          colorTextDescription: '#d1d5db',
          rowHoverBg: 'rgba(107, 163, 255, 0.08)',
          borderColor: 'rgba(255, 255, 255, 0.06)',
          headerSplitColor: 'rgba(255, 255, 255, 0.04)',
          bodySortBg: 'rgba(107, 163, 255, 0.05)',
          colorBgContainer: '#1a1d24',
          filterDropdownBg: '#1a1d24',
        },
        Card: {
          headerBg: '#1a1d24',
          colorBgContainer: '#1a1d24',
          colorText: '#f0f2f5',
          colorTextHeading: '#f0f2f5',
          colorTextSecondary: '#b8bdc6',
        },
        Modal: {
          headerBg: '#0f1115',
          contentBg: '#1a1d24',
          footerBg: '#1a1d24',
          colorText: '#f0f2f5',
          colorTextHeading: '#f0f2f5',
          titleColor: '#f0f2f5',
        },
        Select: {
          optionSelectedBg: 'rgba(107, 163, 255, 0.18)',
          colorText: '#f0f2f5',
          colorTextPlaceholder: '#8b92a0',
          colorBgContainer: '#1a1d24',
          colorBgElevated: '#1a1d24',
          controlOutline: 'rgba(107, 163, 255, 0.2)',
        },
        Input: {
          activeBorderColor: '#6ba3ff',
          hoverBorderColor: '#6ba3ff',
          colorText: '#f0f2f5',
          colorTextPlaceholder: '#8b92a0',
          colorBgContainer: '#1a1d24',
          addonBg: '#0f1115',
          colorBorder: 'rgba(255, 255, 255, 0.15)',
        },
        Button: {
          colorText: '#f0f2f5',
          colorTextLightSolid: '#0f1115',
          primaryShadow: '0 2px 0 rgba(107, 163, 255, 0.1)',
        },
        Form: {
          labelColor: '#f0f2f5',
        },
        Descriptions: {
          labelBg: '#1a1d24',
          colorText: '#f0f2f5',
        },
        DatePicker: {
          colorText: '#f0f2f5',
          colorTextPlaceholder: '#8b92a0',
        },
        Popover: {
          colorBgElevated: '#1a1d24',
          colorText: '#f0f2f5',
        },
        Dropdown: {
          colorBgElevated: '#1a1d24',
          colorText: '#f0f2f5',
        },
      } : isLightBlue ? {
        Table: {
          headerBg: 'rgba(224, 242, 254, 0.5)',
          headerColor: '#111827',
          rowHoverBg: 'rgba(224, 242, 254, 0.3)',
          borderColor: 'rgba(147, 197, 253, 0.3)',
          headerSplitColor: 'rgba(147, 197, 253, 0.2)',
        },
        Card: {
          headerBg: 'rgba(224, 242, 254, 0.3)',
        },
        Modal: {
          headerBg: 'rgba(224, 242, 254, 0.2)',
          contentBg: '#ffffff',
          footerBg: 'rgba(224, 242, 254, 0.1)',
        },
        Select: {
          optionSelectedBg: 'rgba(224, 242, 254, 0.5)',
        },
        Input: {
          activeBorderColor: '#3b82f6',
          hoverBorderColor: '#60a5fa',
        },
        Button: {
          primaryShadow: '0 2px 0 rgba(59, 130, 246, 0.1)',
        },
      } : undefined,
    };
  };

  const themeConfig = getThemeConfig();

  return (
    <ConfigProvider
      locale={zhCN}
      theme={themeConfig}
    >
      <AntApp>
        <AppProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </AppProvider>
      </AntApp>
    </ConfigProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>,
);
