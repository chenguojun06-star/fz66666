import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

/**
 * 核心 API 超时配置（毫秒）
 * - 普通请求：15秒
 * - 扫码提交：10秒（快速失败，便于用户重试）
 * - AI/图片识别：60秒（视觉模型处理可能需要长耗时）
 * - 文件上传：60秒
 */
export const API_TIMEOUT_MS = 15000;
export const SCAN_API_TIMEOUT_MS = 10000;
export const AI_VISION_TIMEOUT_MS = 60000;
export const FILE_UPLOAD_TIMEOUT_MS = 60000;

export type ApiResult<T = unknown> = {
  code: number;
  data: T;
  message?: string;
  requestId?: string;
};

export type ApiClient = Omit<AxiosInstance, 'request' | 'get' | 'delete' | 'head' | 'options' | 'post' | 'put' | 'patch'> & {
  <T = any, R = T, D = any>(config: AxiosRequestConfig<D>): Promise<R>;
  request<T = any, R = T, D = any>(config: AxiosRequestConfig<D>): Promise<R>;
  get<T = any, R = T, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<R>;
  delete<T = any, R = T, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<R>;
  head<T = any, R = T, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<R>;
  options<T = any, R = T, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<R>;
  post<T = any, R = T, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R>;
  put<T = any, R = T, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R>;
  patch<T = any, R = T, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R>;
};

export const isApiSuccess = (result: unknown): result is ApiResult => {
  return (
    typeof result === 'object' &&
    result !== null &&
    'code' in result &&
    Number((result as ApiResult).code) === 200
  );
};

export const getApiMessage = (result: unknown, fallback: string): string => {
  if (typeof result === 'object' && result !== null && 'message' in result) {
    const msg = String((result as { message: unknown }).message || '').trim();
    return msg || fallback;
  }
  return fallback;
};

export const unwrapApiData = <T = unknown>(result: unknown, fallbackMessage: string): T => {
  if (isApiSuccess(result)) return (result as ApiResult<T>).data;
  throw new Error(getApiMessage(result, fallbackMessage));
};

export const generateRequestId = () => {
  try {
    const anyCrypto = typeof crypto !== 'undefined' ? (crypto as unknown as any) : undefined;
    if (anyCrypto && typeof anyCrypto.randomUUID === 'function') {
      return String(anyCrypto.randomUUID());
    }
  } catch {
    // Intentionally empty
  }
  const t = Date.now().toString(36);
  const r1 = Math.random().toString(36).slice(2, 10);
  const r2 = Math.random().toString(36).slice(2, 10);
  return `${t}-${r1}-${r2}`;
};

export const toNumberSafe = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toUrlSearchParams = (params: Record<string, unknown>): URLSearchParams => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });
  return searchParams;
};

export const withQuery = (path: string, params: Record<string, unknown>): string => {
  const searchParams = toUrlSearchParams(params);
  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
};

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
            const savedRefresh = localStorage.getItem('refreshToken');
            if (savedRefresh) {
              try {
                const refreshClient = axios.create({ baseURL: resolveApiBaseUrl(), timeout: 10000 });
                const refreshRes = await refreshClient.post('/system/user/refresh-token', { refreshToken: savedRefresh });
                if (refreshRes.data?.code === 200 && refreshRes.data?.data?.token) {
                  const newToken = String(refreshRes.data.data.token).trim();
                  const newRefresh = String(refreshRes.data.data.refreshToken || '').trim();
                  localStorage.setItem('authToken', newToken);
                  if (newRefresh) localStorage.setItem('refreshToken', newRefresh);
                  setHeader('Authorization', `Bearer ${newToken}`);
                  import('@/utils/fileUrl').then(({ invalidateFileUrlTokenCache }) => invalidateFileUrlTokenCache());
                } else {
                  try {
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('refreshToken');
                    localStorage.removeItem('userId');
                  } catch { /* ignore */ }
                }
              } catch {
                try {
                  localStorage.removeItem('authToken');
                  localStorage.removeItem('refreshToken');
                  localStorage.removeItem('userId');
                } catch { /* ignore */ }
              }
            } else {
              try {
                localStorage.removeItem('authToken');
                localStorage.removeItem('userId');
              } catch { /* ignore */ }
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
            errorMessage = '登录已过期，请重新登录';
            const savedRefresh = localStorage.getItem('refreshToken');
            if (savedRefresh && !config?._isRefreshAttempt) {
              try {
                const refreshClient = axios.create({ baseURL: resolveApiBaseUrl(), timeout: 10000 });
                const refreshRes = await refreshClient.post('/system/user/refresh-token', { refreshToken: savedRefresh });
                if (refreshRes.data?.code === 200 && refreshRes.data?.data?.token) {
                  const newToken = String(refreshRes.data.data.token).trim();
                  const newRefresh = String(refreshRes.data.data.refreshToken || '').trim();
                  localStorage.setItem('authToken', newToken);
                  if (newRefresh) localStorage.setItem('refreshToken', newRefresh);
                  import('@/utils/fileUrl').then(({ invalidateFileUrlTokenCache }) => invalidateFileUrlTokenCache());
                  if (config) {
                    (config as Record<string, unknown>)._isRefreshAttempt = true;
                    return client(config);
                  }
                }
              } catch {
                // refresh failed, fall through to logout
              }
            }
            try {
              localStorage.removeItem('authToken');
              localStorage.removeItem('refreshToken');
              localStorage.removeItem('userId');
            } catch {
              // Ignore
            }
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
