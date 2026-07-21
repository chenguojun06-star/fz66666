import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '@/hooks/usePerformance';
import payableApi, { type Payable, type PayableStats } from '@/services/finance/payableApi';
import { message } from '@/utils/antdStatic';
import type { ApiResult } from '@/utils/api';
import { useSync } from '@/utils/syncManager';
import { INITIAL_STATS } from './helpers';

/** 应付账款列表数据 Hook：负责状态、数据获取、轮询与事件刷新 */
export function usePayableListData() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState<Payable[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<PayableStats>(INITIAL_STATS);
  const [statusFilter, setStatusFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [detailPayableId, setDetailPayableId] = useState<string>();
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchList = useCallback(async (
    page = pagination.current,
    st = statusFilter,
    kw = debouncedKeyword,
  ) => {
    setLoading(true);
    try {
      const res: ApiResult = await payableApi.list({
        page,
        pageSize: pagination.pageSize,
        status: (st as any) || undefined,
        keyword: kw || undefined,
      });
      const data = (res?.data ?? res) as Record<string, unknown> | undefined;
      setRecords((data?.records as Payable[]) ?? []);
      setTotal((data?.total as number) ?? 0);
    } catch {
      message.error('加载应付账款列表失败');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKeyword, pagination.pageSize, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res: any = await payableApi.stats();
      const data = (res?.data ?? res) as PayableStats | undefined;
      setStats(data ?? INITIAL_STATS);
    } catch (err) { console.error('统计加载失败:', err); /* 不影响主流程 */ }
  }, []);

  // 初始化：从 URL 读取 status/keyword/payableId
  useEffect(() => {
    const initialStatus = searchParams.get('status') || '';
    const initialKeyword = searchParams.get('keyword') || '';
    const initialPayableId = searchParams.get('payableId') || undefined;
    setStatusFilter(initialStatus);
    setKeyword(initialKeyword);
    setDetailPayableId(initialPayableId);
    setDetailOpen(Boolean(initialPayableId));
    fetchList(1, initialStatus, initialKeyword);
    fetchStats();
  }, [fetchList, fetchStats, searchParams]);

  // 60s 轮询刷新应付列表+统计
  useSync(
    'payable-list',
    async () => {
      try {
        await Promise.all([fetchList(), fetchStats()]);
      } catch (err) { console.error('轮询同步失败:', err); /* 轮询失败忽略 */ }
      return null;
    },
    () => {},
    { interval: 60000, pauseOnHidden: true },
  );

  // 监听 data:changed 事件，500ms 防抖后刷新列表+统计
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        Promise.all([fetchList(), fetchStats()]).catch((err) => {
          console.error('事件刷新失败:', err);
        });
      }, 500);
    };
    window.addEventListener('data:changed', handleChange);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('data:changed', handleChange);
    };
  }, [fetchList, fetchStats]);

  const openPayableDetail = useCallback((record: Payable) => {
    if (!record.id) {
      return;
    }
    setDetailPayableId(record.id);
    setDetailOpen(true);
    const next = new URLSearchParams(searchParams);
    next.set('payableId', record.id);
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const closePayableDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailPayableId(undefined);
    const next = new URLSearchParams(searchParams);
    next.delete('payableId');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  return {
    // state
    searchParams,
    records,
    total,
    loading,
    stats,
    statusFilter,
    keyword,
    pagination,
    detailOpen,
    detailPayableId,
    // setters
    setStatusFilter,
    setKeyword,
    setPagination,
    // actions
    fetchList,
    fetchStats,
    openPayableDetail,
    closePayableDetail,
  };
}
