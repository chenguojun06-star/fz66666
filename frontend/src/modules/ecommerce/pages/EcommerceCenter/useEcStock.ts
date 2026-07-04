import { useState, useCallback, useMemo } from 'react';
import api, { type ApiResult } from '@/utils/api';

export interface UniversalStock {
  id: number;
  tenantId: number;
  styleId: number;
  skuId: number;
  skuCode: string | null;
  warehouse: string | null;
  totalWarehoused: number;
  totalOutstock: number;
  pendingOrders: number;
  availableStock: number;
  safeStock: number;
  bufferStock: number;
  onWayProduction: number;
  lastSyncTime: string;
}

export interface StockAlert {
  id: number;
  styleId: number;
  skuId: number;
  skuCode: string | null;
  warehouse: string | null;
  alertType: string;
  currentStock: number;
  safeStock: number;
  message: string;
  isResolved: boolean;
  createTime: string;
}

export interface PurchaseSuggestion {
  id: number;
  styleId: number;
  skuId: number;
  skuCode: string | null;
  styleNo: string | null;
  suggestQuantity: number;
  urgencyLevel: string;
  reason: string;
  sales30d: number;
  availableStock: number;
  onWayStock: number;
  onWayProduction: number;
  status: number;
  /** 建议类型：PURCHASE=采购 / PRODUCTION=生产（AI 补货顾问） */
  suggestionType?: string;
  /** 关联生产订单ID（转生产后回填） */
  productionOrderId?: number | null;
  /** AI 置信度 0-100 */
  aiConfidence?: number | null;
  /** AI 推理过程 */
  aiReason?: string | null;
  createTime: string;
}

export interface WarehouseAllocation {
  id: number;
  orderId: number;
  orderNo: string;
  skuCode: string;
  warehouse: string;
  allocatedQuantity: number;
  allocationType: string;
  createTime: string;
}

export interface OrderSplit {
  id: number;
  originalOrderId: number;
  originalOrderNo: string;
  splitOrderNo: string;
  skuCode: string;
  warehouse: string;
  splitQuantity: number;
  splitReason: string;
  status: number;
  createTime: string;
}

export function useEcStock() {
  const [stockList, setStockList] = useState<UniversalStock[]>([]);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [suggestions, setSuggestions] = useState<PurchaseSuggestion[]>([]);
  const [allocations, setAllocations] = useState<WarehouseAllocation[]>([]);
  const [splits, setSplits] = useState<OrderSplit[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStock = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResult<UniversalStock[]>>('/ec/stock/list');
      setStockList(res?.data ?? []);
    } finally { setLoading(false); }
  }, []);

  const fetchLowStock = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResult<UniversalStock[]>>('/ec/stock/low-stock');
      setStockList(res?.data ?? []);
    } finally { setLoading(false); }
  }, []);

  const fetchAlerts = useCallback(async (unresolvedOnly = true) => {
    try {
      const res = await api.get<ApiResult<StockAlert[]>>(`/ec/stock/alerts?unresolvedOnly=${unresolvedOnly}`);
      setAlerts(res?.data ?? []);
    } catch { /* handled */ }
  }, []);

  const fetchSuggestions = useCallback(async (pendingOnly = true) => {
    try {
      const res = await api.get<ApiResult<PurchaseSuggestion[]>>(`/ec/stock/suggestions?pendingOnly=${pendingOnly}`);
      setSuggestions(res?.data ?? []);
    } catch { /* handled */ }
  }, []);

  const fetchAllocations = useCallback(async () => {
    try {
      const res = await api.get<ApiResult<WarehouseAllocation[]>>('/ec/stock/allocations');
      setAllocations(res?.data ?? []);
    } catch { /* handled */ }
  }, []);

  const fetchSplits = useCallback(async () => {
    try {
      const res = await api.get<ApiResult<OrderSplit[]>>('/ec/stock/splits');
      setSplits(res?.data ?? []);
    } catch { /* handled */ }
  }, []);

  const syncAll = useCallback(async () => {
    await api.post('/ec/stock/sync');
    await fetchStock();
  }, [fetchStock]);

  const generateSuggestions = useCallback(async () => {
    await api.post('/ec/stock/suggestions/generate');
    await fetchSuggestions();
  }, [fetchSuggestions]);

  /** AI 补货顾问扫描：扫描预警生成 AI 建议 */
  const aiScanSuggestions = useCallback(async () => {
    const res = await api.post<ApiResult<{ created: number }>>('/ec/stock/suggestions/ai-scan');
    await fetchSuggestions();
    return res?.data?.created ?? 0;
  }, [fetchSuggestions]);

  const approveSuggestion = useCallback(async (id: number) => {
    const res = await api.post<ApiResult<{ message?: string; productionOrderId?: string; suggestionType?: string }>>(`/ec/stock/suggestions/${id}/approve`);
    await fetchSuggestions();
    return res?.data;
  }, [fetchSuggestions]);

  const rejectSuggestion = useCallback(async (id: number) => {
    await api.post(`/ec/stock/suggestions/${id}/reject`);
    await fetchSuggestions();
  }, [fetchSuggestions]);

  const resolveAlert = useCallback(async (id: number) => {
    await api.post(`/ec/stock/alerts/${id}/resolve`);
    await fetchAlerts();
  }, [fetchAlerts]);

  const updateSafeStock = useCallback(async (skuId: number, safeStock: number) => {
    await api.put('/ec/stock/safe-stock', { skuId, safeStock });
    await fetchStock();
  }, [fetchStock]);

  return useMemo(() => ({
    stockList, alerts, suggestions, allocations, splits, loading,
    fetchStock, fetchLowStock, fetchAlerts, fetchSuggestions,
    fetchAllocations, fetchSplits, syncAll, generateSuggestions, aiScanSuggestions,
    approveSuggestion, rejectSuggestion, resolveAlert, updateSafeStock,
  }), [stockList, alerts, suggestions, allocations, splits, loading,
    fetchStock, fetchLowStock, fetchAlerts, fetchSuggestions,
    fetchAllocations, fetchSplits, syncAll, generateSuggestions, aiScanSuggestions,
    approveSuggestion, rejectSuggestion, resolveAlert, updateSafeStock]);
}
