import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';

let __authRedirectTs = 0;

export type ApiResult<T = any> = {
  code: number;
  data: T;
  message?: string;
  [key: string]: any;
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

export const toUrlSearchParams = (params: Record<string, unknown>): URLSearchParams => {
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

const resolveApiBaseUrl = (): string => {
  try {
    const raw = (import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } })?.env?.VITE_API_BASE_URL;
    const v = raw == null ? '' : String(raw).trim();
    if (!v) return '/api';

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

export const createApiClient = (): ApiClient => {
  const client = axios.create({
    baseURL: resolveApiBaseUrl(),
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json'
    }
  }) as ApiClient;

  // 请求拦截器
  client.interceptors.request.use(
    config => {
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
          setHeader('Authorization', `Bearer ${token}`);
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

      return config;
    },
    error => Promise.reject(error)
  );

  // 响应拦截器
  client.interceptors.response.use(
    response => response.data,
    error => {
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
          case 401:
            errorMessage = '登录已过期，请重新登录';
            try {
              localStorage.removeItem('authToken');
              localStorage.removeItem('userId');
            } catch {
              // Ignore
            }
            {
              const nowTs = Date.now();
              if (nowTs - __authRedirectTs > 1000) {
                __authRedirectTs = nowTs;
                window.location.href = '/login';
              }
            }
            break;
          case 403: {
            const isExpired = msg && (msg.includes('过期') || msg.includes('expired') || msg.includes('invalid token'));
            if (isExpired) {
              errorMessage = '登录已过期，请重新登录';
              try {
                localStorage.removeItem('authToken');
                localStorage.removeItem('userId');
              } catch {
                // Ignore
              }
              const nowTs403 = Date.now();
              if (nowTs403 - __authRedirectTs > 1000) {
                __authRedirectTs = nowTs403;
                window.location.href = '/login';
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
        errorMessage = '服务器无响应';
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
