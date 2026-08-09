// 主应用 Provider 嵌套与主题配置
// 从 main.tsx 拆分：主题 tokens / AntdStaticLoader / AppWrapper
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

// React Query 全局客户端
// staleTime 30s：列表返回上一页时使用缓存数据，避免白屏闪现
// gcTime 5min：离开页面后缓存保留 5 分钟，再返回仍可秒开
// retry 1：接口失败自动重试 1 次
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// 深色主题 token 配置（雾黑色调）
const darkThemeTokens = {
  borderRadius: 6,
  colorPrimary: 'var(--color-primary-light)',
  colorPrimaryBg: 'rgba(107, 163, 255, 0.15)',
  colorPrimaryBgHover: 'rgba(107, 163, 255, 0.25)',
  colorPrimaryBorder: 'rgba(107, 163, 255, 0.3)',
  colorPrimaryBorderHover: 'rgba(107, 163, 255, 0.5)',
  colorPrimaryHover: 'var(--color-blue-200)',
  colorPrimaryActive: 'var(--color-blue-300)',
  colorBgContainer: 'var(--color-bg-dark)',
  colorBgElevated: 'var(--color-bg-dark)',
  colorBgLayout: 'var(--color-dark-bg)',
  colorBgSpotlight: 'var(--color-slate-900)',
  colorBorder: 'rgba(255, 255, 255, 0.1)',
  colorBorderSecondary: 'rgba(255, 255, 255, 0.06)',
  colorText: 'var(--color-bg-page)',
  colorTextSecondary: 'var(--color-slate-400)',
  colorTextTertiary: 'var(--color-slate-400)',
  colorTextQuaternary: 'rgba(240, 242, 245, 0.4)',
  colorFill: 'rgba(255, 255, 255, 0.06)',
  colorFillSecondary: 'rgba(255, 255, 255, 0.04)',
  colorFillTertiary: 'rgba(255, 255, 255, 0.02)',
  colorBgTextHover: 'rgba(255, 255, 255, 0.06)',
  colorBgTextActive: 'rgba(255, 255, 255, 0.1)',
  colorSuccess: 'var(--color-emerald-400)',
  colorWarning: 'var(--color-amber-400)',
  colorError: 'var(--color-rose-400)',
  colorInfo: 'var(--color-primary-light)',
  controlItemBgHover: 'rgba(107, 163, 255, 0.1)',
  controlItemBgActive: 'rgba(107, 163, 255, 0.18)',
};

// 蓝色主题 token 配置
const blueThemeTokens = {
  borderRadius: 6,
  colorPrimary: 'var(--color-primary)',
  colorBgContainer: 'var(--color-bg-base)',
  colorBgElevated: 'var(--color-bg-base)',
  colorBgLayout: 'var(--color-blue-50)',
  colorBorder: 'rgba(45, 127, 249, 0.18)',
  colorBorderSecondary: 'rgba(45, 127, 249, 0.12)',
  colorText: 'var(--color-ocean)',
  colorTextSecondary: 'rgba(11, 45, 92, 0.72)',
  colorTextTertiary: 'rgba(11, 45, 92, 0.52)',
};

// 浅蓝色主题 token 配置（与小程序统一）
const lightBlueThemeTokens = {
  borderRadius: 6,
  colorPrimary: 'var(--color-secondary)',
  colorPrimaryBg: 'rgba(224, 242, 254, 0.3)',
  colorPrimaryBgHover: 'rgba(224, 242, 254, 0.5)',
  colorPrimaryBorder: 'rgba(147, 197, 253, 0.5)',
  colorPrimaryBorderHover: 'rgba(147, 197, 253, 0.8)',
  colorPrimaryHover: 'var(--color-blue-400)',
  colorPrimaryActive: 'var(--color-primary-dark)',
  colorPrimaryTextHover: 'var(--color-blue-400)',
  colorPrimaryText: 'var(--color-secondary)',
  colorPrimaryTextActive: 'var(--color-primary-dark)',
  colorBgContainer: 'var(--color-bg-base)',
  colorBgElevated: 'var(--color-bg-base)',
  colorBgLayout: 'var(--color-blue-50)', // @design-system: 纯色浅蓝背景（禁止渐变）
  colorBgSpotlight: 'rgba(224, 242, 254, 0.8)',
  colorBorder: 'rgba(147, 197, 253, 0.5)',
  colorBorderSecondary: 'rgba(224, 242, 254, 0.6)',
  colorText: 'var(--color-slate-900)',
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
  colorWarning: 'var(--color-warning)',
  colorError: 'var(--color-danger)',
  colorInfo: 'var(--color-secondary)',
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
          headerBg: 'var(--color-dark-bg)',
          headerColor: 'var(--color-bg-page)',
          colorText: 'var(--color-bg-page)',
          colorTextHeading: 'var(--color-bg-page)',
          colorTextDescription: 'var(--color-border)',
          rowHoverBg: 'rgba(107, 163, 255, 0.08)',
          borderColor: 'rgba(255, 255, 255, 0.06)',
          headerSplitColor: 'rgba(255, 255, 255, 0.04)',
          bodySortBg: 'rgba(107, 163, 255, 0.05)',
          fontSize: 12,
          headerFontSize: 12,
          colorBgContainer: 'var(--color-bg-dark)',
          filterDropdownBg: 'var(--color-bg-dark)',
        },
        Card: {
          headerBg: 'var(--color-bg-dark)',
          colorBgContainer: 'var(--color-bg-dark)',
          colorText: 'var(--color-bg-page)',
          colorTextHeading: 'var(--color-bg-page)',
          colorTextSecondary: 'var(--color-slate-400)',
        },
        Modal: {
          headerBg: 'var(--color-dark-bg)',
          contentBg: 'var(--color-bg-dark)',
          footerBg: 'var(--color-bg-dark)',
          colorText: 'var(--color-bg-page)',
          colorTextHeading: 'var(--color-bg-page)',
          titleColor: 'var(--color-bg-page)',
        },
        Select: {
          optionSelectedBg: 'rgba(107, 163, 255, 0.18)',
          colorText: 'var(--color-bg-page)',
          colorTextPlaceholder: 'var(--color-slate-400)',
          colorBgContainer: 'var(--color-bg-dark)',
          colorBgElevated: 'var(--color-bg-dark)',
          controlOutline: 'rgba(107, 163, 255, 0.2)',
        },
        Input: {
          activeBorderColor: 'var(--color-primary-light)',
          hoverBorderColor: 'var(--color-primary-light)',
          colorText: 'var(--color-bg-page)',
          colorTextPlaceholder: 'var(--color-slate-400)',
          colorBgContainer: 'var(--color-bg-dark)',
          addonBg: 'var(--color-dark-bg)',
          colorBorder: 'rgba(255, 255, 255, 0.15)',
        },
        Button: {
          colorText: 'var(--color-bg-page)',
          colorTextLightSolid: 'var(--color-dark-bg)',
          primaryShadow: '0 2px 0 rgba(107, 163, 255, 0.1)',
        },
        Form: {
          labelColor: 'var(--color-bg-page)',
        },
        Descriptions: {
          labelBg: 'var(--color-bg-dark)',
          colorText: 'var(--color-bg-page)',
        },
        DatePicker: {
          colorText: 'var(--color-bg-page)',
          colorTextPlaceholder: 'var(--color-slate-400)',
        },
        Popover: {
          colorBgElevated: 'var(--color-bg-dark)',
          colorText: 'var(--color-bg-page)',
        },
        Dropdown: {
          colorBgElevated: 'var(--color-bg-dark)',
          colorText: 'var(--color-bg-page)',
        },
      } : isLightBlue ? {
        Table: {
          headerBg: 'rgba(224, 242, 254, 0.5)',
          headerColor: 'var(--color-slate-900)',
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
          activeBorderColor: 'var(--color-secondary)',
          hoverBorderColor: 'var(--color-blue-400)',
        },
        Button: {
          primaryShadow: '0 2px 0 rgba(59, 130, 246, 0.1)',
        },
      } : {
        /* 白色主题：浅灰底+白卡片层次 */
        Table: {
          headerBg: 'var(--color-slate-100)',
          rowHoverBg: 'var(--color-blue-50)',
          borderColor: 'var(--color-slate-200)',
          headerSplitColor: 'var(--color-slate-200)',
          fontSize: 12,
          headerFontSize: 12,
        },
        Card: {
          colorBgContainer: 'var(--color-bg-base)',
        },
        Modal: {
          headerBg: 'var(--color-bg-subtle)',
          contentBg: 'var(--color-bg-base)',
          footerBg: 'var(--color-bg-subtle)',
        },
        Select: {
          optionSelectedBg: 'rgba(45, 127, 249, 0.08)',
        },
        Input: {
          activeBorderColor: 'var(--color-primary)',
          hoverBorderColor: 'var(--color-primary-light)',
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
        <QueryClientProvider client={queryClient}>
          <AppProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </AppProvider>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
};

export default AppWrapper;
