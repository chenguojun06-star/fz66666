import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';
import { clearToken, isTokenExpired } from '@/utils/storage';
import wxAdapter from '@/adapters/wx';

const isWechat = wxAdapter.isWechat;

const DEFAULT_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

if (!DEFAULT_BASE_URL && import.meta.env.PROD) {
  console.error('[http] VITE_API_BASE_URL 未配置，生产环境无法正常访问API');
}

const MAX_RETRY_COUNT = 2;
const RETRY_DELAY_BASE = 1000;

function isNetworkError(error) {
  return !error.response && Boolean(error.code);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const http = axios.create({
  baseURL: DEFAULT_BASE_URL,
  timeout: 15000,
});

let isHandling401 = false;

const REDIRECT_PATH_KEY = 'h5_auth_redirect';

export function handleUnauthorized() {
  if (isHandling401) return;
  isHandling401 = true;
  useAuthStore.getState().clearAuth();
  clearToken();
  const currentPath = window.location.pathname + window.location.search;
  if (!currentPath.includes('/login')) {
    sessionStorage.setItem(REDIRECT_PATH_KEY, currentPath);
  }
  if (isWechat) {
    sessionStorage.setItem('wx_oauth_redirect', currentPath);
  }
  window.location.href = '/login';
  setTimeout(() => { isHandling401 = false; }, 3000);
}

export function getAuthRedirectPath() {
  try {
    const saved = sessionStorage.getItem(REDIRECT_PATH_KEY);
    sessionStorage.removeItem(REDIRECT_PATH_KEY);
    if (saved && !saved.includes('/login')) return saved;
  } catch (_) {}
  return '/home';
}

function isTokenExpiredMessage(msg) {
  if (!msg) return false;
  return msg.includes('过期') || msg.includes('expired') || msg.includes('invalid token');
}

function isOnLoginPage() {
  return window.location.pathname.includes('/login');
}

http.interceptors.request.use((config) => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return Promise.reject(new Error('网络已断开，请检查网络连接'));
  }
  if (!config.headers.skipAuth) {
    const token = useAuthStore.getState().token;
    if (token && isTokenExpired()) {
      clearToken();
      if (!isOnLoginPage()) {
        handleUnauthorized();
      }
      return Promise.reject(new Error('登录已过期，请重新登录'));
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } else {
    delete config.headers.skipAuth;
  }
  if (isWechat) {
    config.headers['X-Client-Type'] = 'wechat-h5';
  }
  config.__retryCount = config.__retryCount || 0;
  return config;
});

const FRIENDLY_ERROR_MAP = {
  'JWT signature does not match': '登录凭证无效，请重新登录',
  'JWT token expired': '登录已过期，请重新登录',
  'Expired JWT token': '登录已过期，请重新登录',
  'Invalid JWT token': '登录凭证无效，请重新登录',
  'JWT strings must contain exactly 2 period characters': '登录凭证格式错误',
  'Internal Server Error': '服务器繁忙，请稍后重试',
  'Bad Request': '请求参数有误，请检查后重试',
  'Request timeout': '请求超时，请检查网络后重试',
  'Network Error': '网络连接异常，请检查网络设置',
  'Duplicate entry': '数据已存在，请勿重复操作',
};

function friendlyMessage(raw) {
  if (!raw) return '操作失败，请稍后重试';
  for (const [key, value] of Object.entries(FRIENDLY_ERROR_MAP)) {
    if (raw.includes(key)) return value;
  }
  if (/^[A-Z]/.test(raw) && !/[\u4e00-\u9fa5]/.test(raw)) {
    return '操作失败，请稍后重试';
  }
  return raw;
}

http.interceptors.response.use(
  (response) => {
    const data = response.data;
    if (data && data.code === 200) {
      return data;
    }
    if (data && data.code && data.code !== 200) {
      const msg = data.message || data.msg || '操作失败';
      return Promise.reject(new Error(friendlyMessage(msg)));
    }
    return data;
  },
  async (error) => {
    const config = error?.config;
    const status = error?.response?.status;
    const requestUrl = config?.url || '';
    const rawMessage =
      error?.response?.data?.message ||
      error?.response?.data?.msg ||
      error?.message ||
      '请求失败';
    const message = friendlyMessage(rawMessage);

    const isLoginRequest = requestUrl.includes('/api/system/user/login');

    if (status === 401) {
      if (!isOnLoginPage()) {
        handleUnauthorized();
      }
    }

    if (status === 403) {
      if (isLoginRequest) {
        return Promise.reject(new Error('登录被拒绝，请确认公司选择正确、账号属于该租户且账号已通过审核'));
      }
      if (isOnLoginPage()) {
        return Promise.reject(new Error(message));
      }
      const token = useAuthStore.getState().token;
      if (!token || isTokenExpiredMessage(rawMessage) || isTokenExpired()) {
        handleUnauthorized();
        return Promise.reject(new Error('登录已过期，请重新登录'));
      }
      return Promise.reject(new Error('无权限执行此操作'));
    }

    if (status === 404) {
      return Promise.reject(new Error('请求的资源不存在'));
    }

    if (status >= 500) {
      return Promise.reject(new Error('服务器繁忙，请稍后重试'));
    }

    if (status === 0 && isWechat) {
      return Promise.reject(new Error('网络连接失败，请检查网络设置'));
    }

    if (isNetworkError(error) && config && config.__retryCount < MAX_RETRY_COUNT) {
      const method = (config.method || 'get').toLowerCase();
      if (method === 'get' || method === 'head' || method === 'options') {
        config.__retryCount += 1;
        const retryDelay = RETRY_DELAY_BASE * Math.pow(2, config.__retryCount - 1);
        await delay(retryDelay);
        return http(config);
      }
    }

    return Promise.reject(new Error(message));
  }
);
