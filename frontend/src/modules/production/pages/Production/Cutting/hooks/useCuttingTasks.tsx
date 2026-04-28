import { useCallback, useEffect, useMemo, useState } from 'react';
import { readPageSize } from '@/utils/pageSizeStore';
import api, { useProductionOrderFrozenCache } from '@/utils/api';
import { useSync } from '@/utils/syncManager';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import type { CuttingTask } from '@/types/production';
import type { Dayjs } from 'dayjs';
import { usePersistentSort } from '@/hooks/usePersistentSort';

const CUTTING_TASK_QUERY_STORAGE_KEY = 'Cutting.taskQuery';

type CuttingTaskQuery = {
  page: number;
  pageSize: number;
  status: string;
  orderNo: string;
  styleNo: string;
  orgUnitId: string;
  factoryType: '' | 'INTERNAL' | 'EXTERNAL';
};

const createDefaultTaskQuery = (): CuttingTaskQuery => ({
  page: 1,
  pageSize: readPageSize(10),
  status: '',
  orderNo: '',
  styleNo: '',
  orgUnitId: '',
  factoryType: '',
});

interface UseCuttingTasksOptions {
  message: any;
  isEntryPage: boolean;
}

/**
 * 裁剪任务管理 Hook
 * 管理任务列表、领取、退回、排序、统计筛选
 */
export function useCuttingTasks({ message, isEntryPage }: UseCuttingTasksOptions) {
  const { user } = useAuth();
  const isAdmin = useMemo(() => isSupervisorOrAboveUser(user), [user]);

  // 任务查询状态
  const [taskQuery, setTaskQuery] = useState<CuttingTaskQuery>(() => {
    const base = createDefaultTaskQuery();
    if (typeof window === 'undefined') return base;
    try {
      const raw = window.localStorage.getItem(CUTTING_TASK_QUERY_STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return base;
      const page = Number((parsed as Partial<CuttingTaskQuery>).page);
      const pageSize = Number((parsed as Partial<CuttingTaskQuery>).pageSize);
      const factoryType = String((parsed as Partial<CuttingTaskQuery>).factoryType || '').trim().toUpperCase();
      return {
        ...base,
        ...(parsed as Partial<CuttingTaskQuery>),
        page: Number.isFinite(page) && page > 0 ? Math.floor(page) : base.page,
        pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : base.pageSize,
        factoryType: factoryType === 'INTERNAL' || factoryType === 'EXTERNAL' ? factoryType : '',
      };
    } catch {
      return base;
    }
  });
  const [taskDateRange, setTaskDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskList, setTaskList] = useState<CuttingTask[]>([]);
  const [taskTotal, setTaskTotal] = useState(0);
  const [receiveTaskLoading, setReceiveTaskLoading] = useState(false);
  const [rollbackTaskLoading, setRollbackTaskLoading] = useState(false);
  const [pendingRollbackTask, setPendingRollbackTask] = useState<{ task: CuttingTask; onRolledBack?: () => void } | null>(null);

  // 排序
  const {
    sortField: cuttingSortField,
    sortOrder: cuttingSortOrder,
    handleSort: handleCuttingSort,
  } = usePersistentSort<string, 'asc' | 'desc'>({
    storageKey: 'cutting-task-list',
    defaultField: 'receivedTime',
    defaultOrder: 'desc',
  });

  // 统计
  const [cuttingStats, setCuttingStats] = useState<{
    totalCount: number; totalQuantity: number; pendingCount: number; receivedCount: number; bundledCount: number;
  }>({ totalCount: 0, totalQuantity: 0, pendingCount: 0, receivedCount: 0, bundledCount: 0 });
  const [activeStatFilter, setActiveStatFilter] = useState<'all' | 'pending' | 'received' | 'bundled'>('all');

  // 快速编辑
  const [quickEditVisible, setQuickEditVisible] = useState(false);
  const [quickEditRecord, setQuickEditRecord] = useState<CuttingTask | null>(null);
  const [quickEditSaving, setQuickEditSaving] = useState(false);

  // 订单冻结检测
  const frozenOrderIds = useMemo(() => {
    return Array.from(
      new Set(
        taskList
          .map((r) => String((r as unknown as any)?.productionOrderNo || '').trim())
          .filter(Boolean)
      )
    );
  }, [taskList]);

  const orderFrozen = useProductionOrderFrozenCache(frozenOrderIds, { rule: 'status', acceptAnyData: false });

  const ensureOrderUnlockedById = async (orderId: any) => {
    return await orderFrozen.ensureUnlocked(orderId, () => message.error('订单已关单/报废/完成，无法操作'));
  };

  const isOrderFrozenById = (orderId: any) => {
    return orderFrozen.isFrozenById[orderId] || false;
  };

  // 排序后的任务列表
  const sortedTaskList = useMemo(() => {
    const sorted = [...taskList];
    sorted.sort((a: any, b: any) => {
      const aStatus = String(a.status || '').trim().toLowerCase();
      const bStatus = String(b.status || '').trim().toLowerCase();
      const aTerminal = aStatus === 'bundled' ? 1 : 0;
      const bTerminal = bStatus === 'bundled' ? 1 : 0;
      if (aTerminal !== bTerminal) return aTerminal - bTerminal;
      const aVal = a[cuttingSortField];
      const bVal = b[cuttingSortField];
      if (cuttingSortField === 'receivedTime' || cuttingSortField === 'bundledTime' || cuttingSortField === 'orderTime') {
        const aTime = aVal ? new Date(aVal).getTime() : 0;
        const bTime = bVal ? new Date(bVal).getTime() : 0;
        return cuttingSortOrder === 'desc' ? bTime - aTime : aTime - bTime;
      }
      return 0;
    });
    return sorted;
  }, [taskList, cuttingSortField, cuttingSortOrder]);

  // 获取裁剪统计
  const fetchCuttingStats = useCallback(async () => {
    try {
      const filterParams: Record<string, string> = {};
      if (taskQuery.orderNo) filterParams.orderNo = taskQuery.orderNo;
      if (taskQuery.styleNo) filterParams.styleNo = taskQuery.styleNo;
      filterParams.factoryType = taskQuery.factoryType;
      const res = await api.get<{ code: number; data: typeof cuttingStats }>('/production/cutting-task/stats', { params: filterParams });
      if (res.code === 200 && res.data) {
        setCuttingStats(res.data);
      }
    } catch (error) {
      console.error('获取裁剪统计失败', error);
    }
  }, [taskQuery.orderNo, taskQuery.styleNo, taskQuery.factoryType]);

  // 统计卡片筛选
  const handleStatClick = (type: 'all' | 'pending' | 'received' | 'bundled') => {
    setActiveStatFilter(type);
    if (type === 'all') {
      setTaskQuery(prev => ({ ...prev, status: '', page: 1 }));
    } else {
      setTaskQuery(prev => ({ ...prev, status: type, page: 1 }));
    }
  };

  // 获取任务列表
  const fetchTasks = async () => {
    setTaskLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: { records: CuttingTask[]; total: number } }>('/production/cutting-task/list', { params: taskQuery });
      if (res.code === 200) {
        setTaskList(res.data.records || []);
        setTaskTotal(res.data.total || 0);
      } else {
        message.error(res.message || '获取裁剪任务失败');
      }
    } catch (err: unknown) {
      message.error(`获取裁剪任务失败: ${err instanceof Error ? err.message : '请检查网络连接'}`);
    } finally {
      setTaskLoading(false);
    }
  };

  // 领取任务
  const handleReceiveTask = async (task: CuttingTask) => {
    if (!task?.id) return;
    setReceiveTaskLoading(true);
    try {
      const payload = {
        taskId: task.id,
        receiverId: user?.id,
        receiverName: user?.name,
      };
      const res = await api.post<{ code: number; message: string; data: CuttingTask }>('/production/cutting-task/receive', payload);
      if (res.code === 200) {
        message.success('领取成功，请点击「进入」填写数量生成菲号');
        fetchTasks();
      } else {
        message.error(res.message || '领取任务失败');
      }
    } catch (err: unknown) {
      const errMsg = (err && typeof err === 'object' && 'response' in err ? (err as any)?.response?.data?.message : undefined) || (err instanceof Error ? err.message : '领取任务失败');
      message.error(errMsg);
    } finally {
      setReceiveTaskLoading(false);
    }
  };

  // 退回任务：进行前置校验，通过状态驱动父组件渲染弹窗
  const handleRollbackTask = async (task: CuttingTask, onRolledBack?: () => void) => {
    if (!task?.id) return;
    if (!(await ensureOrderUnlockedById((task as unknown as any)?.productionOrderNo))) return;
    setPendingRollbackTask({ task, onRolledBack });
  };

  const confirmRollback = async (reason: string) => {
    if (!pendingRollbackTask) return;
    if (rollbackTaskLoading) return; // 防止重复提交
    const { task, onRolledBack } = pendingRollbackTask;
    setRollbackTaskLoading(true);
    try {
      const res = await api.post<{ code: number; message: string }>('/production/cutting-task/rollback', {
        taskId: task.id,
        operatorId: user?.id,
        reason,
      });
      if (res.code === 200) {
        message.success('退回成功');
        setPendingRollbackTask(null);
        onRolledBack?.();
        fetchTasks();
      } else {
        message.error(res.message || '退回失败');
      }
    } catch (err: unknown) {
      message.error(`退回失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setRollbackTaskLoading(false);
    }
  };

  const cancelRollback = () => setPendingRollbackTask(null);

  // 快速编辑保存
  const handleQuickEditSave = async (values: { remarks: string; expectedShipDate: string | null; urgencyLevel?: string }) => {
    setQuickEditSaving(true);
    try {
      await api.put('/production/cutting-task/quick-edit', {
        id: quickEditRecord?.id,
        remarks: values.remarks,
        expectedShipDate: values.expectedShipDate,
      });
      message.success('编辑成功');
      setQuickEditVisible(false);
      setQuickEditRecord(null);
      await fetchTasks();
    } catch (err: unknown) {
      message.error((err && typeof err === 'object' && 'response' in err ? (err as any)?.response?.data?.message : undefined) || '编辑失败');
      throw err;
    } finally {
      setQuickEditSaving(false);
    }
  };

  // Effects
  useEffect(() => {
    if (isEntryPage) return;
    fetchTasks();
  }, [isEntryPage, taskQuery]);

  useEffect(() => {
    if (typeof window === 'undefined' || isEntryPage) return;
    try {
      window.localStorage.setItem(CUTTING_TASK_QUERY_STORAGE_KEY, JSON.stringify(taskQuery));
    } catch {
      // ignore storage errors
    }
  }, [isEntryPage, taskQuery]);

  useEffect(() => {
    if (!isEntryPage) {
      fetchCuttingStats();
    }
  }, [isEntryPage, fetchCuttingStats]);

  // 同步搜索栏 status → 统计卡片高亮
  useEffect(() => {
    const s = (taskQuery.status || '').trim().toLowerCase();
    if (!s) setActiveStatFilter('all');
    else if (s === 'pending' || s === 'received' || s === 'bundled') setActiveStatFilter(s);
    else setActiveStatFilter('all');
  }, [taskQuery.status]);

  // 实时同步：裁剪任务列表
  useSync(
    'cutting-tasks',
    async () => {
      try {
        const res = await api.get<{ code: number; data: { records: CuttingTask[]; total: number } }>('/production/cutting-task/list', { params: taskQuery });
        if (res.code === 200) return { records: res.data.records || [], total: res.data.total || 0 };
        return null;
      } catch { return null; }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setTaskList(newData.records);
        setTaskTotal(newData.total);
        fetchCuttingStats();
      }
    },
    {
      interval: 30000,
      enabled: !taskLoading && !isEntryPage,
      pauseOnHidden: true,
      onError: (error) => console.error('[实时同步] 裁剪任务同步错误', error)
    }
  );

  return {
    // 任务数据
    taskQuery, setTaskQuery, taskDateRange, setTaskDateRange,
    taskLoading, taskList, taskTotal, sortedTaskList,
    // 排序
    cuttingSortField, cuttingSortOrder, handleCuttingSort,
    // 统计
    cuttingStats, activeStatFilter, handleStatClick,
    // 操作
    fetchTasks, handleReceiveTask, handleRollbackTask,
    receiveTaskLoading, rollbackTaskLoading,
    // 退回弹窗状态（父组件渲染 RejectReasonModal）
    pendingRollbackTask, confirmRollback, cancelRollback,
    // 冻结检测
    ensureOrderUnlockedById, isOrderFrozenById,
    // 快速编辑
    quickEditVisible, setQuickEditVisible,
    quickEditRecord, setQuickEditRecord,
    quickEditSaving, handleQuickEditSave,
    // 权限
    isAdmin,
  };
}
