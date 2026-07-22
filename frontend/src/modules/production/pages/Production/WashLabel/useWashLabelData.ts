import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { productionOrderApi } from '@/services/production/productionApi';
import api, { type ApiResult } from '@/utils/api';
import type { ProductionOrder } from '@/types/production';
import { useDebouncedValue } from '@/hooks/usePerformance';
import { genUCode, type StyleLabelCache } from './utils';

export function useWashLabelData() {
  const { message } = App.useApp();

  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const [searchOrderNo, setSearchOrderNo] = useState('');
  const [searchStyleNo, setSearchStyleNo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedOrderNo = useDebouncedValue(searchOrderNo, 300);
  const debouncedStyleNo = useDebouncedValue(searchStyleNo, 300);

  const styleCache = useRef<StyleLabelCache>({});
  const [, setCacheVer] = useState(0);

  const [uCodeOverrides, setUCodeOverrides] = useState<Record<string, string>>({});

  const fetchStyleInfoForOrders = useCallback(async (list: ProductionOrder[]) => {
    const uncached = [...new Set(list.map(o => o.styleId).filter(Boolean))]
      .filter(id => !(id in styleCache.current));
    if (!uncached.length) return;

    await Promise.allSettled(
      uncached.map(async (styleId) => {
        try {
          const res = await api.get<ApiResult<Record<string, any>>>(`/style/info/${styleId}`);
          const d = res?.data ?? res ?? {};
          styleCache.current[styleId] = {
            fabricComposition: d.fabricComposition,
            fabricCompositionParts: d.fabricCompositionParts,
            washInstructions: d.washInstructions,
            uCode: d.uCode,
            washTempCode: d.washTempCode,
            bleachCode: d.bleachCode,
            tumbleDryCode: d.tumbleDryCode,
            ironCode: d.ironCode,
            dryCleanCode: d.dryCleanCode,
          };
        } catch { /* silently ignore: 款式可能未填写 */ }
      })
    );
    setCacheVer(v => v + 1);
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await productionOrderApi.list({
        page,
        pageSize,
        orderNo: debouncedOrderNo.trim() || undefined,
        styleNo: debouncedStyleNo.trim() || undefined,
        status: statusFilter || undefined,
      } as any);
      const raw = res as ApiResult<any>;
      const records = raw?.data?.records ?? (raw as any)?.records ?? [];
      const tot = raw?.data?.total ?? (raw as any)?.total ?? records.length;
      setOrders(records as ProductionOrder[]);
      setTotal(tot);
      void fetchStyleInfoForOrders(records as ProductionOrder[]);
    } catch {
      message.error('加载订单失败');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedOrderNo, debouncedStyleNo, statusFilter, fetchStyleInfoForOrders, message]);

  useEffect(() => { void fetchOrders(); }, [fetchOrders]);

  const getUCode = useCallback((order: ProductionOrder): string => {
    if (order.id && uCodeOverrides[order.id]) return uCodeOverrides[order.id];
    const cached = styleCache.current[order.styleId];
    if (cached?.uCode) return cached.uCode;
    return genUCode(order);
  }, [uCodeOverrides]);

  const refresh = useCallback(() => {
    setPage(1);
    void fetchOrders();
  }, [fetchOrders]);

  return {
    orders,
    setOrders,
    loading,
    total,
    page,
    setPage,
    pageSize,
    searchOrderNo,
    setSearchOrderNo,
    searchStyleNo,
    setSearchStyleNo,
    statusFilter,
    setStatusFilter,
    styleCache,
    uCodeOverrides,
    setUCodeOverrides,
    fetchStyleInfoForOrders,
    fetchOrders,
    getUCode,
    refresh,
  };
}
