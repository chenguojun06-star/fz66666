import axios, { type AxiosRequestConfig } from 'axios';
import {
  API_TIMEOUT_MS,
  SCAN_API_TIMEOUT_MS,
  AI_VISION_TIMEOUT_MS,
  FILE_UPLOAD_TIMEOUT_MS,
} from './core/constants';
import { generateRequestId } from './core/helpers';
import type { ApiClient } from './core/types';

// re-export 子模块，保持外部 import 路径不变
export * from './core/constants';
export * from './core/types';
export * from './core/helpers';

const isViteDevServerRequest = (): boolean => {
  try {
    const env = (import.meta as unknown as { env?: { DEV?: boolean } })?.env;
    if (env?.DEV) {
      return true;
    }
    if (typeof window === 'undefined') {
      return false;
    }
    return window.location.port === '5173';
  } catch {
    return false;
  }
};

const resolveApiBaseUrl = (): string => {
  try {
    const raw = (import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } })?.env?.VITE_API_BASE_URL;
    const v = raw == null ? '' : String(raw).trim();
    if (!v) {
      if (isViteDevServerRequest()) {
        return '/api';
      }
      return '/api';
    }

    const normalized = v.replace(/\/+$/g, '');
    if (normalized === '/api') return normalized;
    if (normalized.endsWith('/api')) return normalized;

    if (/^https?:\/\//i.test(normalized)) {
      return `${normalized}/api`;
    }
    if (normalized.startsWith('/')) {
      return `${normalized}/api`;
    }

    return '/api';
  } catch {
    return '/api';
  }
};

const isJwtExpired = (token: string): boolean => {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return true;
    let payload = parts[1];
    payload = payload.replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    const decoded = JSON.parse(atob(payload));
    if (!decoded.exp) return true;
    return Date.now() / 1000 > decoded.exp - 300;
  } catch {
    return true;
  }
};

// ── D-179 单飞刷新：全局同一时刻只发一次 refresh-token 请求，所有调用方共享同一结果 ──
// 温和失败语义：仅后端明确拒绝（HTTP 401 / 消息含失效过期语义）才算确凿失效应清 token 跳登录；
// 网络错误/超时/5xx 一律视为暂时性失败（reason:'network'），保留登录态绝不踢人
export type RefreshResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'rejected' | 'network' | 'no-token' };

let refreshInFlight: Promise<RefreshResult> | null = null;

const clearAuthStorage = (alsoRefresh: boolean) => {
  try {
    localStorage.removeItem('authToken');
    if (alsoRefresh) localStorage.removeItem('refreshToken');
    localStorage.removeItem('userId');
  } catch {
    // Ignore
  }
};

export const refreshAccessTokenSingleFlight = (): Promise<RefreshResult> => {
  if (refreshInFlight) return refreshInFlight;
  const attempt = (async (): Promise<RefreshResult> => {
    let savedRefresh = '';
    try {
      savedRefresh = String(localStorage.getItem('refreshToken') || '').trim();
    } catch {
      savedRefresh = '';
    }
    if (!savedRefresh) {
      clearAuthStorage(false);
      return { ok: false, reason: 'no-token' };
    }
    try {
      const refreshClient = axios.create({ baseURL: resolveApiBaseUrl(), timeout: 10000 });
      const refreshRes = await refreshClient.post('/system/user/refresh-token', { refreshToken: savedRefresh });
      const newToken = String(refreshRes.data?.data?.token || '').trim();
      if (refreshRes.data?.code === 200 && newToken) {
        const newRefresh = String(refreshRes.data?.data?.refreshToken || '').trim();
        try {
          localStorage.setItem('authToken', newToken);
          if (newRefresh) localStorage.setItem('refreshToken', newRefresh);
        } catch {
          // Ignore
        }
        import('@/utils/fileUrl').then(({ invalidateFileUrlTokenCache }) => invalidateFileUrlTokenCache()).catch(() => {});
        return { ok: true, token: newToken };
      }
      const msg = String(refreshRes.data?.message || refreshRes.data?.msg || '');
      const rejected = refreshRes.status === 401 ||
        msg.includes('失效') || msg.includes('过期') || msg.includes('invalid');
      return { ok: false, reason: rejected ? 'rejected' : 'network' };
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      return { ok: false, reason: status === 401 ? 'rejected' : 'network' };
    }
  })();
  refreshInFlight = attempt;
  attempt.then(() => {
    if (refreshInFlight === attempt) refreshInFlight = null;
  }, () => {
    if (refreshInFlight === attempt) refreshInFlight = null;
  });
  return attempt;
};

// 网络类失败后的温和重试：最多补 2 次（0.8s/1.6s 退避）
export const refreshAccessTokenWithRetry = async (): Promise<RefreshResult> => {
  let result = await refreshAccessTokenSingleFlight();
  for (let i = 0; i < 2 && !result.ok && result.reason === 'network'; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 800 * (i + 1)));
    result = await refreshAccessTokenSingleFlight();
  }
  return result;
};

const pendingRequests = new Map<string, Promise<unknown>>();
const responseCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30_000;
const CACHEABLE_PATTERNS = [
  '/system/dict/',
  '/system/organization/',
  '/system/permission/',
  '/system/role/',
  '/factory/',
  '/factory-worker/',
  '/process/',
  '/template-library/',
  '/stock/sample/list',
];

const isCacheable = (url: string, method?: string): boolean => {
  if (method && method.toLowerCase() !== 'get') return false;
  return CACHEABLE_PATTERNS.some(p => url.includes(p));
};

const getCacheKey = (url: string, params?: unknown): string => {
  const paramStr = params ? JSON.stringify(params) : '';
  return `${url}||${paramStr}`;
};

export const clearApiCache = (pattern?: string) => {
  if (!pattern) {
    responseCache.clear();
    return;
  }
  for (const key of responseCache.keys()) {
    if (key.includes(pattern)) responseCache.delete(key);
  }
};

export const createApiClient = (): ApiClient => {
  const client = axios.create({
    baseURL: resolveApiBaseUrl(),
    timeout: API_TIMEOUT_MS,
    headers: {
      'Content-Type': 'application/json'
    }
  }) as ApiClient;

  // 请求拦截器
  client.interceptors.request.use(
    async config => {
      const url = config.url || '';
      const method = config.method || 'get';
      const cacheKey = getCacheKey(url, config.params);

      // 按路径覆盖超时（更细粒度的控制）
      if (typeof config.timeout !== 'number' || config.timeout <= 0) {
        if (/\/scan\//i.test(url) || /scan.*execute/i.test(url)) {
          config.timeout = SCAN_API_TIMEOUT_MS; // 扫码请求：10秒
        } else if (/ocr|vision|recognize|extract/.test(url)) {
          config.timeout = AI_VISION_TIMEOUT_MS; // AI/图片识别：60秒
        } else if (/upload|import|excel/.test(url) && method === 'post') {
          config.timeout = FILE_UPLOAD_TIMEOUT_MS; // 文件上传：60秒
        }
      }
      // 请求 ID（用于追踪超时）
      if (!config.headers || !(config.headers as any)['x-request-id']) {
        const requestId = generateRequestId();
        if (typeof config.headers?.set === 'function') {
          (config.headers as any).set('x-request-id', requestId);
        } else if (typeof (config.headers as any) === 'object') {
          (config.headers as any)['x-request-id'] = requestId;
        }
      }

      if (isCacheable(url, method)) {
        const cached = responseCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
          const _adapter = config.adapter;
          config.adapter = () => Promise.resolve({
            data: cached.data,
            status: 200,
            statusText: 'OK (cached)',
            headers: { 'x-cache': 'HIT' },
            config,
          } as any);
          return config;
        }

        const pending = pendingRequests.get(cacheKey);
        if (pending) {
          const _adapter2 = config.adapter;
          config.adapter = () => pending.then(data => ({
            data,
            status: 200,
            statusText: 'OK (deduped)',
            headers: { 'x-cache': 'DEDUP' },
            config,
          } as any));
          return config;
        }
      }
      const headers = (config.headers || {}) as any & {
        set?: (key: string, value: string) => void;
        get?: (key: string) => unknown;
        delete?: (key: string) => void;
      };

      // 如果是 FormData，删除默认的 Content-Type，让浏览器自动设置 multipart/form-data
      if (config.data instanceof FormData) {
        if (typeof headers.delete === 'function') {
          headers.delete('Content-Type');
        } else {
          delete headers['Content-Type'];
        }
      }

      const toLatin1HeaderValue = (input: unknown) => {
        let val = input == null ? '' : String(input);
        if (!val) return '';
        val = val.replace(/[\r\n]/g, '').trim();
        if (!val) return '';
        for (let i = 0; i < val.length; i += 1) {
          if (val.charCodeAt(i) > 255) {
            return encodeURIComponent(val);
          }
        }
        return val;
      };

      const setHeader = (k: string, v: unknown) => {
        const val = toLatin1HeaderValue(v);
        if (!val) return;
        if (headers && typeof headers.set === 'function') {
          headers.set(k, val);
          return;
        }
        headers[k] = val;
      };

      try {
        const token = String(localStorage.getItem('authToken') || '').trim();
        if (token) {
          if (isJwtExpired(token)) {
            // D-179：预刷新走单飞+温和失败——网络暂时不可用时保留 token 照常发送，
            // 由响应端 401 温和处理；仅后端明确拒绝才清理登录态
            const result = await refreshAccessTokenSingleFlight();
            if (result.ok) {
              setHeader('Authorization', `Bearer ${result.token}`);
            } else if (result.reason === 'rejected') {
              clearAuthStorage(true);
            } else if (!isJwtExpired(token)) {
              setHeader('Authorization', `Bearer ${token}`);
            }
          } else {
            setHeader('Authorization', `Bearer ${token}`);
          }
        }
      } catch {
        // Ignore localStorage errors
      }

      setHeader('X-Request-Id', generateRequestId());

      const uid = String(
        (() => {
          try {
            return localStorage.getItem('userId');
          } catch {
            return '';
          }
        })() || ''
      ).trim();
      if (uid) {
        setHeader('X-User-Id', uid);
      }

      if (isCacheable(url, method) && !config.adapter) {
        const realAdapter = config.adapter || axios.defaults.adapter;
        const promise = new Promise((resolve) => {
          const origAdapter = typeof realAdapter === 'function' ? realAdapter : axios.defaults.adapter;
          const result = (origAdapter as Function)(config);
          result.then((res: any) => resolve(res?.data ?? res)).catch(() => {
            pendingRequests.delete(cacheKey);
          });
        });
        pendingRequests.set(cacheKey, promise);
      }

      return config;
    },
    error => Promise.reject(error)
  );

  // 响应拦截器
  client.interceptors.response.use(
    response => {
      const url = response.config?.url || '';
      const method = response.config?.method || 'get';
      const cacheKey = getCacheKey(url, response.config?.params);

      if (isCacheable(url, method)) {
        responseCache.set(cacheKey, { data: response.data, ts: Date.now() });
        pendingRequests.delete(cacheKey);
      }

      return response.data;
    },
    async error => {
      const config = error.config as (AxiosRequestConfig & {
        retry?: number;
        __retryCount?: number;
        _isRefreshAttempt?: boolean;
      }) | undefined;

      const status = Number(error?.response?.status || 0);
      const shouldRetryError = !error?.response || status === 408 || status === 429 || status === 502 || status === 503 || status === 504;

      // 自动重试机制：仅针对幂等 GET 且属于网络/超时/限流/5xx 错误
      if (config && config.retry === undefined) {
        config.retry = 2;
      }

      if (config && shouldRetryError && (config.__retryCount ?? 0) < (config.retry ?? 0)) {
        config.__retryCount = (config.__retryCount ?? 0) + 1;

        // 仅重试 GET 请求（幂等）；POST/PUT/DELETE 哪怕网络错误也不重试，防止重复创建/结算
        const isGetRequest = config.method === 'get' || config.method === 'GET';

        if (isGetRequest) {
          // 指数退避延迟：1s, 2s, 4s...
          const backoff = new Promise((resolve) => {
            setTimeout(() => resolve(true), (1000 * Math.pow(2, (config.__retryCount ?? 1) - 1)));
          });

          await backoff;
          return client(config);
        }
      }

      const enrichedError = error;
      let errorMessage = '请求失败';

      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        const msg = data?.message || data?.error || '';

        switch (status) {
          case 400:
            errorMessage = msg || '请求参数错误';
            break;
          case 401: {
            // D-179：单飞刷新 + 温和失败——网络暂时不可用不清登录态、不弹"登录已过期"，
            // 仅后端明确拒绝（refreshToken 确凿失效）才清 token 登出
            const savedRefresh = (() => {
              try { return localStorage.getItem('refreshToken'); } catch { return null; }
            })();
            if (savedRefresh && !config?._isRefreshAttempt) {
              const result = await refreshAccessTokenWithRetry();
              if (result.ok) {
                if (config) {
                  (config as Record<string, unknown>)._isRefreshAttempt = true;
                  return client(config);
                }
              } else if (result.reason === 'network') {
                errorMessage = '网络不稳定，请稍后重试';
                break;
              }
            }
            // 确凿失效（后端明确拒绝 / 无 refreshToken / 刷新后重试仍 401）→ 清理并登出
            errorMessage = '登录已过期，请重新登录';
            clearAuthStorage(true);
            try {
              window.dispatchEvent(new CustomEvent('app:auth:logout'));
            } catch {
              // Ignore
            }
            break;
          }
          case 403: {
            const isExpiredByMessage = msg && (msg.includes('过期') || msg.includes('expired') || msg.includes('invalid token'));
            const isExpiredByJwt = (() => {
              try {
                const token = String(localStorage.getItem('authToken') || '').trim();
                return token ? isJwtExpired(token) : true;
              } catch { return true; }
            })();
            if (isExpiredByMessage || isExpiredByJwt) {
              errorMessage = '登录已过期，请重新登录';
              try {
                localStorage.removeItem('authToken');
                localStorage.removeItem('userId');
              } catch {
                // Ignore
              }
            } else {
              errorMessage = msg || '没有权限执行此操作';
            }
            break;
          }
          case 404:
            errorMessage = msg || '请求的资源不存在';
            break;
          case 409:
            errorMessage = msg || '资源冲突';
            break;
          case 422:
            errorMessage = msg || '请求数据验证失败';
            break;
          case 500:
            errorMessage = msg || '服务器内部错误';
            break;
          case 502:
            errorMessage = '网关错误';
            break;
          case 503:
            errorMessage = '服务不可用';
            break;
          default:
            errorMessage = msg || `请求失败 (${status})`;
        }
      } else if (error.request) {
        // 区分超时和网络错误，给用户更准确的提示
        const code = String(error.code || '').toUpperCase();
        const msg = String(error.message || '').toLowerCase();
        if (code === 'ECONNABORTED' || msg.includes('timeout') || code === 'ETIMEDOUT') {
          const urlForHint = config?.url || '';
          if (/\/scan\//i.test(urlForHint) || /scan.*execute/i.test(urlForHint)) {
            errorMessage = '扫码请求超时，请检查网络或稍后重试';
          } else if (/ocr|vision|recognize/.test(urlForHint)) {
            errorMessage = '图片识别请求超时，请重试';
          } else {
            errorMessage = '请求超时，请检查网络或稍后重试';
          }
        } else {
          errorMessage = '服务器无响应，请稍后重试';
        }
      } else {
        errorMessage = error.message;
      }

      enrichedError.message = errorMessage;
      return Promise.reject(enrichedError);
    }
  );

  return client;
};

export const requestWithPathFallback = async <T = unknown>(
  method: 'get' | 'post' | 'put' | 'delete',
  primaryPath: string,
  fallbackPath: string,
  payload?: unknown,
  config?: Record<string, unknown>
): Promise<T> => {
  const client = createApiClient();
  try {
    const fn = client[method] as (path: string, data?: unknown, cfg?: unknown) => Promise<T>;
    if (method === 'get' || method === 'delete') {
      return await fn(primaryPath, config);
    }
    return await fn(primaryPath, payload, config);
  } catch {
    const fn = client[method] as (path: string, data?: unknown, cfg?: unknown) => Promise<T>;
    if (method === 'get' || method === 'delete') {
      return await fn(fallbackPath, config);
    }
    return await fn(fallbackPath, payload, config);
  }
};
