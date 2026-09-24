// 应用入口：createRoot + 全局初始化 + 顶层 Provider 嵌套
// Provider 嵌套与主题配置见 ./AppProviders
// 全局初始化辅助函数见 ./main.helpers
import React from 'react';
import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';

import 'antd/dist/reset.css'; // 引入组件库样式
import './styles/global.css';
import './styles/design-system.css';
import './styles/dark-theme-global.css';
import './styles/button-override.css';
import './styles/animations.css';
import './components/common/GlobalAiAssistant/xiaoyun-tokens.css';
import './styles/lightSense.css';
// 全局原子工具类：必须最后引入。它用来替代静态内联样式 style={{}}，
// 单类选择器特异性相同的情况下「后加载者胜出」，放在最后才能保证优先级等价于原内联样式。
import './styles/utilities.css';

import { initFrontendErrorReporter } from './utils/frontendErrorReporter';
import {
  applyTheme,
  handleChunkLoadError,
  shouldSuppressExternalError,
  suppressCloudBaseNoise,
  themeStorageKey,
} from './main.helpers';
import AppWrapper from './AppProviders';

// 全局初始化顺序严格保持：noise 屏蔽 → chunk 错误恢复 → 错误上报 → dayjs locale
suppressCloudBaseNoise();
handleChunkLoadError();
initFrontendErrorReporter();
dayjs.locale('zh-cn'); // 全局设置 dayjs 中文 locale，让所有 DatePicker 月份/星期显示中文
dayjs.extend(quarterOfYear); // 启用 quarter 插件，支持 startOf('quarter')/endOf('quarter')

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

// D-533：data-theme 必须无条件写入 —— 原先整体包在 try 里，localStorage 抛错（隐私模式/配额）
// 时 data-theme 永不写入，`@media (prefers-color-scheme: dark) :root:not([data-theme])` 就会命中，
// 把 --color-text-primary 翻成近白 → 浅色主题下侧边栏浮层「浅底白字」（文字看不见）
let storedTheme: string | null = null;
try {
  storedTheme = localStorage.getItem(themeStorageKey);
} catch {
  storedTheme = null;
}
applyTheme(storedTheme);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>,
);
