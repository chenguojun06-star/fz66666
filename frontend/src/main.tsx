import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { AuthProvider } from './utils/authContext';
import 'antd/dist/reset.css'; // 引入组件库样式
import './styles/global.css';

const themeStorageKey = 'app.theme';

const installNoiseFilters = () => {
  const shouldIgnore = (msg: any) => {
    const m = String(msg || '').trim();
    if (!m) return false;

    const lower = m.toLowerCase();
    return (
      lower.includes('no checkout popup config found')
      || lower.includes('unchecked runtime.lasterror')
      || lower.includes('a listener indicated an asynchronous response by returning true')
      || lower.includes('message channel closed before a response was received')
      || lower.includes('the message port closed before a response was received')
      || (lower.includes('[antd: card]') && lower.includes('bordered') && lower.includes('deprecated'))
      || (lower.includes('[antd: drawer]') && lower.includes('width') && lower.includes('deprecated'))
    );
  };

  const extractLikelyMessage = (value: any) => {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      const msg = (value as any)?.message;
      if (typeof msg === 'string') return msg;
    }
    try {
      return String(value);
    } catch {
      return '';
    }
  };

  window.addEventListener('error', (event) => {
    const ev: any = event as any;
    const msg = extractLikelyMessage(ev?.message) || extractLikelyMessage(ev?.error);
    if (shouldIgnore(msg)) {
      event.preventDefault();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason: any = (event as any)?.reason;
    const msg = extractLikelyMessage(reason);
    if (shouldIgnore(msg)) {
      event.preventDefault();
    }
  });

  const consoleRef: any = console as any;
  const origError = consoleRef.error?.bind(consoleRef);
  const origWarn = consoleRef.warn?.bind(consoleRef);

  if (typeof origError === 'function') {
    consoleRef.error = (...args: any[]) => {
      const head = args?.[0];
      const msg = extractLikelyMessage(head);
      if (shouldIgnore(msg)) return;
      if (head && typeof head === 'object' && shouldIgnore((head as any)?.message)) return;
      origError(...args);
    };
  }

  if (typeof origWarn === 'function') {
    consoleRef.warn = (...args: any[]) => {
      const head = args?.[0];
      const msg = extractLikelyMessage(head);
      if (shouldIgnore(msg)) return;
      if (head && typeof head === 'object' && shouldIgnore((head as any)?.message)) return;
      origWarn(...args);
    };
  }
};

const ensureCheckoutPopupConfig = () => {
  const w = window as any;
  if (w.checkoutPopupConfig == null) {
    w.checkoutPopupConfig = {
      title: '订单结账',
      width: 600,
      height: 450,
    };
  }
};

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

try {
  applyTheme(localStorage.getItem(themeStorageKey));
} catch {
}

try {
  ensureCheckoutPopupConfig();
} catch {
}

try {
  installNoiseFilters();
} catch {
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ConfigProvider>
  </React.StrictMode>,
);
