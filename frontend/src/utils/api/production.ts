import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ApiResponse } from '../../types/api';
import { createApiClient, toNumberSafe } from './core';

const api = createApiClient();

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

type OrderFrozenSource = { status?: string; hasStockOut?: boolean };

export const isOrderFrozenByStatus = (source?: OrderFrozenSource | null): boolean => {
  if (!source) return false;
  const s = String(source.status || '').trim().toLowerCase();
  return s === 'completed' || s === 'closed' || s === 'cancelled';
};

export const isOrderFrozenByStatusOrStock = (source?: OrderFrozenSource | null): boolean => {
  if (isOrderFrozenByStatus(source)) return true;
  return Boolean(source?.hasStockOut);
};

export const fetchProductionOrderDetail = async (
  id?: string | null,
  orderNo?: string | null
): Promise<unknown> => {
  const key = String(id || '').trim() || String(orderNo || '').trim();
  if (!key) throw new Error('缺少订单ID或订单号');

  const byIdPath = `/production/order/detail/${encodeURIComponent(key)}`;
  const byNoPath = `/production/order/by-order-no/${encodeURIComponent(key)}`;

  try {
    const resp = await api.get<ApiResponse>(byIdPath);
    if (resp && resp.code === 200 && resp.data) return resp.data;
  } catch {
    // Try by order number
  }

  try {
    const resp = await api.get<ApiResponse>(byNoPath);
    if (resp && resp.code === 200 && resp.data) return resp.data;
  } catch {
    // Failed
  }

  throw new Error('未找到订单');
};

export type ProductionOrderFrozenRule = 'status' | 'statusOrStock';

type CacheEntry = {
  data: unknown;
  ts: number;
};

const globalCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

export const primeProductionOrderFrozenCache = async (
  id: string,
  options?: { ttlMs?: number; rule?: ProductionOrderFrozenRule }
): Promise<{ frozen: boolean; source?: OrderFrozenSource }> => {
  const rid = String(id || '').trim();
  if (!rid) return { frozen: false };

  const now = Date.now();
  const cached = globalCache.get(rid);
  const ttl = options?.ttlMs ?? CACHE_TTL_MS;

  if (cached && now - cached.ts < ttl) {
    const source = cached.data as OrderFrozenSource | undefined;
    const rule = options?.rule ?? 'status';
    const frozen = rule === 'statusOrStock' ? isOrderFrozenByStatusOrStock(source) : isOrderFrozenByStatus(source);
    return { frozen, source };
  }

  try {
    const order = await fetchProductionOrderDetail(rid);
    const source: OrderFrozenSource = {
      status: String((order as Record<string, unknown>)?.status || ''),
      hasStockOut: Boolean((order as Record<string, unknown>)?.hasStockOut),
    };
    globalCache.set(rid, { data: source, ts: now });
    const rule = options?.rule ?? 'status';
    const frozen = rule === 'statusOrStock' ? isOrderFrozenByStatusOrStock(source) : isOrderFrozenByStatus(source);
    return { frozen, source };
  } catch {
    return { frozen: false };
  }
};

export const ensureProductionOrderUnlocked = async (
  id: string,
  options?: { rule?: ProductionOrderFrozenRule; message?: string }
): Promise<void> => {
  const rid = String(id || '').trim();
  if (!rid) throw new Error('缺少订单ID');

  const { frozen, source } = await primeProductionOrderFrozenCache(rid, { rule: options?.rule });
  if (!frozen) return;

  const rule = options?.rule ?? 'status';
  const msg =
    options?.message ||
    (rule === 'statusOrStock' ? '订单已完结或已出库，无法操作' : '订单已完结，无法操作');

  throw Object.assign(new Error(msg), { frozen: true, source });
};

export type UseProductionOrderFrozenCacheOptions = {
  id?: string | null;
  ids?: unknown[];
  rule?: ProductionOrderFrozenRule;
  ttlMs?: number;
  enabled?: boolean;
  acceptAnyData?: boolean;
};

/**
 * Hook 支持两种调用方式：
 * 1. 新方式：useProductionOrderFrozenCache({ id, rule, ... })
 * 2. 旧方式（兼容）：useProductionOrderFrozenCache(ids[], { rule, ... })
 */
export const useProductionOrderFrozenCache = (
  idsOrOptions?: unknown[] | UseProductionOrderFrozenCacheOptions,
  legacyOptions?: Partial<UseProductionOrderFrozenCacheOptions>
) => {
  // 兼容两种调用方式
  const options: UseProductionOrderFrozenCacheOptions = Array.isArray(idsOrOptions)
    ? { ...legacyOptions, ids: idsOrOptions }
    : (idsOrOptions || {});

  const { id, ids, rule = 'status', ttlMs = CACHE_TTL_MS, enabled = true } = options;

  // 合并单个 id 和 ids 数组
  const allIds = useMemo(() => {
    const set = new Set<string>();
    if (id) set.add(String(id).trim());
    if (ids) {
      ids.forEach((i) => {
        const s = String(i ?? '').trim();
        if (s) set.add(s);
      });
    }
    return Array.from(set);
  }, [id, ids]);

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const [isFrozenById, setIsFrozenById] = useState<Record<string, boolean>>({});

  const ensureCache = useMemo(() => cacheRef.current, []);

  const isFrozen = useMemo(() => {
    if (!id) return false;
    const entry = ensureCache.get(id);
    if (!entry) return false;
    const source = entry.data as OrderFrozenSource | undefined;
    return rule === 'statusOrStock' ? isOrderFrozenByStatusOrStock(source) : isOrderFrozenByStatus(source);
  }, [id, ensureCache, rule]);

  useEffect(() => {
    if (!enabled || allIds.length === 0) return;

    const run = async () => {
      for (const currentId of allIds) {
        try {
          const { frozen } = await primeProductionOrderFrozenCache(currentId, { ttlMs, rule });
          setIsFrozenById((prev) => ({ ...prev, [currentId]: frozen }));
        } catch {
          // Ignore
        }
      }
    };

    run();
  }, [allIds.join(','), rule, ttlMs, enabled]);

  // 包装 ensureUnlocked，支持回调函数作为错误处理
  const ensureUnlocked = useCallback(async (
    orderId: string,
    onFrozenOrOptions?: (() => void) | { rule?: ProductionOrderFrozenRule; message?: string }
  ): Promise<boolean> => {
    try {
      const opts = typeof onFrozenOrOptions === 'function' ? { rule } : onFrozenOrOptions;
      await ensureProductionOrderUnlocked(orderId, opts);
      return true;
    } catch (err: unknown) {
      if ((err as { frozen?: boolean })?.frozen) {
        if (typeof onFrozenOrOptions === 'function') {
          onFrozenOrOptions();
        }
        return false;
      }
      throw err;
    }
  }, [rule]);

  return { cacheRef, isFrozenById, isFrozen, ensureUnlocked };
};
