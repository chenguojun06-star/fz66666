/**
 * useProgressData - 进度数据管理Hook
 * 功能：获取订单列表、扫码记录、裁剪扎号
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { ProductionOrder, ProductionQueryParams, ScanRecord, CuttingBundle } from '@/types/production';
import { productionOrderApi, productionScanApi, productionCuttingApi } from '@/services/production/productionApi';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { ProgressNode } from '../types';
import dayjs from 'dayjs';

export const useProgressData = () => {
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [activeOrder, setActiveOrder] = useState<ProductionOrder | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>([]);
  const [cuttingBundles, setCuttingBundles] = useState<CuttingBundle[]>([]);
  const [cuttingBundlesLoading, setCuttingBundlesLoading] = useState(false);

  const [queryParams, setQueryParams] = useState<ProductionQueryParams>({ page: 1, pageSize: 10 });
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  const [progressNodesByStyleNo, setProgressNodesByStyleNo] = useState<Record<string, ProgressNode[]>>({});
  const progressNodesByStyleNoRef = useRef<Record<string, ProgressNode[]>>({});

  const queryParamsRef = useRef(queryParams);
  const dateRangeRef = useRef(dateRange);

  useEffect(() => {
    queryParamsRef.current = queryParams;
  }, [queryParams]);

  useEffect(() => {
    dateRangeRef.current = dateRange;
  }, [dateRange]);

  // 获取订单列表
  const fetchOrders = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) {
      setLoading(true);
    }
    try {
      const params: any = { ...queryParamsRef.current };
      const currentDateRange = dateRangeRef.current;
      if (currentDateRange?.[0] && currentDateRange?.[1]) {
        params.startDate = currentDateRange[0].startOf('day').toISOString();
        params.endDate = currentDateRange[1].endOf('day').toISOString();
      }
      const response = await productionOrderApi.list(params);
      const result = response as any;
      if (result.code === 200) {
        const records = (result.data?.records || []) as ProductionOrder[];
        setOrders(records);
        setTotal((result.data?.total as number) || 0);

        // 加载工序节点数据
        const styleNos = Array.from(
          new Set(
            records
              .map((r) => String(r?.styleNo || '').trim())
              .filter((sn) => sn)
              .filter((sn) => !progressNodesByStyleNoRef.current[sn])
          )
        );

        if (styleNos.length) {
          const settled = await Promise.allSettled(
            styleNos.map(async (sn) => {
              const res = await templateLibraryApi.progressNodeUnitPrices(sn);
              const r = res as any;
              if (r.code === 200 && Array.isArray(r.data)) {
                return { styleNo: sn, nodes: r.data };
              }
              return null;
            })
          );

          const newNodes: Record<string, ProgressNode[]> = {};
          for (const s of settled) {
            if (s.status === 'fulfilled' && s.value) {
              newNodes[s.value.styleNo] = s.value.nodes;
            }
          }

          if (Object.keys(newNodes).length) {
            setProgressNodesByStyleNo((prev) => ({ ...prev, ...newNodes }));
            progressNodesByStyleNoRef.current = { ...progressNodesByStyleNoRef.current, ...newNodes };
          }
        }
      }
    } catch (error) {
      console.error('获取订单列表失败:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  // 获取扫码记录
  const fetchScanHistory = useCallback(async (orderId: string) => {
    try {
      const res = await productionScanApi.listByOrderId(orderId, { page: 1, pageSize: 999 });
      const result = res as any;
      if (result.code === 200 && Array.isArray(result.data?.records)) {
        setScanHistory(result.data.records as ScanRecord[]);
      }
    } catch (error) {
      console.error('获取扫码记录失败:', error);
    }
  }, []);

  // 获取裁剪扎号
  const fetchCuttingBundles = useCallback(async (orderId: string) => {
    setCuttingBundlesLoading(true);
    try {
      const res = await productionCuttingApi.listBundles(orderId);
      const result = res as any;
      if (result.code === 200 && Array.isArray(result.data?.records)) {
        setCuttingBundles(result.data.records as CuttingBundle[]);
      }
    } catch (error) {
      console.error('获取裁剪扎号失败:', error);
    } finally {
      setCuttingBundlesLoading(false);
    }
  }, []);

  // 打开订单详情
  const openOrderDetail = useCallback(async (order: ProductionOrder) => {
    setActiveOrder(order);
    await fetchScanHistory(order.id);
    await fetchCuttingBundles(order.id);
  }, [fetchScanHistory, fetchCuttingBundles]);

  // 分页处理
  const handlePageChange = useCallback((page: number, pageSize: number) => {
    setQueryParams((prev) => ({ ...prev, page, pageSize }));
  }, []);

  return {
    // 状态
    loading,
    total,
    orders,
    activeOrder,
    scanHistory,
    cuttingBundles,
    cuttingBundlesLoading,
    queryParams,
    dateRange,
    progressNodesByStyleNo,

    // 方法
    setQueryParams,
    setDateRange,
    fetchOrders,
    openOrderDetail,
    setActiveOrder,
    handlePageChange,
  };
};
