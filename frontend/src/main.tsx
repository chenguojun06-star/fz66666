import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { AuthProvider } from './utils/authContext';
import { AppProvider } from './utils/appContext';
import 'antd/dist/reset.css'; // 引入组件库样式
import './styles/global.css';

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
      const reason: unknown = (e as Record<string, unknown>)?.reason;
      const msg = String(reason?.message || reason || '').trim();
      const stack = String(reason?.stack || '').trim();
      if (shouldSuppressExternalError(msg, undefined, stack)) {
        e.preventDefault();
      }
    });

    window.addEventListener('error', (e) => {
      const ev: unknown = e as Record<string, unknown>;
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

// 深色主题 token 配置
const darkThemeTokens = {
  colorPrimary: '#5a9cff',
  colorBgContainer: '#1e2128',
  colorBgElevated: '#1e2128',
  colorBgLayout: '#12141a',
  colorBgSpotlight: '#2a2e38',
  colorBorder: 'rgba(255, 255, 255, 0.12)',
  colorBorderSecondary: 'rgba(255, 255, 255, 0.08)',
  colorText: '#e8eaed',
  colorTextSecondary: '#a0a4ab',
  colorTextTertiary: '#6b7280',
  colorTextQuaternary: 'rgba(232, 234, 237, 0.45)',
  colorFill: 'rgba(255, 255, 255, 0.08)',
  colorFillSecondary: 'rgba(255, 255, 255, 0.06)',
  colorFillTertiary: 'rgba(255, 255, 255, 0.04)',
  colorBgTextHover: 'rgba(255, 255, 255, 0.08)',
  colorBgTextActive: 'rgba(255, 255, 255, 0.12)',
  colorSuccess: '#5fd068',
  colorWarning: '#ffb830',
  colorError: '#f54040',
  colorInfo: '#5a9cff',
  controlItemBgHover: 'rgba(90, 156, 255, 0.12)',
  controlItemBgActive: 'rgba(90, 156, 255, 0.2)',
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
    
    return {
      algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: isDark ? darkThemeTokens : isBlue ? blueThemeTokens : undefined,
      components: isDark ? {
        Table: {
          headerBg: '#12141a',
          headerColor: '#e8eaed',
          rowHoverBg: 'rgba(90, 156, 255, 0.1)',
          borderColor: 'rgba(255, 255, 255, 0.08)',
        },
        Card: {
          headerBg: '#1e2128',
        },
        Modal: {
          headerBg: '#12141a',
          contentBg: '#1e2128',
          footerBg: '#1e2128',
        },
        Select: {
          optionSelectedBg: 'rgba(90, 156, 255, 0.2)',
        },
        Input: {
          activeBorderColor: '#5a9cff',
          hoverBorderColor: '#5a9cff',
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
