// 应用入口：createRoot + 全局初始化 + 顶层 Provider 嵌套
// Provider 嵌套与主题配置见 ./AppProviders
// 全局初始化辅助函数见 ./main.helpers
import React from 'react';
import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

import 'antd/dist/reset.css'; // 引入组件库样式
import './styles/global.css';
import './styles/design-system.css';
import './styles/dark-theme-global.css';
import './styles/button-override.css';
import './styles/animations.css';
import './components/common/GlobalAiAssistant/xiaoyun-tokens.css';
import './styles/lightSense.css';

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>,
);
