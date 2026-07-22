import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '@/hooks/usePerformance';
import type { Receivable, ReceivableStats } from '@/services/crm/customerApi';
import { receivableApi } from '@/services/crm/customerApi';
import { message } from '@/utils/antdStatic';
import { confirmDelete } from '@/utils/confirm';
import type { ApiResult } from '@/utils/api';
import { paths } from '@/routeConfig';

export interface UseReceivableListReturn {
  records: Receivable[];
  total: number;
  loading: boolean;
  stats: ReceivableStats;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  keyword: string;
  setKeyword: (v: string) => void;
  sourceBizType: string;
  setSourceBizType: (v: string) => void;
  sourceBizNo: string;
  setSourceBizNo: (v: string) => void;
  pagination: { current: number; pageSize: number };
  setPagination: (p: { current: number; pageSize: number }) => void;
  createOpen: boolean;
  setCreateOpen: (v: boolean) => void;
  receiveOpen: boolean;
  setReceiveOpen: (v: boolean) => void;
  activeRecord: Receivable | null;
  setActiveRecord: (r: Receivable | null) => void;
  detailOpen: boolean;
  detailReceivableId: string | undefined;
  fetchList: (page?: number, st?: string, kw?: string, bizType?: string, bizNo?: string) => Promise<void>;
  fetchStats: () => Promise<void>;
  goToMaterialPickup: (record: Receivable, tab: 'pickup' | 'payment') => void;
  openReceivableDetail: (record: Receivable) => void;
  closeReceivableDetail: () => void;
  handleDelete: (record: Receivable) => void;
}

const useReceivableList = (): UseReceivableListReturn => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState<Receivable[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ReceivableStats>({ totalPending: 0, totalOverdue: 0, overdueCount: 0, newThisMonth: 0 });
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
      setStats(data ?? { totalPending: 0, totalOverdue: 0, overdueCount: 0, newThisMonth: 0 });
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

  const handleDelete = (record: Receivable) => {
    confirmDelete(`应收单「${record.receivableNo}」`, async () => {
      await receivableApi.delete(record.id!);
      fetchList(pagination.current);
      fetchStats();
    });
  };

  return {
    records,
    total,
    loading,
    stats,
    statusFilter,
    setStatusFilter,
    keyword,
    setKeyword,
    sourceBizType,
    setSourceBizType,
    sourceBizNo,
    setSourceBizNo,
    pagination,
    setPagination,
    createOpen,
    setCreateOpen,
    receiveOpen,
    setReceiveOpen,
    activeRecord,
    setActiveRecord,
    detailOpen,
    detailReceivableId,
    fetchList,
    fetchStats,
    goToMaterialPickup,
    openReceivableDetail,
    closeReceivableDetail,
    handleDelete,
  };
};

export default useReceivableList;
