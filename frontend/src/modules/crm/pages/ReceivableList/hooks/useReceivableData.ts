import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '@/hooks/usePerformance';
import {
  receivableApi,
  type Receivable,
  type ReceivableStats,
} from '@/services/crm/customerApi';
import { message } from '@/utils/antdStatic';
import { confirmDelete } from '@/utils/confirm';
import type { ApiResult } from '@/utils/api';
import { paths } from '@/routeConfig';
import { INITIAL_STATS } from '../helpers';

export const useReceivableData = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState<Receivable[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ReceivableStats>(INITIAL_STATS);
  const [statusFilter, setStatusFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const [sourceBizType, setSourceBizType] = useState('');
  const [sourceBizNo, setSourceBizNo] = useState('');
  const debouncedSourceBizNo = useDebouncedValue(sourceBizNo, 300);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [createOpen, setCreateOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState<Receivable | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailReceivableId, setDetailReceivableId] = useState<string>();

  const fetchList = useCallback(async (
    page = pagination.current,
    st = statusFilter,
    kw = debouncedKeyword,
    bizType = sourceBizType,
    bizNo = debouncedSourceBizNo,
  ) => {
    setLoading(true);
    try {
      const res: ApiResult = await receivableApi.list({
        page,
        pageSize: pagination.pageSize,
        status: st || undefined,
        keyword: kw || undefined,
        sourceBizType: bizType || undefined,
        sourceBizNo: bizNo || undefined,
      });
      const data = (res?.data ?? res) as Record<string, unknown> | undefined;
      setRecords((data?.records as Receivable[]) ?? []);
      setTotal((data?.total as number) ?? 0);
    } catch {
      message.error('加载应收账款列表失败');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKeyword, pagination.pageSize, debouncedSourceBizNo, sourceBizType, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res: ApiResult = await receivableApi.stats();
      const data = (res?.data ?? res) as ReceivableStats | undefined;
      setStats(data ?? INITIAL_STATS);
    } catch { /* 不影响主流程 */ }
  }, []);

  useEffect(() => {
    const initialStatus = searchParams.get('status') || '';
    const initialKeyword = searchParams.get('keyword') || '';
    const initialSourceBizType = searchParams.get('sourceBizType') || '';
    const initialSourceBizNo = searchParams.get('sourceBizNo') || '';
    const initialReceivableId = searchParams.get('receivableId') || undefined;
    setStatusFilter(initialStatus);
    setKeyword(initialKeyword);
    setSourceBizType(initialSourceBizType);
    setSourceBizNo(initialSourceBizNo);
    setDetailReceivableId(initialReceivableId);
    setDetailOpen(Boolean(initialReceivableId));
    fetchList(1, initialStatus, initialKeyword, initialSourceBizType, initialSourceBizNo);
    fetchStats();
  }, [fetchList, fetchStats, searchParams]);

  const goToMaterialPickup = useCallback((record: Receivable, tab: 'pickup' | 'payment') => {
    const params = new URLSearchParams();
    params.set('tab', tab);
    params.set('sourceBizType', record.sourceBizType || 'MATERIAL_PICKUP');
    if (record.sourceBizNo) {
      params.set('pickupNo', record.sourceBizNo);
    }
    if (record.customerName) {
      params.set('factoryName', record.customerName);
    }
    navigate(`${paths.materialInventory}?${params.toString()}`);
  }, [navigate]);

  const openReceivableDetail = useCallback((record: Receivable) => {
    if (!record.id) {
      return;
    }
    setDetailReceivableId(record.id);
    setDetailOpen(true);
    const next = new URLSearchParams(searchParams);
    next.set('receivableId', record.id);
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const closeReceivableDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailReceivableId(undefined);
    const next = new URLSearchParams(searchParams);
    next.delete('receivableId');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const openReceiveModal = useCallback((record: Receivable) => {
    setActiveRecord(record);
    setReceiveOpen(true);
  }, []);

  const closeReceiveModal = useCallback(() => {
    setReceiveOpen(false);
    setActiveRecord(null);
  }, []);

  const currentPage = pagination.current;
  const handleDelete = useCallback((record: Receivable) => {
    confirmDelete(`应收单「${record.receivableNo}」`, async () => {
      await receivableApi.delete(record.id!);
      fetchList(currentPage);
      fetchStats();
    });
  }, [fetchList, fetchStats, currentPage]);

  const refreshCurrent = useCallback(() => {
    fetchList(currentPage);
    fetchStats();
  }, [fetchList, fetchStats, currentPage]);

  return {
    // 数据
    records,
    total,
    loading,
    stats,
    // 过滤
    statusFilter,
    keyword,
    sourceBizType,
    sourceBizNo,
    setStatusFilter,
    setKeyword,
    setSourceBizType,
    setSourceBizNo,
    // 分页
    pagination,
    setPagination,
    // 弹窗
    createOpen,
    setCreateOpen,
    receiveOpen,
    activeRecord,
    detailOpen,
    detailReceivableId,
    // 操作
    fetchList,
    fetchStats,
    refreshCurrent,
    goToMaterialPickup,
    openReceivableDetail,
    closeReceivableDetail,
    openReceiveModal,
    closeReceiveModal,
    handleDelete,
  };
};
