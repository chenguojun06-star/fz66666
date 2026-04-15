import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';
import { clearToken } from '@/utils/storage';
import wxAdapter from '@/adapters/wx';

const isWechat = wxAdapter.isWechat;

const DEFAULT_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.webyszl.cn';

export const http = axios.create({
  baseURL: DEFAULT_BASE_URL,
  timeout: 30000,
});

let isHandling401 = false;

export function handleUnauthorized() {
  if (isHandling401) return;
  isHandling401 = true;
  useAuthStore.getState().clearAuth();
  clearToken();
  if (isWechat) {
    const currentPath = window.location.pathname + window.location.search;
    if (!currentPath.includes('/login')) {
      sessionStorage.setItem('wx_oauth_redirect', currentPath);
    }
  }
  window.location.href = '/login';
  setTimeout(() => { isHandling401 = false; }, 3000);
}

http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (isWechat) {
    config.headers['X-Client-Type'] = 'wechat-h5';
  }
  return config;
});

http.interceptors.response.use(
  (response) => {
    const data = response.data;
    if (data && data.code === 200) {
      return data;
    }
    if (data && data.code && data.code !== 200) {
      const msg = data.message || data.msg || '操作失败';
      return Promise.reject(new Error(msg));
    }
    return data;
  },
  (error) => {
    const status = error?.response?.status;
    const requestUrl = error?.config?.url || '';
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.msg ||
      error?.message ||
      '请求失败';

    const isLoginRequest = requestUrl.includes('/api/system/user/login');
    const normalizedMessage =
      isLoginRequest && status === 403
        ? '登录被拒绝，请确认公司选择正确、账号属于该租户且账号已通过审核'
        : message;

    if (status === 401) {
      handleUnauthorized();
    }

    if (status === 0 && isWechat) {
      return Promise.reject(new Error('网络连接失败，请检查网络设置'));
    }

    return Promise.reject(new Error(normalizedMessage));
  }
);
