import { useState, useCallback } from 'react';
import api, { type ApiResult } from '@/utils/api';
import type {
  UniversalStock,
  StockAlert,
  PurchaseSuggestion,
  WarehouseAllocation,
  OrderSplit,
} from './types';
import { extractApiData } from './utils';

export function useStockBase() {
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
      setStockList(extractApiData(res, []));
    } finally { setLoading(false); }
  }, []);

  const fetchLowStock = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResult<UniversalStock[]>>('/ec/stock/low-stock');
      setStockList(extractApiData(res, []));
    } finally { setLoading(false); }
  }, []);

  const fetchAlerts = useCallback(async (unresolvedOnly = true) => {
    try {
      const res = await api.get<ApiResult<StockAlert[]>>(`/ec/stock/alerts?unresolvedOnly=${unresolvedOnly}`);
      setAlerts(extractApiData(res, []));
    } catch { /* handled */ }
  }, []);

  const fetchSuggestions = useCallback(async (pendingOnly = true) => {
    try {
      const res = await api.get<ApiResult<PurchaseSuggestion[]>>(`/ec/stock/suggestions?pendingOnly=${pendingOnly}`);
      setSuggestions(extractApiData(res, []));
    } catch { /* handled */ }
  }, []);

  const fetchAllocations = useCallback(async () => {
    try {
      const res = await api.get<ApiResult<WarehouseAllocation[]>>('/ec/stock/allocations');
      setAllocations(extractApiData(res, []));
    } catch { /* handled */ }
  }, []);

  const fetchSplits = useCallback(async () => {
    try {
      const res = await api.get<ApiResult<OrderSplit[]>>('/ec/stock/splits');
      setSplits(extractApiData(res, []));
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

  return {
    stockList, alerts, suggestions, allocations, splits, loading,
    fetchStock, fetchLowStock, fetchAlerts, fetchSuggestions,
    fetchAllocations, fetchSplits, syncAll, generateSuggestions, aiScanSuggestions,
    approveSuggestion, rejectSuggestion, resolveAlert, updateSafeStock,
  };
}
