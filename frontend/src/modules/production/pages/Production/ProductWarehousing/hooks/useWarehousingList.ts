import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { readPageSize } from '@/utils/pageSizeStore';
import api, { useProductionOrderFrozenCache } from '@/utils/api';
import { message } from '@/utils/antdStatic';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { ProductWarehousing as WarehousingType, WarehousingQueryParams } from '@/types/production';
import {
  WarehousingStats,
  defaultStats,
  StatusFilter,
  PendingBundleRow,
} from './warehousingConstants';

export interface UseWarehousingListResult {
  loading: boolean;
  warehousingList: WarehousingType[];
  setWarehousingList: React.Dispatch<React.SetStateAction<WarehousingType[]>>;
  total: number;
  setTotal: React.Dispatch<React.SetStateAction<number>>;
  smartError: SmartErrorInfo | null;
  queryParams: WarehousingQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<WarehousingQueryParams>>;
  showSmartErrorNotice: boolean;

  warehousingStats: WarehousingStats;
  fetchWarehousingStats: () => Promise<void>;

  statusFilter: StatusFilter;
  setStatusFilter: React.Dispatch<React.SetStateAction<StatusFilter>>;
  handleStatusFilterChange: (newFilter: StatusFilter) => void;
  showAllWarehousing: boolean;
  setShowAllWarehousing: React.Dispatch<React.SetStateAction<boolean>>;

  pendingBundles: PendingBundleRow[];
  pendingBundlesLoading: boolean;
  fetchPendingBundles: (status: string) => Promise<void>;

  navigateToInspect: (orderId: string, bundleId?: string) => void;

  fetchWarehousingList: () => Promise<void>;
  ensureOrderUnlockedById: (orderId: any) => Promise<boolean>;
  isOrderFrozenById: (orderId: any) => boolean;
}

export const useWarehousingList = (): UseWarehousingListResult => {
  const navigate = useNavigate();

  // State
  const [loading, setLoading] = useState(false);
  const [warehousingList, setWarehousingList] = useState<WarehousingType[]>([]);
  const [total, setTotal] = useState(0);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const [queryParams, setQueryParams] = useState<WarehousingQueryParams>({
    page: 1,
    pageSize: readPageSize(10),
  });
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = useCallback((title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({
      title,
      reason,
      code,
      actionText: '刷新重试',
    });
  }, [showSmartErrorNotice]);

  // 状态筛选
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showAllWarehousing, setShowAllWarehousing] = useState(false);
  const [pendingBundles, setPendingBundles] = useState<PendingBundleRow[]>([]);
  const [pendingBundlesLoading, setPendingBundlesLoading] = useState(false);

  // 统计卡片
  const [warehousingStats, setWarehousingStats] = useState<WarehousingStats>(defaultStats);

  // Derived State
  const frozenOrderIds = useMemo(() => {
    return Array.from(new Set(warehousingList.map((r: any) => String(r?.orderId || '').trim()).filter(Boolean)));
  }, [warehousingList]);

  const orderFrozen = useProductionOrderFrozenCache(frozenOrderIds, { rule: 'statusOrStock', acceptAnyData: true });

  // Actions
  const fetchWarehousingStats = useCallback(async () => {
    try {
      const res = await api.get<{ code: number; data: WarehousingStats }>('/production/warehousing/stats');
      if (res.code === 200 && res.data) {
        setWarehousingStats(res.data);
      } else {
        console.warn('[质检入库] stats 返回异常:', res);
      }
    } catch (err) {
      console.warn('[质检入库] stats 请求失败:', err);
    }
  }, []);

  // 获取待处理菲号列表
  const fetchPendingBundles = useCallback(async (status: string) => {
    setPendingBundlesLoading(true);
    try {
      const res = await api.get<{ code: number; data: PendingBundleRow[] }>('/production/warehousing/pending-bundles', {
        params: { status },
      });
      if (res.code === 200 && res.data) {
        setPendingBundles(res.data);
      } else {
        setPendingBundles([]);
      }
    } catch {
      setPendingBundles([]);
    } finally {
      setPendingBundlesLoading(false);
    }
  }, []);

  const fetchWarehousingList = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', { params: queryParams });
      if (response.code === 200) {
        setWarehousingList(response.data.records || []);
        setTotal(response.data.total || 0);
        if (showSmartErrorNotice) setSmartError(null);
      } else {
        const errMessage = (response as any).message || '获取质检入库列表失败';
        reportSmartError('质检入库列表加载失败', errMessage, 'WAREHOUSING_LIST_LOAD_FAILED');
        message.error(errMessage);
      }
    } catch (error) {
      reportSmartError('质检入库列表加载失败', '网络异常或服务不可用，请稍后重试', 'WAREHOUSING_LIST_LOAD_EXCEPTION');
      message.error('获取质检入库列表失败');
    } finally {
      setLoading(false);
    }
  }, [queryParams, showSmartErrorNotice, reportSmartError]);

  // 切换状态筛选
  const handleStatusFilterChange = useCallback((newFilter: StatusFilter) => {
    setStatusFilter(newFilter);
    setPendingBundles([]);
    if (newFilter === 'pendingQc' || newFilter === 'pendingPackaging' || newFilter === 'pendingWarehouse') {
      // 待处理类：走 pending-bundles API
      fetchPendingBundles(newFilter);
      return;
    }
    // all / completed / unqualified：走 list API，通过 qualityStatus 过滤
    // 不合格 → qualityStatus=unqualified
    // 已完成 → qualityStatus=qualified（合格即视为已完成，含已入库和待入库）
    // 全部 → 不传 qualityStatus
    const nextQualityStatus = newFilter === 'unqualified' ? 'unqualified'
      : newFilter === 'completed' ? 'qualified'
      : undefined;
    setQueryParams((prev) => ({
      ...prev,
      page: 1,
      qualityStatus: nextQualityStatus,
    }));
    // 注意：setQueryParams 会触发主 hook 中的 useEffect 自动调 fetchWarehousingList
  }, [fetchPendingBundles]);

  const navigateToInspect = useCallback((orderId: string, bundleId?: string) => {
    const params = new URLSearchParams();
    if (bundleId) params.set('bundleId', bundleId);
    navigate(`/production/warehousing/inspect/${orderId}?${params.toString()}`);
  }, [navigate]);

  const ensureOrderUnlockedById = async (orderId: any) => {
    return await orderFrozen.ensureUnlocked(orderId, () => message.error('订单已完成，无法操作'));
  };

  const isOrderFrozenById = (orderId: any) => {
    return orderFrozen.isFrozenById[orderId] || false;
  };

  return {
    loading,
    warehousingList,
    setWarehousingList,
    total,
    setTotal,
    smartError,
    queryParams,
    setQueryParams,
    showSmartErrorNotice,

    warehousingStats,
    fetchWarehousingStats,

    statusFilter,
    setStatusFilter,
    handleStatusFilterChange,
    showAllWarehousing,
    setShowAllWarehousing,

    pendingBundles,
    pendingBundlesLoading,
    fetchPendingBundles,

    navigateToInspect,

    fetchWarehousingList,
    ensureOrderUnlockedById,
    isOrderFrozenById,
  };
};
