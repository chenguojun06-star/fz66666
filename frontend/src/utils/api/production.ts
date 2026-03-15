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
  const detailsRaw = (order as any)?.orderDetails;

  const normalizeLine = (r: unknown): ProductionOrderLine => {
    const row = r && typeof r === 'object' ? (r as any) : {};
    const color = String(row?.color ?? row?.colour ?? row?.colorName ?? row?.['颜色'] ?? '').trim();
    const size = String(row?.size ?? row?.sizeName ?? row?.spec ?? row?.尺码 ?? row?.['尺码'] ?? '').trim();
    const quantity = toNumberSafe(row?.quantity ?? row?.qty ?? row?.count ?? row?.num ?? row?.数量 ?? row?.['数量']);
    const lineSku = String(row?.skuNo ?? row?.skuKey ?? row?.sku ?? row?.sku_code ?? row?.skuCode ?? '').trim();
    const orderNo = String((order as any)?.orderNo ?? row?.orderNo ?? '').trim();
    const styleNo = String((order as any)?.styleNo ?? row?.styleNo ?? '').trim();
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
  const fallbackQty = toNumberSafe(
    (order as any)?.orderQuantity
    ?? (order as any)?.quantity
  );
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

type OrderFrozenSource = { status?: string; hasStockOut?: boolean };

type DirectCuttingSource = {
  orderNo?: string;
  orderBizType?: string;
  progressWorkflowJson?: unknown;
  progressNodeUnitPrices?: unknown;
};

const PROCUREMENT_STAGE_REGEX = /采购|物料|备料|辅料|面料/i;

const extractWorkflowNodes = (source?: DirectCuttingSource | null): Array<Record<string, unknown>> => {
  if (!source) return [];

  // ⚠️ 注意：不能用 progressNodeUnitPrices 来判断是否存在采购阶段。
  // progressNodeUnitPrices 存储的是工序工资单价（裁剪/车缝/尾部等），
  // 普通订单里绝不会包含"采购"关键词，会导致所有已设置单价的订单被误判为"无采购"。
  // 采购阶段检测只能依赖 progressWorkflowJson（工作流节点配置）。
  const rawWorkflow = (source as any)?.progressWorkflowJson;
  if (!rawWorkflow) return [];

  let parsed: unknown = rawWorkflow;
  if (typeof rawWorkflow === 'string') {
    const text = rawWorkflow.trim();
    if (!text) return [];
    try {
      parsed = JSON.parse(text);
    } catch {
      return [];
    }
  }

  if (parsed && typeof parsed === 'object') {
    const nodes = (parsed as any)?.nodes ?? (parsed as any)?.stages ?? (parsed as any)?.progressNodes;
    if (Array.isArray(nodes)) {
      return nodes.filter((node) => node && typeof node === 'object') as Array<Record<string, unknown>>;
    }
  }

  return [];
};

export const hasProcurementStage = (source?: DirectCuttingSource | null): boolean => {
  if (!source) return true;

  const nodes = extractWorkflowNodes(source);
  if (nodes.length > 0) {
    return nodes.some((node) => {
      const name = String(node?.name ?? node?.processName ?? node?.progressStage ?? '').trim();
      return PROCUREMENT_STAGE_REGEX.test(name);
    });
  }

  const bizType = String((source as any)?.orderBizType || '').trim().toUpperCase();
  if (bizType === 'CUTTING_DIRECT') return false;

  const orderNo = String((source as any)?.orderNo || '').trim().toUpperCase();
  if (orderNo.startsWith('CUT')) return false;

  return true;
};

export const isDirectCuttingOrder = (source?: DirectCuttingSource | null): boolean => {
  if (!source) return false;
  return !hasProcurementStage(source);
};

const TERMINAL_ORDER_STATUSES = new Set(['completed', 'closed', 'cancelled', 'scrapped', 'archived']);

export const isOrderTerminalByStatus = (source?: OrderFrozenSource | null): boolean => {
  if (!source) return false;
  const status = String(source.status || '').trim().toLowerCase();
  return TERMINAL_ORDER_STATUSES.has(status);
};

export const isOrderTerminal = (source?: (OrderFrozenSource & { actualEndDate?: unknown }) | null): boolean => {
  if (!source) return false;
  if (isOrderTerminalByStatus(source)) return true;
  return Boolean((source as any)?.actualEndDate);
};

export const isOrderFrozenByStatus = (source?: OrderFrozenSource | null): boolean => {
  return isOrderTerminalByStatus(source);
};

export const isOrderFrozenByStatusOrStock = (source?: OrderFrozenSource | null): boolean => {
  if (isOrderFrozenByStatus(source)) return true;
  return Boolean(source?.hasStockOut);
};

const extractListRecords = (data: any): unknown[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') {
    const payload = data as any;
    const candidate = payload.records ?? payload.list ?? payload.items ?? payload.rows ?? payload.data;
    if (Array.isArray(candidate)) return candidate;
    // 如果是单个对象（有id和orderNo），可能是单条记录
    if (payload.id && payload.orderNo) {
      return [payload];
    }
  }
  return [];
};

export const fetchProductionOrderDetail = async (
  idOrOrderNo?: string | null,
  _options?: { acceptAnyData?: boolean }
): Promise<unknown> => {
  const key = String(idOrOrderNo || '').trim();
  if (!key) throw new Error('缺少订单ID或订单号');

  // 只有明确像 UUID/ASSIGN_UUID 主键时才按 id 查询，其他如 PO/CUT 等都按订单号查
  const isUuidLike = /^[0-9a-f]{32}$/i.test(key) || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key);
  const isOrderNo = !isUuidLike;
  const params = isOrderNo ? { orderNo: key } : { id: key };

  // 统一使用 /list 端点查询单个订单
  try {
    const resp = await api.get('/production/order/list', { params });
    if (resp && (resp as any).code === 200 && (resp as any).data) {
      const records = extractListRecords((resp as any).data);

      // 🔧 FIX: 从列表中找到匹配的订单（后端可能返回多条记录）
      const matched = records.find((r: any) => {
        const recordOrderNo = String(r.orderNo || '').trim();
        const recordId = String(r.id || '').trim();
        return recordOrderNo === key || recordId === key;
      });

      if (matched) {
        return matched;
      }
    }
  } catch (err) {
    console.error('[fetchProductionOrderDetail] 请求失败:', err);
  }

  throw new Error('未找到订单');
};

export type ProductionOrderFrozenRule = 'status' | 'statusOrStock';

type CacheEntry = {
  data: any;
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
      status: String((order as any)?.status || ''),
      hasStockOut: Boolean((order as any)?.hasStockOut),
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
    } catch (err: any) {
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

/**
 * 查询生产工序跟踪记录（用于工资结算）
 *
 * @param productionOrderId 生产订单ID
 * @returns 工序跟踪记录列表
 */
export const getProductionProcessTracking = async (productionOrderId: string): Promise<ApiResponse> => {
  return api.get(`/production/process-tracking/order/${productionOrderId}`);
};

/**
 * 管理员重置扫码记录（允许重新扫码）
 *
 * @param trackingId 跟踪记录ID
 * @param resetReason 重置原因
 * @returns 重置结果
 */
export const resetProcessTrackingRecord = async (trackingId: number, resetReason?: string): Promise<ApiResponse> => {
  return api.post(`/production/process-tracking/${trackingId}/reset`, { resetReason });
};
