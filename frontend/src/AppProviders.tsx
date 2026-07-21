// 主应用 Provider 嵌套与主题配置
// 从 main.tsx 拆分：主题 tokens / AntdStaticLoader / AppWrapper
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import viVN from 'antd/locale/vi_VN';
import App from './App';
import { setAntdStaticRefs } from './utils/antdStatic';
import { AuthProvider } from './utils/AuthContext';
import { AppProvider } from './utils/AppContext';
import { type AppLanguage } from './i18n/languagePreference';
import { useAppLanguage } from './i18n/useAppLanguage';
import XiaoyunSpinIndicator from './components/common/XiaoyunSpinIndicator';
import { applyTheme, fallbackTheme, themeStorageKey } from './main.helpers';

// 深色主题 token 配置（雾黑色调）
const darkThemeTokens = {
  borderRadius: 6,
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
  borderRadius: 6,
  colorPrimary: 'var(--color-primary)',
  colorBgContainer: 'var(--color-bg-base)',
  colorBgElevated: 'var(--color-bg-base)',
  colorBgLayout: '#eaf1ff',
  colorBorder: 'rgba(45, 127, 249, 0.18)',
  colorBorderSecondary: 'rgba(45, 127, 249, 0.12)',
  colorText: '#0b2d5c',
  colorTextSecondary: 'rgba(11, 45, 92, 0.72)',
  colorTextTertiary: 'rgba(11, 45, 92, 0.52)',
};

// 浅蓝色主题 token 配置（与小程序统一）
const lightBlueThemeTokens = {
  borderRadius: 6,
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
  colorBgContainer: 'var(--color-bg-base)',
  colorBgElevated: 'var(--color-bg-base)',
  colorBgLayout: '#eaf1ff', // @design-system: 纯色浅蓝背景（禁止渐变）
  colorBgSpotlight: 'rgba(224, 242, 254, 0.8)',
  colorBorder: 'rgba(147, 197, 253, 0.5)',
  colorBorderSecondary: 'rgba(224, 242, 254, 0.6)',
  colorText: '#111827',
  colorTextSecondary: 'var(--color-text-secondary)',
  colorTextTertiary: 'var(--color-text-tertiary)',
  colorTextQuaternary: 'rgba(17, 24, 39, 0.45)',
  colorFill: 'rgba(224, 242, 254, 0.3)',
  colorFillSecondary: 'rgba(224, 242, 254, 0.2)',
  colorFillTertiary: 'rgba(224, 242, 254, 0.1)',
  colorBgTextHover: 'rgba(224, 242, 254, 0.5)',
  colorBgTextActive: 'rgba(224, 242, 254, 0.7)',
  controlItemBgHover: 'rgba(59, 130, 246, 0.08)',
  controlItemBgActive: 'rgba(59, 130, 246, 0.15)',
  colorSuccess: 'var(--color-accent-emerald)',
  colorWarning: '#f59e0b',
  colorError: '#ef4444',
  colorInfo: '#3b82f6',
};

// ── AntdStaticLoader：在 AntApp context 内捕获 context-aware 实例 ──────────
// 解决 "Static function can not consume context like dynamic theme" 警告
// 原理：useApp() 在 <AntApp> 内部调用，拿到主题感知实例后存入 antdStatic 模块级变量
const AntdStaticLoader: React.FC = () => {
  const { message, modal, notification } = AntApp.useApp();
  const initialized = useRef(false);
  if (!initialized.current) {
    setAntdStaticRefs(message, modal, notification);
    initialized.current = true;
  }
  return null;
};

// 主应用包装组件
const AppWrapper: React.FC = () => {
  const { language } = useAppLanguage();
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    try {
      return localStorage.getItem(themeStorageKey) || fallbackTheme;
    } catch {
    // Intentionally empty
      // 忽略错误
      return fallbackTheme;
    }
  });

  useEffect(() => {
    // 监听主题变化
    const handleStorageChange = () => {
      const newTheme = localStorage.getItem(themeStorageKey) || fallbackTheme;
      setCurrentTheme(newTheme);
    };

    // 监听用户登录事件，恢复该用户的主题设置
    const handleUserLogin = (event: Event) => {
      try {
        const customEvent = event as CustomEvent;
        const userId = customEvent.detail?.userId;
        if (userId) {
          const userThemeKey = `app.theme.user.${userId}`;
          const userTheme = localStorage.getItem(userThemeKey) || fallbackTheme;
          localStorage.setItem(themeStorageKey, userTheme);
          // 仅在主题值真正变化时才触发 React 状态更新，避免 ConfigProvider 无意义重渲染造成全屏闪烁
          setCurrentTheme(prev => (prev === userTheme ? prev : userTheme));
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
        localStorage.setItem(themeStorageKey, fallbackTheme);
        setCurrentTheme(fallbackTheme);
        applyTheme(fallbackTheme);
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

    const baseToken = { fontSize: 12, fontSizeSM: 12, fontSizeLG: 13 };

    return {
      algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: isDark ? { ...darkThemeTokens, ...baseToken } : isBlue ? { ...blueThemeTokens, ...baseToken } : isLightBlue ? { ...lightBlueThemeTokens, ...baseToken } : baseToken,
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
          fontSize: 12,
          headerFontSize: 12,
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
          fontSize: 12,
          headerFontSize: 12,
        },
        Card: {
          headerBg: 'rgba(224, 242, 254, 0.3)',
        },
        Modal: {
          headerBg: 'rgba(224, 242, 254, 0.2)',
          contentBg: 'var(--color-bg-base)',
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
      } : {
        /* 白色主题：浅灰底+白卡片层次 */
        Table: {
          headerBg: '#f0f3f8',
          rowHoverBg: '#edf2ff',
          borderColor: '#e8ecf2',
          headerSplitColor: '#e0e4eb',
          fontSize: 12,
          headerFontSize: 12,
        },
        Card: {
          colorBgContainer: 'var(--color-bg-base)',
        },
        Modal: {
          headerBg: '#f9fafb',
          contentBg: 'var(--color-bg-base)',
          footerBg: '#f9fafb',
        },
        Select: {
          optionSelectedBg: 'rgba(45, 127, 249, 0.08)',
        },
        Input: {
          activeBorderColor: 'var(--color-primary)',
          hoverBorderColor: '#6ba3ff',
        },
        Button: {
          primaryShadow: '0 2px 6px rgba(45, 127, 249, 0.25)',
        },
      },
    };
  };

  // useMemo 确保只有 currentTheme 真正变化时才重建主题对象，
  // 防止每次父组件渲染时 ConfigProvider 收到新引用而触发全量 CSS-in-JS 重算（全屏闪烁根因）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const themeConfig = useMemo(() => getThemeConfig(), [currentTheme]);

  const resolveAntdLocale = (lang: AppLanguage) => {
    if (lang === 'en-US') return enUS;
    if (lang === 'vi-VN') return viVN;
    if (lang === 'km-KH') return enUS;
    return zhCN;
  };

  const componentSize = 'middle' as const;

  return (
    <ConfigProvider
      locale={resolveAntdLocale(language)}
      theme={themeConfig}
      componentSize={componentSize}
      getPopupContainer={(triggerNode) => {
        // Modal 内的弹出层锚定到 .ant-modal-body（保证定位正确、outside-click 不误关闭）
        // Drawer 内的弹出层锚定到 .ant-drawer-content（避免被 Drawer mask 遮挡）
        // 其余情况统一用 document.body，避免 sticky 容器的 z-index 堆叠上下文导致下拉被遮挡
        if (triggerNode) {
          const modal = triggerNode.closest?.('.ant-modal-body') as HTMLElement | null;
          if (modal) return modal;
          const drawer = triggerNode.closest?.('.ant-drawer-content') as HTMLElement | null;
          if (drawer) return drawer;
        }
        return document.body;
      }}
      spin={{ indicator: <XiaoyunSpinIndicator /> }}
    >
      <AntApp>
        <AntdStaticLoader />
        <AppProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </AppProvider>
      </AntApp>
    </ConfigProvider>
  );
};

export default AppWrapper;
