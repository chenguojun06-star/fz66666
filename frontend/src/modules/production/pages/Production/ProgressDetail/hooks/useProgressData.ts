import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import type { Dayjs } from 'dayjs';
import api, { isApiSuccess, isOrderTerminal } from '@/utils/api';
import type { ProductionOrder, ProductionQueryParams } from '@/types/production';
import { productionOrderApi, type ProductionOrderListParams } from '@/services/production/productionApi';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { stripWarehousingNode } from '../utils';
import type { ProgressNode } from '../types';
import { clearBoardStatsTimestamps } from './useBoardStats';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

interface UseProgressDataParams {
  queryParams: ProductionQueryParams;
  dateRange: [Dayjs | null, Dayjs | null] | null;
  dateSortAsc: boolean;
  focusedOrderNosRef: React.MutableRefObject<string[]>;
  clearAllBoardCache: () => void;
}

export function useProgressData({
  queryParams,
  dateRange,
  dateSortAsc,
  focusedOrderNosRef,
  clearAllBoardCache,
}: UseProgressDataParams) {
  const { message } = App.useApp();

  // ── 订单数据 ──────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const aClose = isOrderTerminal(a) ? 1 : 0;
      const bClose = isOrderTerminal(b) ? 1 : 0;
      if (aClose !== bClose) return aClose - bClose;
      const aTime = new Date(String(a.createTime || 0)).getTime();
      const bTime = new Date(String(b.createTime || 0)).getTime();
      return dateSortAsc ? aTime - bTime : bTime - aTime;
    });
  }, [orders, dateSortAsc]);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const [globalStats, setGlobalStats] = useState({
    activeOrders: 0, activeQuantity: 0,
    completedOrders: 0, completedQuantity: 0,
    scrappedOrders: 0, scrappedQuantity: 0,
    totalOrders: 0, totalQuantity: 0,
    delayedOrders: 0, delayedQuantity: 0,
    todayOrders: 0, todayQuantity: 0,
  });

  // ── 工序节点 ──────────────────────────────────────────────────
  const [progressNodesByStyleNo, setProgressNodesByStyleNo] = useState<Record<string, ProgressNode[]>>({});
  const progressNodesByStyleNoRef = useRef<Record<string, ProgressNode[]>>({});
  useEffect(() => { progressNodesByStyleNoRef.current = progressNodesByStyleNo; }, [progressNodesByStyleNo]);

  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({
      title,
      reason,
      code,
      actionText: '刷新重试',
    });
  };

  // ── Refs ──────────────────────────────────────────────────────
  const queryParamsRef = useRef(queryParams);
  const dateRangeRef = useRef(dateRange);
  useEffect(() => { queryParamsRef.current = queryParams; }, [queryParams]);
  useEffect(() => { dateRangeRef.current = dateRange; }, [dateRange]);

  // ── 数据获取 ──────────────────────────────────────────────────
  const fetchOrders = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) {
      setLoading(true);
    }
    try {
      const currentDateRange = dateRangeRef.current;
      const params: ProductionOrderListParams = {
        ...queryParamsRef.current,
        ...(currentDateRange?.[0] && currentDateRange?.[1] ? {
          startDate: currentDateRange[0].startOf('day').toISOString(),
          endDate: currentDateRange[1].endOf('day').toISOString(),
        } : {}),
      };
      const response = await productionOrderApi.list(params);
      const result = response as { code: number; message?: string; data: { records: ProductionOrder[]; total: number } };
      if (result.code === 200) {
        const rawRecords = result.data.records || [];
        const filteredRecords = (() => {
          if (focusedOrderNosRef.current.length === 0) return rawRecords;
          const orderNoSet = new Set(focusedOrderNosRef.current);
          const orderIndex = new Map(focusedOrderNosRef.current.map((orderNo, index) => [orderNo, index]));
          return rawRecords
            .filter((record) => orderNoSet.has(String(record.orderNo || '').trim()))
            .sort((a, b) => {
              const aIndex = orderIndex.get(String(a.orderNo || '').trim()) ?? Number.MAX_SAFE_INTEGER;
              const bIndex = orderIndex.get(String(b.orderNo || '').trim()) ?? Number.MAX_SAFE_INTEGER;
              return aIndex - bIndex;
            });
        })();
        setOrders(filteredRecords);
        setTotal(focusedOrderNosRef.current.length > 0 ? filteredRecords.length : (result.data.total || 0));
        if (showSmartErrorNotice) setSmartError(null);
        // 仅非静默刷新（用户手动、换页、换过滤条件）才清空进度球缓存
        // silent=true（轮询）保留旧缓存，避免进度球瞬间闪白再回来
        if (!silent) {
          clearAllBoardCache();
          clearBoardStatsTimestamps();
          // 同时清空工序节点缓存，确保模板改词汇后刷新能重新加载最新节点配置
          setProgressNodesByStyleNo({});
          progressNodesByStyleNoRef.current = {};
        }
        const styleNos = Array.from(
          new Set(
            filteredRecords
              .map((r) => String(r.styleNo || '').trim())
              .filter((sn) => sn)
          )
        );
        if (styleNos.length) {
          void (async () => {
            const settled = await Promise.allSettled(
              styleNos.map(async (sn) => {
                const res = await templateLibraryApi.progressNodeUnitPrices(sn);
                const r = res as Record<string, unknown>;
                const rows = Array.isArray(r?.data) ? r.data : [];
                const normalized: ProgressNode[] = rows
                  .map((n: any) => {
                    const name = String(n?.name || '').trim();
                    const id = String(n?.id || name || '').trim() || name;
                    const p = Number(n?.unitPrice);
                    const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
                    //  保留 progressStage（父分类字段），用于进度球弹窗过滤和boardStats匹配
                    const progressStage = String(n?.progressStage || '').trim() || undefined;
                    return { id, name, unitPrice, progressStage };
                  })
                  .filter((n: ProgressNode) => n.name);
                return { styleNo: sn, nodes: stripWarehousingNode(normalized) };
              })
            );
            const next: Record<string, ProgressNode[]> = {};
            for (const s of settled) {
              if (s.status !== 'fulfilled') continue;
              if (!s.value.nodes.length) continue;
              next[s.value.styleNo] = s.value.nodes;
            }
            if (Object.keys(next).length) {
              setProgressNodesByStyleNo((prev) => ({ ...prev, ...next }));
            }
          })();
        }
      } else if (!silent) {
        const errMessage = result.message || '获取生产订单失败';
        reportSmartError('生产进度加载失败', errMessage, 'PROGRESS_LIST_LOAD_FAILED');
        message.error(errMessage);
      }
    } catch (err: any) {
      if (!silent) {
        reportSmartError('生产进度加载失败', err?.message || '网络异常或服务不可用，请稍后重试', 'PROGRESS_LIST_LOAD_EXCEPTION');
        message.error(`获取生产订单失败: ${err?.message || '请检查网络连接'}`);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  // 获取全局统计数据（根据当前筛选条件）
  const fetchGlobalStats = useCallback(async (params?: typeof queryParams) => {
    try {
      // 只传递筛选参数，不传分页参数
      const filterParams = params ? {
        keyword: params.keyword,
        factoryName: params.factoryName,
        status: params.status,
        excludeTerminal: params.excludeTerminal,
        orderNo: params.orderNo,
        styleNo: params.styleNo,
      } : {};

      const response = await api.get<{
        activeOrders: number;
        activeQuantity: number;
        completedOrders: number;
        completedQuantity: number;
        scrappedOrders: number;
        scrappedQuantity: number;
        totalOrders: number;
        totalQuantity: number;
        delayedOrders: number;
        delayedQuantity: number;
        todayOrders: number;
        todayQuantity: number;
      }>('/production/order/stats', { params: filterParams });
      if (isApiSuccess(response)) {
        const data = (response.data || {}) as Record<string, unknown>;
        setGlobalStats({
          activeOrders: Number(data.activeOrders ?? data.totalOrders ?? 0),
          activeQuantity: Number(data.activeQuantity ?? data.totalQuantity ?? 0),
          completedOrders: Number(data.completedOrders ?? 0),
          completedQuantity: Number(data.completedQuantity ?? 0),
          scrappedOrders: Number(data.scrappedOrders ?? 0),
          scrappedQuantity: Number(data.scrappedQuantity ?? 0),
          totalOrders: Number(data.totalOrders ?? data.activeOrders ?? 0),
          totalQuantity: Number(data.totalQuantity ?? data.activeQuantity ?? 0),
          delayedOrders: Number(data.delayedOrders ?? 0),
          delayedQuantity: Number(data.delayedQuantity ?? 0),
          todayOrders: Number(data.todayOrders ?? 0),
          todayQuantity: Number(data.todayQuantity ?? 0),
        });
      }
    } catch (error) {
      console.error('获取全局统计数据失败', error);
    }
  }, []);

  // 筛选条件变化时更新统计数据
  useEffect(() => {
    fetchGlobalStats(queryParams);
  }, [fetchGlobalStats, queryParams]);

  // ── Effects ───────────────────────────────────────────────────
  // 使用 ref 标记是否已经初始化加载
  const initialLoadDone = useRef(false);

  // 仅在组件首次挂载时获取数据
  useEffect(() => {
    fetchOrders();
    initialLoadDone.current = true;
  }, []);

  // 每次重新切回该页面（浏览器 Tab 或 SPA 菜单）时静默刷新
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchOrders({ silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fetchOrders]);

  // 当查询参数改变时获取数据
  useEffect(() => {
    // 跳过初始加载
    if (!initialLoadDone.current) return;

    const timer = setTimeout(() => {
      fetchOrders();
    }, 300);
    return () => clearTimeout(timer);
  }, [
    queryParams.page,
    queryParams.pageSize,
    queryParams.keyword,
    queryParams.status,
    (queryParams as any).factoryType,
    (queryParams as any).factoryName,
    (queryParams as any).delayedOnly,
    (queryParams as any).todayOnly,
    // 使用稳定的值，null 转换为固定字符串
    dateRange?.[0]?.valueOf() ?? 'null-start',
    dateRange?.[1]?.valueOf() ?? 'null-end'
  ]);

  return {
    loading, total, orders, sortedOrders, setOrders,
    smartError, setSmartError,
    globalStats, setGlobalStats,
    progressNodesByStyleNo, setProgressNodesByStyleNo, progressNodesByStyleNoRef,
    showSmartErrorNotice,
    fetchOrders, fetchGlobalStats,
    reportSmartError,
  };
}
