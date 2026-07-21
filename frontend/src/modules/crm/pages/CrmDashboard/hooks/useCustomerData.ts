import { useCallback, useEffect, useState } from 'react';
import { useDebouncedValue } from '@/hooks/usePerformance';
import { customerApi, receivableApi, type Customer, type Receivable } from '@/services/crm/customerApi';
import { confirmDelete } from '@/utils/confirm';
import type { ApiResult } from '@/utils/api';
import { message } from '@/utils/antdStatic';
import { readPageSize } from '@/utils/pageSizeStore';
import { useSync } from '@/utils/syncManager';
import { useShareOrderDialog } from '@/modules/production/pages/Production/ProgressDetail/hooks/useShareOrderDialog';
import type { TablePaginationConfig } from 'antd/es/table';
import { INITIAL_STATS } from '../helpers';

type Stats = { total: number; activeCount: number; newThisMonth: number; vip: number };

// CRM 客户管理业务逻辑 Hook
export const useCustomerData = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: readPageSize(20) });
  const [stats, setStats] = useState<Stats>(INITIAL_STATS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editData, setEditData] = useState<Customer | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerData, setDrawerData] = useState<Customer | null>(null);
  const [drawerOrders, setDrawerOrders] = useState<any[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerReceivables, setDrawerReceivables] = useState<Receivable[]>([]);
  const [drawerReceivableLoading, setDrawerReceivableLoading] = useState(false);
  const { handleShareOrder, shareOrderDialog } = useShareOrderDialog({ message });

  const fetchList = useCallback(async (page = pagination.current, kw = debouncedKeyword, st = statusFilter) => {
    setLoading(true);
    try {
      const res: ApiResult = await customerApi.list({ page, pageSize: pagination.pageSize, keyword: kw, status: st });
      const data = (res?.data ?? res) as Record<string, unknown> | undefined;
      setCustomers((data?.records as Customer[]) ?? []);
      setTotal((data?.total as number) ?? 0);
    } catch {
      message.error('加载客户列表失败');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.pageSize, debouncedKeyword, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res: ApiResult = await customerApi.getStats();
      const data = (res?.data ?? res) as Record<string, unknown> | undefined;
      setStats({ total: (data?.total as number) ?? 0, activeCount: (data?.activeCount as number) ?? 0, newThisMonth: (data?.newThisMonth as number) ?? 0, vip: (data?.vip as number) ?? 0 });
    } catch { /* 统计失败不影响主流程 */ }
  }, []);

  useEffect(() => {
    fetchList(1);
    fetchStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 90s 轮询刷新客户列表+统计
  useSync(
    'crm-customer-list',
    async () => {
      try {
        await Promise.all([fetchList(), fetchStats()]);
      } catch { /* 轮询失败忽略 */ }
      return null;
    },
    () => {},
    { interval: 90000, pauseOnHidden: true },
  );

  // 监听 data:changed 事件，500ms 防抖后刷新列表+统计
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchList();
        fetchStats();
      }, 500);
    };
    window.addEventListener('data:changed', handleChange);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('data:changed', handleChange);
    };
  }, [fetchList, fetchStats]);

  const handleSearch = useCallback(() => {
    setPagination(p => ({ ...p, current: 1 }));
    fetchList(1, keyword, statusFilter);
  }, [fetchList, keyword, statusFilter]);

  const handleTableChange = useCallback((p: TablePaginationConfig) => {
    const page = p.current ?? 1;
    setPagination({ current: page, pageSize: p.pageSize ?? 20 });
    fetchList(page);
  }, [fetchList]);

  const handleDelete = useCallback((record: Customer) => {
    confirmDelete(`客户「${record.companyName}」`, async () => {
      await customerApi.delete(record.id!);
      fetchList(pagination.current);
      fetchStats();
    });
  }, [fetchList, fetchStats, pagination.current]);

  const openDrawer = useCallback(async (record: Customer) => {
    setDrawerData(record);
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerReceivableLoading(true);
    const [ordersRes, receivablesRes] = await Promise.allSettled([
      customerApi.getOrders(record.id!),
      receivableApi.list({ customerId: record.id, pageSize: 50, page: 1 }),
    ]);
    setDrawerOrders(ordersRes.status === 'fulfilled'
      ? (((ordersRes.value as any)?.data ?? ordersRes.value) ?? [])
      : []);
    setDrawerReceivables(receivablesRes.status === 'fulfilled'
      ? ((receivablesRes.value as any)?.data?.records ?? (receivablesRes.value as any)?.records ?? [])
      : []);
    setDrawerLoading(false);
    setDrawerReceivableLoading(false);
  }, []);

  const openCreateModal = useCallback(() => {
    setEditData(null);
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback((record: Customer) => {
    setEditData(record);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => setModalOpen(false), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const onModalSuccess = useCallback(() => {
    fetchList(pagination.current);
    fetchStats();
  }, [fetchList, fetchStats, pagination.current]);

  return {
    // 列表数据
    customers,
    total,
    loading,
    // 过滤
    keyword,
    setKeyword,
    statusFilter,
    setStatusFilter,
    debouncedKeyword,
    // 分页
    pagination,
    setPagination,
    // 统计
    stats,
    // 新建/编辑 Modal
    modalOpen,
    editData,
    openCreateModal,
    openEditModal,
    closeModal,
    onModalSuccess,
    // 详情 Drawer
    drawerOpen,
    drawerData,
    drawerOrders,
    drawerLoading,
    drawerReceivables,
    drawerReceivableLoading,
    openDrawer,
    closeDrawer,
    // 分享订单弹窗
    handleShareOrder,
    shareOrderDialog,
    // 操作
    fetchList,
    fetchStats,
    handleSearch,
    handleTableChange,
    handleDelete,
  };
};
