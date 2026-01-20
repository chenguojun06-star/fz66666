import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { AuthProvider } from './utils/authContext';
import { AppProvider } from './utils/appContext';
import 'antd/dist/reset.css'; // 引入组件库样式
import './styles/global.css';

const themeStorageKey = 'app.theme';

const applyTheme = (theme: string | null) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const t = String(theme || '').trim();
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
}

try {
  applyTheme(localStorage.getItem(themeStorageKey));
} catch {
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN}>
      <AppProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AppProvider>
    </ConfigProvider>
  </React.StrictMode>,
);
