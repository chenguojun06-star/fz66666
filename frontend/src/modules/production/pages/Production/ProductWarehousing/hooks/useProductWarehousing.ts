import { useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import api from '@/utils/api';
import { useSync } from '@/utils/syncManager';
import { ProductWarehousing as WarehousingType } from '@/types/production';

import { useWarehousingList } from './useWarehousingList';
import { useWarehousingModals } from './useWarehousingModals';

// 重新导出类型，保持外部 import 路径不变（向后兼容）
export type { WarehousingStats, StatusFilter, PendingBundleRow } from './warehousingConstants';

export const useProductWarehousing = () => {
  const location = useLocation();

  const {
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
  } = useWarehousingList();

  const modalState = useWarehousingModals({
    fetchWarehousingList,
    ensureOrderUnlockedById,
  });

  // Sync logic
  useSync(
    'product-warehousing-list',
    async () => {
      try {
        const response = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', { params: queryParams });
        if (response.code === 200) {
          return {
            records: response.data.records || [],
            total: response.data.total || 0
          };
        }
        return null;
      } catch (error) {
        return null;
      }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setWarehousingList(newData.records);
        setTotal(newData.total);
      }
    },
    {
      interval: 30000,
      enabled: !loading && !modalState.visible && !modalState.warehousingModalOpen && !modalState.independentDetailOpen,
      pauseOnHidden: true,
      onError: (error) => {
        console.error('[实时同步] 质检入库数据同步错误', error);
      }
    }
  );

  // WebSocket 实时刷新：入库操作 / 订单进度变更 / 数据变更
  useEffect(() => {
    const handleWarehouseIn = () => {
      fetchWarehousingList();
      fetchWarehousingStats();
    };
    const handleProgressChanged = () => {
      fetchWarehousingList();
      fetchWarehousingStats();
    };
    const handleDataChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail as { entityType?: string };
      if (detail?.entityType === 'ProductWarehousing' || detail?.entityType === 'ProductionOrder') {
        fetchWarehousingList();
        fetchWarehousingStats();
      }
    };
    window.addEventListener('warehouse:in', handleWarehouseIn);
    window.addEventListener('order:progress:changed', handleProgressChanged);
    window.addEventListener('data:changed', handleDataChanged);
    return () => {
      window.removeEventListener('warehouse:in', handleWarehouseIn);
      window.removeEventListener('order:progress:changed', handleProgressChanged);
      window.removeEventListener('data:changed', handleDataChanged);
    };
  }, [fetchWarehousingList, fetchWarehousingStats]);

  // Effects
  useEffect(() => {
    fetchWarehousingList();
    fetchWarehousingStats();
  }, [queryParams, fetchWarehousingList, fetchWarehousingStats]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const styleNo = (params.get('styleNo') || '').trim();
    const orderNo = (params.get('orderNo') || '').trim();
    if (styleNo || orderNo) {
      setQueryParams((prev) => ({
        ...prev,
        page: 1,
        styleNo: styleNo || prev.styleNo,
        orderNo: orderNo || prev.orderNo,
      }));
    }
  }, [location.search]);

  // Derived State
  const sortedWarehousingList = useMemo(() => {
    let list = [...warehousingList];
    if (!showAllWarehousing) {
      list = list.filter((r: any) => {
        const s = String(r.status || r.qualityStatus || '').trim().toLowerCase();
        return !['completed', 'warehoused', 'cancelled', 'scrapped'].includes(s);
      });
    }
    return list.sort((a: any, b: any) => {
      const aStatus = String(a.status || a.qualityStatus || '').trim().toLowerCase();
      const bStatus = String(b.status || b.qualityStatus || '').trim().toLowerCase();
      const aCancelled = ['cancelled', 'scrapped'].includes(aStatus) ? 2 : aStatus === 'completed' || aStatus === 'warehoused' ? 1 : 0;
      const bCancelled = ['cancelled', 'scrapped'].includes(bStatus) ? 2 : bStatus === 'completed' || bStatus === 'warehoused' ? 1 : 0;
      if (aCancelled !== bCancelled) return aCancelled - bCancelled;
      const aTime = new Date(String(a.createTime || a.warehousingTime || 0)).getTime();
      const bTime = new Date(String(b.createTime || b.warehousingTime || 0)).getTime();
      return bTime - aTime;
    });
  }, [warehousingList, showAllWarehousing]);

  return {
    // State
    loading,
    warehousingList,
    sortedWarehousingList,
    total,
    smartError,
    showSmartErrorNotice,
    queryParams,
    setQueryParams,

    // Modal State
    ...modalState,

    // Stats
    warehousingStats,
    fetchWarehousingStats,

    // Status Filter
    statusFilter,
    setStatusFilter,
    handleStatusFilterChange,
    showAllWarehousing,
    setShowAllWarehousing,
    pendingBundles,
    pendingBundlesLoading,
    fetchPendingBundles,
    navigateToInspect,

    // Actions
    fetchWarehousingList,
    ensureOrderUnlockedById,
    isOrderFrozenById,
  };
};
