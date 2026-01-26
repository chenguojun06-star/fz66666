import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosRequestHeaders } from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiResponse } from '../types/api';

export type ApiResult<T = any> = {
  code: number;
  data: T;
  message?: string;
  [key: string]: any;
};

type ApiClient = Omit<AxiosInstance, 'request' | 'get' | 'delete' | 'head' | 'options' | 'post' | 'put' | 'patch'> & {
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
    const anyCrypto = typeof crypto !== 'undefined' ? (crypto as unknown as Record<string, unknown>) : undefined;
    if (anyCrypto && typeof anyCrypto.randomUUID === 'function') {
      return String(anyCrypto.randomUUID());
    }
  } catch {
    // Intentionally empty
    // 忽略错误
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

export const compareSizeAsc = (a: unknown, b: unknown) => {
  const norm = (v: unknown) => String(v ?? '').trim().toUpperCase();
  const parse = (v: unknown) => {
    const raw = norm(v);
    if (!raw || raw === '-') return { rank: 9999, num: 0, raw };
    if (raw === '均码' || raw === 'ONE SIZE' || raw === 'ONESIZE') return { rank: 55, num: 0, raw };
    if (/^\d+(\.\d+)?$/.test(raw)) return { rank: 0, num: Number(raw), raw };
    const mNumXL = raw.match(/^(\d+)XL$/);
    if (mNumXL) return { rank: 70 + (Number(mNumXL[1]) - 1) * 10, num: 0, raw };
    const mXS = raw.match(/^(X{0,4})S$/);
    if (mXS) return { rank: 40 - (mXS[1]?.length || 0) * 10, num: 0, raw };
    if (raw === 'S') return { rank: 40, num: 0, raw };
    if (raw === 'M') return { rank: 50, num: 0, raw };
    const mXL = raw.match(/^(X{1,4})L$/);
    if (mXL) return { rank: 60 + (mXL[1]?.length || 0) * 10, num: 0, raw };
    if (raw === 'L') return { rank: 60, num: 0, raw };
    if (raw === 'XL') return { rank: 70, num: 0, raw };
    if (raw === 'XXL') return { rank: 80, num: 0, raw };
    if (raw === 'XXXL') return { rank: 90, num: 0, raw };
    return { rank: 5000, num: 0, raw };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa.rank !== pb.rank) return pa.rank - pb.rank;
  if (pa.num !== pb.num) return pa.num - pb.num;
  return String(pa.raw).localeCompare(String(pb.raw), 'zh-Hans-CN', { numeric: true });
};

export const sortSizeNames = (sizes: string[]) => {
  const getKey = (name: string): { group: number; a: number; b: string | number; unit: string } => {
    const t = String(name || '').trim();
    const order = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'];
    const upper = t.toUpperCase();
    const idx = order.indexOf(upper);
    if (idx >= 0) return { group: 0, a: idx, b: upper, unit: '' };
    const m = upper.match(/^(\d+(?:\.\d+)?)(?:\s*[-~–—]\s*(\d+(?:\.\d+)?))?([A-Z]*)$/);
    if (m) {
      const a = toNumberSafe(m[1]);
      const b = String(m[2] || '').trim() ? toNumberSafe(m[2]) : a;
      const unit = m[3] || '';
      return { group: 1, a, b, unit };
    }
    return { group: 2, a: 0, b: upper, unit: '' };
  };

  const list = [...sizes];
  list.sort((a, b) => {
    const ka = getKey(a);
    const kb = getKey(b);
    if (ka.group !== kb.group) return ka.group - kb.group;
    if (ka.a !== kb.a) return ka.a - kb.a;
    if (ka.b !== kb.b) return ka.b < kb.b ? -1 : 1;
    const ua = ka.unit || '';
    const ub = kb.unit || '';
    if (ua !== ub) return ua < ub ? -1 : 1;
    return 0;
  });
  return list;
};

export type ProductionOrderLine = {
  color: string;
  size: string;
  quantity: number;
  warehousedQuantity?: number;
  skuNo?: string;
};

export const parseProductionOrderLines = (
  order?: unknown | null,
  opts?: { includeWarehousedQuantity?: boolean }
): ProductionOrderLine[] => {
  if (!order) return [];

  const includeWarehousedQuantity = Boolean(opts?.includeWarehousedQuantity);
  const detailsRaw = (order as Record<string, unknown>)?.orderDetails;

  const normalizeLine = (r: unknown): ProductionOrderLine => {
    const row = r && typeof r === 'object' ? (r as Record<string, unknown>) : {};
    const color = String(row?.color ?? row?.colour ?? row?.colorName ?? row?.['颜色'] ?? '').trim();
    const size = String(row?.size ?? row?.sizeName ?? row?.spec ?? row?.尺码 ?? row?.['尺码'] ?? '').trim();
    const quantity = toNumberSafe(row?.quantity ?? row?.qty ?? row?.count ?? row?.num ?? row?.数量 ?? row?.['数量']);
    const lineSku = String(row?.skuNo ?? row?.skuKey ?? row?.sku ?? row?.sku_code ?? row?.skuCode ?? '').trim();
    const orderNo = String((order as Record<string, unknown>)?.orderNo ?? row?.orderNo ?? '').trim();
    const styleNo = String((order as Record<string, unknown>)?.styleNo ?? row?.styleNo ?? '').trim();
    const normalizedLineSku = lineSku
      ? (lineSku.toUpperCase().startsWith('SKU') ? lineSku : `SKU-${lineSku}`)
      : '';
    const composedSku = orderNo && styleNo && color && size
      ? `SKU-${orderNo}-${styleNo}-${color}-${size}`
      : '';
    const skuNo = normalizedLineSku || composedSku;
    const warehousedQuantity = toNumberSafe(
      row?.warehousedQuantity ?? row?.warehousingQualifiedQuantity ?? row?.warehousingQuantity ?? row?.qualifiedQuantity ?? row?.入库数量 ?? row?.['入库数量']
    );

    if (includeWarehousedQuantity) return { color, size, quantity, warehousedQuantity, skuNo };
    return { color, size, quantity, skuNo };
  };

  let parsed: unknown = null;
  if (detailsRaw != null && String(detailsRaw).trim()) {
    try {
      parsed = typeof detailsRaw === 'string' ? JSON.parse(detailsRaw) : detailsRaw;
    } catch {
      // Intentionally empty
      // 忽略错误
      parsed = null;
    }
  }

  let list: unknown[] = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const candidate = (parsed as Record<string, unknown>).lines || (parsed as Record<string, unknown>).items || (parsed as Record<string, unknown>).details || (parsed as Record<string, unknown>).list || (parsed as Record<string, unknown>).orderLines;
    if (Array.isArray(candidate)) list = candidate;
    else list = [parsed];
  }

  const normalized = list
    .map(normalizeLine)
    .filter((l) => {
      if (!l.color || !l.size) return false;
      if (includeWarehousedQuantity) return l.quantity > 0 || (Number(l.warehousedQuantity) || 0) > 0;
      return l.quantity > 0;
    });
  if (normalized.length) return normalized;

  const fallbackColor = String((order as Record<string, unknown>)?.color || '').trim();
  const fallbackSize = String((order as Record<string, unknown>)?.size || '').trim();
  const fallbackQty = toNumberSafe((order as Record<string, unknown>)?.orderQuantity);
  const fallbackWarehousedQty = toNumberSafe((order as Record<string, unknown>)?.warehousingQualifiedQuantity);

  if (!fallbackColor || !fallbackSize) return [];
  if (includeWarehousedQuantity) {
    if (fallbackQty > 0 || fallbackWarehousedQty > 0) {
      return [{ color: fallbackColor, size: fallbackSize, quantity: fallbackQty, warehousedQuantity: fallbackWarehousedQty }];
    }
    return [];
  }
  if (fallbackQty > 0) return [{ color: fallbackColor, size: fallbackSize, quantity: fallbackQty }];
  return [];
};

export const isDuplicateScanMessage = (serverMessage: unknown): boolean => {
  const msg = String(serverMessage || '').trim();
  if (!msg) return false;
  return msg.includes('忽略') || msg.includes('无需重复') || msg.includes('已扫码');
};

export const toUrlSearchParams = (params: Record<string, unknown>): URLSearchParams => {
  const sp = new URLSearchParams();
  if (!params || typeof params !== 'object') return sp;
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    const s = typeof v === 'string' ? v.trim() : String(v);
    if (!s) continue;
    sp.set(k, s);
  }
  return sp;
};

export const withQuery = (path: string, params: Record<string, unknown>): string => {
  const qs = toUrlSearchParams(params).toString();
  return qs ? `${path}?${qs}` : path;
};

type OrderFrozenSource = {
  status?: unknown;
  orderQuantity?: unknown;
  inStockQuantity?: unknown;
  warehousingQualifiedQuantity?: unknown;
};

export const isOrderFrozenByStatus = (source?: OrderFrozenSource | null): boolean => {
  const status = String(source?.status || '').trim().toLowerCase();
  return status === 'completed';
};

export const isOrderFrozenByStatusOrStock = (source?: OrderFrozenSource | null): boolean => {
  if (!source) return false;
  const status = String(source?.status || '').trim().toLowerCase();
  if (status === 'completed') return true;

  const totalQty = Number(source?.orderQuantity) || 0;
  if (totalQty <= 0) return false;

  const inStock = Math.max(Number(source?.inStockQuantity) || 0, Number(source?.warehousingQualifiedQuantity) || 0);
  return inStock >= totalQty;
};

export const fetchProductionOrderDetail = async (
  orderNo: unknown,
  opts?: { acceptAnyData?: boolean; silent404?: boolean }
): Promise<Record<string, unknown> | null> => {
  const oid = String(orderNo || '').trim();
  if (!oid) return null;

  try {
    const endpoint = `/production/order/by-order-no/${encodeURIComponent(oid)}`;
    const res = await api.get<ApiResponse<Record<string, unknown>>>(endpoint);
    if (isApiSuccess(res) && res.data) return res.data;
    if (opts?.acceptAnyData && typeof res === 'object' && res !== null && 'data' in res) {
      const data = (res as { data: Record<string, unknown> }).data;
      if (data) return data;
    }
  } catch (error: unknown) {
    const is404 = typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      typeof (error as { response: unknown }).response === 'object' &&
      (error as { response: { status: unknown } }).response !== null &&
      'status' in (error as { response: { status: unknown } }).response &&
      (error as { response: { status: number } }).response.status === 404;
    if (!is404) {
      if (!opts?.silent404) {
        console.debug('[fetchProductionOrderDetail] 请求失败:', oid, error);
      }
      return null;
    }
  }

  if (!opts?.silent404) {
    console.debug('[fetchProductionOrderDetail] 订单不存在或已删除:', oid);
  }
  return null;
};

export type ProductionOrderFrozenRule = 'status' | 'statusOrStock';

export const primeProductionOrderFrozenCache = async (
  orderId: unknown,
  cache: Map<string, boolean>,
  opts: { rule: ProductionOrderFrozenRule; acceptAnyData?: boolean; onCacheUpdated?: () => void }
): Promise<boolean | undefined> => {
  const oid = String(orderId || '').trim();
  if (!oid) return undefined;
  const cached = cache.get(oid);
  if (cached !== undefined) return cached;

  try {
    // 静默处理404错误，避免控制台警告
    const detail = await fetchProductionOrderDetail(oid, {
      acceptAnyData: opts.acceptAnyData,
      silent404: true
    });
    if (!detail) {
      // 订单不存在或已删除，缓存false避免重复请求
      cache.set(oid, false);
      opts.onCacheUpdated?.();
      return false;
    }

    const frozen = opts.rule === 'status' ? isOrderFrozenByStatus(detail) : isOrderFrozenByStatusOrStock(detail);
    cache.set(oid, frozen);
    opts.onCacheUpdated?.();
    return frozen;
  } catch (error: unknown) {
    // 静默处理订单加载失败（404或其他错误）
    cache.set(oid, false);
    opts.onCacheUpdated?.();
    return false;
  }
};

export const ensureProductionOrderUnlocked = async (
  orderId: unknown,
  cache: Map<string, boolean>,
  opts: {
    rule: ProductionOrderFrozenRule;
    acceptAnyData?: boolean;
    onCacheUpdated?: () => void;
    onFrozen?: () => void;
  }
): Promise<boolean> => {
  const oid = String(orderId || '').trim();
  if (!oid) return true;

  const cached = cache.get(oid);
  if (cached !== undefined) {
    if (cached) opts.onFrozen?.();
    return !cached;
  }

  const frozen = await primeProductionOrderFrozenCache(oid, cache, {
    rule: opts.rule,
    acceptAnyData: opts.acceptAnyData,
    onCacheUpdated: opts.onCacheUpdated,
  });
  if (frozen === true) {
    opts.onFrozen?.();
    return false;
  }
  return true;
};

export type UseProductionOrderFrozenCacheOptions = {
  rule: ProductionOrderFrozenRule;
  acceptAnyData?: boolean;
  primeBatchSize?: number;
};

export const useProductionOrderFrozenCache = (
  ids: unknown[],
  opts: UseProductionOrderFrozenCacheOptions
) => {
  const cacheRef = useRef<Map<string, boolean>>(new Map());
  const [version, setVersion] = useState(0);

  const primeBatchSize = Math.max(1, Math.floor(Number(opts?.primeBatchSize ?? 50) || 50));
  const acceptAnyData = Boolean(opts?.acceptAnyData);
  const rule = opts?.rule;

  const normalizedIds = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const v of Array.isArray(ids) ? ids : []) {
      const id = String(v || '').trim();
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }, [ids]);

  const bump = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!rule) return;
    const missing = normalizedIds.filter((id) => !cacheRef.current.has(id));
    if (!missing.length) return;

    let cancelled = false;
    void (async () => {
      await Promise.allSettled(
        missing
          .slice(0, primeBatchSize)
          .map((id) =>
            primeProductionOrderFrozenCache(id, cacheRef.current, {
              rule,
              acceptAnyData,
              onCacheUpdated: bump,
            })
          )
      );
      if (!cancelled) bump();
    })();

    return () => {
      cancelled = true;
    };
  }, [acceptAnyData, normalizedIds, primeBatchSize, rule]);

  const isFrozenById = (orderId: unknown) => {
    void version;
    const oid = String(orderId || '').trim();
    if (!oid) return false;
    return cacheRef.current.get(oid) === true;
  };

  const ensureUnlocked = async (orderId: unknown, onFrozen?: () => void) => {
    if (!rule) return true;
    return await ensureProductionOrderUnlocked(orderId, cacheRef.current, {
      rule,
      acceptAnyData,
      onCacheUpdated: bump,
      onFrozen,
    });
  };

  return { cacheRef, isFrozenById, ensureUnlocked };
};

export const updateFinanceReconciliationStatus = async (
  id: string,
  status: string
): Promise<ApiResponse> => {
  const rid = String(id || '').trim();
  const st = String(status || '').trim();
  if (!rid || !st) {
    return { code: 400, message: '参数错误', data: null };
  }
  return api.put<ApiResponse, ApiResponse>('/finance/reconciliation/status', null, {
    params: { id: rid, status: st },
  });
};

export const returnFinanceReconciliation = async (
  id: string,
  reason: string
): Promise<ApiResponse> => {
  const rid = String(id || '').trim();
  const r = String(reason || '').trim();
  if (!rid || !r) {
    return { code: 400, message: '参数错误', data: null };
  }
  return api.post<ApiResponse, ApiResponse>('/finance/reconciliation/return', { id: rid, reason: r });
};

// 创建请求实例
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
    // Intentionally empty
    // 忽略错误
    return '/api';
  }
};

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
}) as ApiClient;

// 请求拦截器
api.interceptors.request.use(
  config => {
    const headers = (config.headers || {}) as Record<string, unknown> & {
      set?: (key: string, value: string) => void;
      get?: (key: string) => unknown;
      delete?: (key: string) => void;
    };

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
      // Intentionally empty
      // 忽略错误
    }

    try {
      setHeader('X-Request-Id', (headers && typeof headers.get === 'function' ? headers.get('X-Request-Id') : headers['X-Request-Id']) || generateRequestId());
    } catch {
      // Intentionally empty
      // 忽略错误
      setHeader('X-Request-Id', generateRequestId());
    }

    try {
      const anyData: unknown = (config as unknown as Record<string, unknown>).data;
      if (typeof FormData !== 'undefined' && anyData instanceof FormData) {
        delete headers['Content-Type'];
        delete headers['content-type'];
        if (typeof headers.delete === 'function') {
          headers.delete('Content-Type');
          headers.delete('content-type');
        }

        const currentTimeout = Number((config as unknown as Record<string, unknown>).timeout);
        if (!Number.isFinite(currentTimeout) || currentTimeout < 60000) {
          (config as unknown as Record<string, unknown>).timeout = 60000;
        }
      }
    } catch {
      // Intentionally empty
      // 忽略错误
      // 忽略异常，按默认超时与请求头继续
    }

    config.headers = headers as AxiosRequestHeaders;
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// 请求重试配置
const retryConfig = {
  retries: 2, // 最多重试2次
  retryDelay: 1000, // 重试间隔1秒
  retryableStatuses: [500, 502, 503, 504] // 可重试的HTTP状态码
};

// 响应拦截器
api.interceptors.response.use(
  response => {
    const result = response.data;
    // 直接返回完整的统一结果结构，让前端组件自行处理
    return result;
  },
  async error => {
    const { config, response, request } = error;

    const status = response?.status;
    if (status === 401 || status === 403) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('authToken');
          localStorage.removeItem('userInfo');
        }
      } catch {
        // Intentionally empty
        // 忽略错误
      }
      try {
        if (typeof window !== 'undefined') {
          const p = String(window.location?.pathname || '');
          if (p !== '/login') {
            window.dispatchEvent(new CustomEvent('app:auth:logout'));
          }
        }
      } catch {
        // Intentionally empty
        // 忽略错误
      }
    }

    // 处理请求配置错误
    if (!config) {
      return Promise.reject(error);
    }

    // 初始化重试计数
    config._retryCount = config._retryCount || 0;

    // 判断是否需要重试
    const shouldRetry = (
      config._retryCount < retryConfig.retries &&
      (request && !response) || // 网络错误或服务器无响应
      (response && retryConfig.retryableStatuses.includes(response.status)) // 可重试的服务器错误
    );

    if (shouldRetry) {
      // 增加重试计数
      config._retryCount += 1;

      // 等待指定时间后重试
      await new Promise(resolve => setTimeout(resolve, retryConfig.retryDelay));

      // 重试请求
      return api(config);
    }

    // 不重试时，构造错误信息
    let errorMessage = '请求失败';
    const enrichedError = new Error(errorMessage) as Error & {
      status?: number;
      result?: unknown;
      message: string;
    };

    if (response) {
      // 服务器返回了错误响应
      const result = response.data;
      const status = response.status;
      errorMessage = result?.message || `请求失败 (${status})`;

      enrichedError.status = status;
      enrichedError.result = result;
    } else if (request) {
      // 请求发送成功但没有收到响应
      errorMessage = '服务器无响应';
    } else {
      // 请求配置错误
      errorMessage = error.message;
    }

    enrichedError.message = errorMessage;
    return Promise.reject(enrichedError);
  }
);

export const requestWithPathFallback = async <T = unknown>(
  method: 'get' | 'post' | 'put' | 'delete',
  primaryPath: string,
  fallbackPath: string,
  payload?: unknown,
  config?: Record<string, unknown>
): Promise<T> => {
  try {
    const fn = api[method] as (path: string, data?: unknown, cfg?: unknown) => Promise<T>;
    if (method === 'get' || method === 'delete') {
      return await fn(primaryPath, config);
    }
    return await fn(primaryPath, payload, config);
  } catch {
    // Intentionally empty
    // 忽略错误
    const fn = api[method] as (path: string, data?: unknown, cfg?: unknown) => Promise<T>;
    if (method === 'get' || method === 'delete') {
      return await fn(fallbackPath, config);
    }
    return await fn(fallbackPath, payload, config);
  }
};

export default api;
