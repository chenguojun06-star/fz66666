import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { configureWxJsSdk, setupWxShare } from './services/wxSdk';
import wxAdapter from './adapters/wx';
import './styles/global.css';

const isWechat = wxAdapter.isWechat;

if (isWechat) {
  configureWxJsSdk().then(() => {
    setupWxShare({
      title: '云裳智链 - 智能生产管理',
      desc: '云智链智能管理平台，扫码生产、进度追踪、AI助手',
    });
  }).catch((e) => console.error('WxJsSdk init error:', e));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      configureWxJsSdk();
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
