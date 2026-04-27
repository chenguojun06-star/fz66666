import React from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { App } from 'antd';
import { ProductionOrder, ProductionQueryParams } from '@/types/production';
import type { PaginatedResponse } from '@/types/api';
import api, { isApiSuccess, isOrderTerminal } from '@/utils/api';
import { useLocation } from 'react-router-dom';
import { useSync } from '@/utils/syncManager';
import { DEFAULT_PAGE_SIZE, readPageSize } from '@/utils/pageSizeStore';
import { usePersistentSort } from '@/hooks/usePersistentSort';
import type { Dayjs } from 'dayjs';
import type { SmartErrorInfo } from '@/smart/core/types';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import { useDeliveryRiskMap } from '../../ProgressDetail/hooks/useDeliveryRiskMap';
import { useStagnantDetection } from '../../ProgressDetail/hooks/useStagnantDetection';
import { useProductionSmartQueue } from '../../useProductionSmartQueue';
import { ensureBoardStatsForOrder, clearBoardStatsTimestamps } from '../../ProgressDetail/hooks/useBoardStats';
import { getDynamicParentMapping, setDynamicParentMapping } from '../../ProgressDetail/utils';
import { processParentMappingApi } from '@/services/production/productionApi';
import { useCardProgress } from '../hooks/useCardProgress';
import type { ProgressNode } from '../../ProgressDetail/types';

const LIST_VIEW_MODE_STORAGE_KEY = 'production_list_view_mode';

const DEFAULT_HOVER_NODES: ProgressNode[] = [
  { id: '采购', name: '采购' },
  { id: '裁剪', name: '裁剪' },
  { id: '车缝', name: '车缝' },
  { id: '质检', name: '质检' },
  { id: '入库', name: '入库' },
];

export function useProductionListData() {
  const { message } = App.useApp();
  const location = useLocation();

  const [queryParams, setQueryParams] = useState<ProductionQueryParams>(() => {
    const initSearch = new URLSearchParams(window.location.search);
    const initOrderNo = initSearch.get('orderNo') || '';
    return {
      page: 1, pageSize: readPageSize(DEFAULT_PAGE_SIZE), includeScrapped: true, excludeTerminal: false,
      ...(initOrderNo ? { keyword: initOrderNo } : {}),
    };
  });
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const { sortField, sortOrder, handleSort } = usePersistentSort<string, 'asc' | 'desc'>({
    storageKey: 'production-list', defaultField: 'createTime', defaultOrder: 'desc',
  });

  const [productionList, setProductionList] = useState<ProductionOrder[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [_selectedRows, setSelectedRows] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewModeState] = useState<'list' | 'card' | 'smart'>(
    () => (localStorage.getItem(LIST_VIEW_MODE_STORAGE_KEY) as 'list' | 'card' | 'smart') || 'list'
  );
  const setViewMode = (mode: 'list' | 'card' | 'smart') => {
    localStorage.setItem(LIST_VIEW_MODE_STORAGE_KEY, mode);
    setViewModeState(mode);
    setQueryParams(prev => ({ ...prev, page: 1 }));
  };
  const [showDelayedOnly, setShowDelayedOnly] = useState(false);
  const [activeStatFilter, setActiveStatFilter] = useState<'production' | 'delayed' | 'today'>('production');
  const [smartQueueFilter, setSmartQueueFilter] = useState<'all' | 'urgent' | 'behind' | 'stagnant' | 'overdue'>('all');
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const orderFocusRef = useRef<{ triggerOrderFocus: (...args: any[]) => void; clearSmartFocus: () => void } | null>(null);
  const {
    clearAllBoardCache, boardStatsByOrder: _boardStatsByOrder, boardTimesByOrder,
    boardStatsLoadingByOrder: _boardStatsLoadingByOrder, mergeBoardStatsForOrder,
    mergeBoardTimesForOrder, setBoardLoadingForOrder, mergeProcessDataForOrder,
    boardStatsByOrderRef, boardStatsLoadingByOrderRef, calcCardProgress,
  } = useCardProgress();

  const hasActiveOrders = useMemo(() => productionList.some(o => o.status !== 'completed'), [productionList]);
  const deliveryRiskMap = useDeliveryRiskMap(hasActiveOrders);
  const stagnantOrderIds = useStagnantDetection(productionList, boardTimesByOrder);

  const { smartActionItems, smartQueueOrders } = useProductionSmartQueue({
    orders: productionList, deliveryRiskMap, stagnantOrderIds, smartQueueFilter, setSmartQueueFilter,
    triggerOrderFocus: (...args: any[]) => orderFocusRef.current?.triggerOrderFocus(...args),
    clearFocus: () => orderFocusRef.current?.clearSmartFocus(),
  });

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code, actionText: '刷新重试' });
  };

  const fetchProductionList = async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<ProductionOrder>>('/production/order/list', { params: queryParams });
      if (isApiSuccess(response)) {
        setProductionList(response.data.records || []);
        setTotal(response.data.total || 0);
        clearAllBoardCache();
        clearBoardStatsTimestamps();
        if (showSmartErrorNotice) setSmartError(null);
      } else {
        const errMessage = typeof response === 'object' && response !== null && 'message' in response
          ? String((response as any).message) || '获取生产订单列表失败'
          : '获取生产订单列表失败';
        reportSmartError('生产订单加载失败', errMessage, 'PROD_LIST_LOAD_FAILED');
        message.error(errMessage);
      }
    } catch (error) {
      reportSmartError('生产订单加载失败', '网络异常或服务不可用，请稍后重试', 'PROD_LIST_LOAD_EXCEPTION');
      message.error('获取生产订单列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!getDynamicParentMapping()) {
      processParentMappingApi.list().then((res: any) => {
        const data = res?.data?.data ?? res?.data ?? {};
        if (data && typeof data === 'object') setDynamicParentMapping(data);
      }).catch((err) => { console.warn('[ProcessParentMapping] 加载动态映射失败:', err); });
    }
  }, []);

  useEffect(() => { setSelectedRowKeys([]); setSelectedRows([]); fetchProductionList(); }, [queryParams]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchProductionList(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!productionList.length) return;
    const queue = productionList.slice(0, Math.min(20, productionList.length));
    let cancelled = false;
    const run = async () => {
      for (const o of queue) {
        if (cancelled) return;
        await ensureBoardStatsForOrder({
          order: o, nodes: DEFAULT_HOVER_NODES,
          boardStatsByOrder: boardStatsByOrderRef.current,
          boardStatsLoadingByOrder: boardStatsLoadingByOrderRef.current,
          mergeBoardStatsForOrder, mergeBoardTimesForOrder, setBoardLoadingForOrder, mergeProcessDataForOrder,
        });
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [productionList, mergeBoardStatsForOrder, mergeBoardTimesForOrder, setBoardLoadingForOrder, mergeProcessDataForOrder]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const styleNo = (params.get('styleNo') || '').trim();
    const orderNo = (params.get('orderNo') || '').trim();
    if (styleNo || orderNo) {
      setQueryParams((prev) => {
        const newKeyword = orderNo || (prev.keyword || '');
        const newStyleNo = styleNo || (prev.styleNo || '');
        if (newKeyword === (prev.keyword || '') && newStyleNo === (prev.styleNo || '')) return prev;
        return { ...prev, page: 1, styleNo: newStyleNo || undefined, keyword: newKeyword };
      });
    }
    const filterParam = (params.get('filter') || '').trim();
    if (['overdue', 'urgent', 'behind', 'stagnant'].includes(filterParam)) {
      setSmartQueueFilter(filterParam as 'overdue' | 'urgent' | 'behind' | 'stagnant');
    }
    const factoryNameParam = (params.get('factoryName') || '').trim();
    if (factoryNameParam) {
      setQueryParams((prev) => {
        if ((prev.factoryName || '') === factoryNameParam) return prev;
        return { ...prev, factoryName: factoryNameParam, page: 1 };
      });
    }
  }, [location.search]);

  useSync(
    'production-orders',
    async () => {
      try {
        const response = await api.get<PaginatedResponse<ProductionOrder>>('/production/order/list', { params: queryParams });
        if (isApiSuccess(response)) return response.data.records || [];
        return [];
      } catch { return []; }
    },
    (newData, oldData) => { if (oldData !== null) setProductionList(newData); },
    { interval: 30000, enabled: !loading, pauseOnHidden: true, onError: (error) => { console.error('[实时同步] 错误', error); } }
  );

  const wsRefreshRef = useRef(0);
  useEffect(() => {
    const handleProgressChanged = () => { wsRefreshRef.current += 1; fetchProductionList(); };
    window.addEventListener('order:progress:changed', handleProgressChanged);
    return () => window.removeEventListener('order:progress:changed', handleProgressChanged);
  }, [fetchProductionList]);

  const sortedProductionList = useMemo(() => {
    const filtered = [...smartQueueOrders];
    filtered.sort((a: any, b: any) => {
      const aClose = isOrderTerminal(a) ? 1 : 0;
      const bClose = isOrderTerminal(b) ? 1 : 0;
      if (aClose !== bClose) return aClose - bClose;
      if (sortField === 'createTime') {
        const aTime = a[sortField] ? new Date(a[sortField]).getTime() : 0;
        const bTime = b[sortField] ? new Date(b[sortField]).getTime() : 0;
        return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
      }
      return 0;
    });
    return filtered;
  }, [smartQueueOrders, sortField, sortOrder, showDelayedOnly, activeStatFilter]);

  const urlFocusApplied = useRef(false);

  return {
    queryParams, setQueryParams, dateRange, setDateRange,
    sortField, sortOrder, handleSort,
    productionList, setProductionList, selectedRowKeys, setSelectedRowKeys,
    _selectedRows, setSelectedRows, loading, total,
    viewMode, setViewMode,
    showDelayedOnly, setShowDelayedOnly, activeStatFilter, setActiveStatFilter,
    smartQueueFilter, setSmartQueueFilter,
    smartError, showSmartErrorNotice, reportSmartError,
    orderFocusRef, calcCardProgress,
    deliveryRiskMap, stagnantOrderIds, smartActionItems, smartQueueOrders,
    fetchProductionList, sortedProductionList, urlFocusApplied,
    wsRefreshRef,
  };
}
