import axios from 'axios';

export const generateRequestId = () => {
  try {
    const anyCrypto: any = typeof crypto !== 'undefined' ? (crypto as any) : undefined;
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

export const isDuplicateScanMessage = (serverMessage: any): boolean => {
  const msg = String(serverMessage || '').trim();
  if (!msg) return false;
  return msg.includes('忽略') || msg.includes('无需重复') || msg.includes('已扫码');
};

export const toUrlSearchParams = (params: Record<string, any>): URLSearchParams => {
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

export const withQuery = (path: string, params: Record<string, any>): string => {
  const qs = toUrlSearchParams(params).toString();
  return qs ? `${path}?${qs}` : path;
};

type OrderFrozenSource = {
  status?: any;
  orderQuantity?: any;
  inStockQuantity?: any;
  warehousingQualifiedQuantity?: any;
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
  orderId: any,
  opts?: { acceptAnyData?: boolean }
): Promise<any | null> => {
  const oid = String(orderId || '').trim();
  if (!oid) return null;
  try {
    const res = await api.get<any>(`/production/order/detail/${encodeURIComponent(oid)}`);
    const result = res as any;
    if (result?.code === 200) return result?.data ?? null;
    if (opts?.acceptAnyData) return result?.data ?? null;
    return null;
  } catch {
    return null;
  }
};

export type ProductionOrderFrozenRule = 'status' | 'statusOrStock';

export const primeProductionOrderFrozenCache = async (
  orderId: any,
  cache: Map<string, boolean>,
  opts: { rule: ProductionOrderFrozenRule; acceptAnyData?: boolean; onCacheUpdated?: () => void }
): Promise<boolean | undefined> => {
  const oid = String(orderId || '').trim();
  if (!oid) return undefined;
  const cached = cache.get(oid);
  if (cached !== undefined) return cached;

  const detail = await fetchProductionOrderDetail(oid, { acceptAnyData: opts.acceptAnyData });
  if (!detail) return undefined;

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
const api = axios.create({
  baseURL: '/api',
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

// 响应拦截器
api.interceptors.response.use(
  response => {
    const result = response.data;
    // 直接返回完整的统一结果结构，让前端组件自行处理
    return result;
  },
  error => {
    // 处理网络错误和服务器错误
    let errorMessage = '请求失败';
    const enrichedError: any = new Error(errorMessage);
    if (error.response) {
      // 服务器返回了错误响应
      const result = error.response.data;
      const status = error.response.status;
      errorMessage = result?.message || `请求失败 (${status})`;

      enrichedError.status = status;
      enrichedError.result = result;
    } else if (error.request) {
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
