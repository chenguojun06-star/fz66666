import { useEffect, useState } from 'react';
import api from '@/utils/api';
import { useSync } from '@/utils/syncManager';
import {
  BUNDLES_PAGE_SIZE_KEY,
  loadBundlesPageSize,
  type CuttingBundleRow,
  type CuttingQueryParams,
} from './cuttingBundlesHelpers';

interface UseCuttingBundleListOptions {
  message: any;
  activeTask: any;
  /** 列表加载完成后的回调（hasRecords 表示是否有数据，用于主 hook 控制 importLocked） */
  onBundlesLoaded?: (hasRecords: boolean) => void;
}

/**
 * 裁剪菲号列表子 Hook
 * 管理菲号列表查询、分页、全量汇总、实时同步
 */
export function useCuttingBundleList({
  message,
  activeTask,
  onBundlesLoaded,
}: UseCuttingBundleListOptions) {
  const [queryParams, setQueryParams] = useState<CuttingQueryParams>(() => ({
    page: 1,
    pageSize: loadBundlesPageSize(),
  }));
  const [listLoading, setListLoading] = useState(false);
  const [dataSource, setDataSource] = useState<CuttingBundleRow[]>([]);
  const [total, setTotal] = useState(0);
  // 全量颜色-尺码已裁件数映射（用于计算剩余裁剪量，不受分页影响）
  const [allBundlesQtyMap, setAllBundlesQtyMap] = useState<Record<string, number>>({});

  // 获取菲号列表
  const fetchBundles = async () => {
    if (!activeTask?.productionOrderNo) {
      setDataSource([]);
      setTotal(0);
      return;
    }
    setListLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: { records: CuttingBundleRow[]; total: number } }>('/production/cutting/list', {
        params: { ...queryParams, orderNo: activeTask.productionOrderNo, splitStatus: '' },
      });
      if (res.code === 200) {
        const records = res.data.records || [];
        setDataSource(records);
        setTotal(res.data.total || 0);
        onBundlesLoaded?.(records.length > 0);
      } else {
        message.error(res.message || '获取裁剪列表失败');
      }
    } catch {
      message.error('获取裁剪列表失败');
    } finally {
      setListLoading(false);
    }
  };

  // 持久化菲号列表 pageSize
  useEffect(() => {
    try { window.localStorage.setItem(BUNDLES_PAGE_SIZE_KEY, String(queryParams.pageSize)); } catch { /* ignore */ }
  }, [queryParams.pageSize]);

  const queryParamsKey = JSON.stringify(queryParams);
  useEffect(() => {
    fetchBundles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParamsKey, activeTask?.productionOrderNo]);

  // 全量菲号汇总：用 /summary 端点（全量聚合，无分页 500 上限限制）计算剩余裁剪量
  useEffect(() => {
    const orderNo = activeTask?.productionOrderNo;
    if (!orderNo) { setAllBundlesQtyMap({}); return; }
    let cancelled = false;
    void api.get<{ code: number; data: { tasks: Array<{ color: string; size: string; quantity: number }> } }>('/production/cutting/summary', {
      params: { orderNo },
    }).then((res) => {
      if (cancelled) return;
      if (res.code === 200) {
        const map: Record<string, number> = {};
        (res.data?.tasks || []).forEach((task) => {
          const k = `${String(task.color || '').trim()}-${String(task.size || '').trim()}`;
          map[k] = (map[k] || 0) + Number(task.quantity || 0);
        });
        setAllBundlesQtyMap(map);
      } else {
        setAllBundlesQtyMap({});
      }
    }).catch(() => { if (!cancelled) setAllBundlesQtyMap({}); });
    return () => { cancelled = true; };
  }, [activeTask?.productionOrderNo, total]);

  // 实时同步：裁剪批次数据
  useSync(
    'cutting-bundles',
    async () => {
      if (!activeTask?.productionOrderNo) return null;
      try {
        const res = await api.get<{ code: number; data: { records: CuttingBundleRow[]; total: number } }>('/production/cutting/list', {
          params: { ...queryParams, orderNo: activeTask.productionOrderNo, splitStatus: '' }
        });
        if (res.code === 200) return { records: res.data.records || [], total: res.data.total || 0 };
        return null;
      } catch { return null; }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setDataSource(newData.records);
        setTotal(newData.total);
      }
    },
    {
      interval: 30000,
      enabled: !listLoading && Boolean(activeTask?.productionOrderNo),
      pauseOnHidden: true,
      onError: (error) => console.error('[实时同步] 裁剪批次同步错误', error)
    }
  );

  return {
    queryParams,
    setQueryParams,
    listLoading,
    dataSource,
    total,
    allBundlesQtyMap,
    fetchBundles,
  };
}
