import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';

export type ApiResult<T = unknown> = {
  code: number;
  data: T;
  message?: string;
  [key: string]: unknown;
};

export const isApiSuccess = (result: unknown): result is ApiResult => {
  return Number((result as any)?.code) === 200;
};

export const getApiMessage = (result: unknown, fallback: string): string => {
  const msg = String((result as any)?.message || '').trim();
  return msg || fallback;
};

export const unwrapApiData = <T = unknown>(result: unknown, fallbackMessage: string): T => {
  if (isApiSuccess(result)) return (result as ApiResult<T>).data;
  throw new Error(getApiMessage(result, fallbackMessage));
};

export const generateRequestId = () => {
  try {
    const anyCrypto = typeof crypto !== 'undefined' ? (crypto as any) : undefined;
    if (anyCrypto && typeof anyCrypto.randomUUID === 'function') {
      return String(anyCrypto.randomUUID());
    }
  } catch {
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
};

export const parseProductionOrderLines = (
  order?: unknown | null,
  opts?: { includeWarehousedQuantity?: boolean }
): ProductionOrderLine[] => {
  if (!order) return [];

  const includeWarehousedQuantity = Boolean(opts?.includeWarehousedQuantity);
  const detailsRaw = (order as any)?.orderDetails;

  const normalizeLine = (r: any): ProductionOrderLine => {
    const color = String(r?.color ?? r?.colour ?? r?.colorName ?? r?.['颜色'] ?? '').trim();
    const size = String(r?.size ?? r?.sizeName ?? r?.spec ?? r?.尺码 ?? r?.['尺码'] ?? '').trim();
    const quantity = toNumberSafe(r?.quantity ?? r?.qty ?? r?.count ?? r?.num ?? r?.数量 ?? r?.['数量']);
    const warehousedQuantity = toNumberSafe(
      r?.warehousedQuantity ?? r?.warehousingQualifiedQuantity ?? r?.warehousingQuantity ?? r?.qualifiedQuantity ?? r?.入库数量 ?? r?.['入库数量']
    );

    if (includeWarehousedQuantity) return { color, size, quantity, warehousedQuantity };
    return { color, size, quantity };
  };

  let parsed: unknown = null;
  if (detailsRaw != null && String(detailsRaw).trim()) {
    try {
      parsed = typeof detailsRaw === 'string' ? JSON.parse(detailsRaw) : detailsRaw;
    } catch {
      parsed = null;
    }
  }

  let list: unknown[] = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const candidate = (parsed as any).lines || (parsed as any).items || (parsed as any).details || (parsed as any).list || (parsed as any).orderLines;
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

  const fallbackColor = String((order as any)?.color || '').trim();
  const fallbackSize = String((order as any)?.size || '').trim();
  const fallbackQty = toNumberSafe((order as any)?.orderQuantity);
  const fallbackWarehousedQty = toNumberSafe((order as any)?.warehousingQualifiedQuantity);

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
  orderId: unknown,
  opts?: { acceptAnyData?: boolean }
): Promise<unknown | null> => {
  const oid = String(orderId || '').trim();
  if (!oid) return null;
  try {
    const res = await api.get<any>(`/production/order/detail/${encodeURIComponent(oid)}`);
    const result = res as any;
    if (result?.code === 200) return result?.data ?? null;
    if (opts?.acceptAnyData) return result?.data ?? null;
    return null;
  } catch (error: any) {
    // 静默处理404错误（订单已删除）
    if (error?.response?.status === 404) {
      return null;
    }
    return null;
  }
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

  const detail = await fetchProductionOrderDetail(oid, { acceptAnyData: opts.acceptAnyData });
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
};

export const ensureProductionOrderUnlocked = async (
  orderId: any,
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

export const useProductionOrderFrozenCache = (ids: any[], opts: UseProductionOrderFrozenCacheOptions) => {
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

  const isFrozenById = (orderId: any) => {
    void version;
    const oid = String(orderId || '').trim();
    if (!oid) return false;
    return cacheRef.current.get(oid) === true;
  };

  const ensureUnlocked = async (orderId: any, onFrozen?: () => void) => {
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

export const updateFinanceReconciliationStatus = async (id: string, status: string) => {
  const rid = String(id || '').trim();
  const st = String(status || '').trim();
  if (!rid || !st) {
    return { code: 400, message: '参数错误' } as any;
  }
  return api.put<any>('/finance/reconciliation/status', null, { params: { id: rid, status: st } });
};

export const returnFinanceReconciliation = async (id: string, reason: string) => {
  const rid = String(id || '').trim();
  const r = String(reason || '').trim();
  if (!rid || !r) {
    return { code: 400, message: '参数错误' } as any;
  }
  return api.post<any>('/finance/reconciliation/return', { id: rid, reason: r });
};

// 创建请求实例
const resolveApiBaseUrl = (): string => {
  try {
    const raw = (import.meta as any)?.env?.VITE_API_BASE_URL;
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

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器
api.interceptors.request.use(
  config => {
    const headers: any = config.headers || {};

    const toLatin1HeaderValue = (input: any) => {
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

    const setHeader = (k: string, v: any) => {
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
    }

    try {
      setHeader('X-Request-Id', (headers && typeof headers.get === 'function' ? headers.get('X-Request-Id') : headers['X-Request-Id']) || generateRequestId());
    } catch {
      setHeader('X-Request-Id', generateRequestId());
    }

    try {
      const anyData: any = (config as any).data;
      if (typeof FormData !== 'undefined' && anyData instanceof FormData) {
        delete headers['Content-Type'];
        delete headers['content-type'];
        if (typeof headers.delete === 'function') {
          headers.delete('Content-Type');
          headers.delete('content-type');
        }

        const currentTimeout = Number((config as any).timeout);
        if (!Number.isFinite(currentTimeout) || currentTimeout < 60000) {
          (config as any).timeout = 60000;
        }
      }
    } catch {
      // 忽略异常，按默认超时与请求头继续
    }

    config.headers = headers;
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
      }
      try {
        if (typeof window !== 'undefined') {
          const p = String(window.location?.pathname || '');
          if (p !== '/login') {
            window.dispatchEvent(new CustomEvent('app:auth:logout'));
          }
        }
      } catch {
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
    const enrichedError: any = new Error(errorMessage);

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

export const requestWithPathFallback = async <T = any>(
  method: 'get' | 'post' | 'put' | 'delete',
  primaryPath: string,
  fallbackPath: string,
  payload?: any,
  config?: any
): Promise<T> => {
  try {
    const fn = (api as any)[method];
    if (method === 'get' || method === 'delete') {
      return await fn(primaryPath, config);
    }
    return await fn(primaryPath, payload, config);
  } catch {
    const fn = (api as any)[method];
    if (method === 'get' || method === 'delete') {
      return await fn(fallbackPath, config);
    }
    return await fn(fallbackPath, payload, config);
  }
};

export default api;
