import { useCallback, useEffect, useMemo, useState } from 'react';
import { Input } from 'antd';
import api, { useProductionOrderFrozenCache } from '@/utils/api';
import { useSync } from '@/utils/syncManager';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import type { CuttingTask } from '@/types/production';
import type { Dayjs } from 'dayjs';

interface UseCuttingTasksOptions {
  message: any;
  modal: any;
  isEntryPage: boolean;
}

/**
 * 裁剪任务管理 Hook
 * 管理任务列表、领取、退回、排序、统计筛选
 */
export function useCuttingTasks({ message, modal, isEntryPage }: UseCuttingTasksOptions) {
  const { user } = useAuth();
  const isAdmin = useMemo(() => isSupervisorOrAboveUser(user), [user]);

  // 任务查询状态
  const [taskQuery, setTaskQuery] = useState({ page: 1, pageSize: 10, status: '' as string, orderNo: '', styleNo: '' });
  const [taskDateRange, setTaskDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskList, setTaskList] = useState<CuttingTask[]>([]);
  const [taskTotal, setTaskTotal] = useState(0);
  const [receiveTaskLoading, setReceiveTaskLoading] = useState(false);
  const [rollbackTaskLoading, setRollbackTaskLoading] = useState(false);

  // 排序
  const [cuttingSortField, setCuttingSortField] = useState<string>('receivedTime');
  const [cuttingSortOrder, setCuttingSortOrder] = useState<'asc' | 'desc'>('desc');
  const handleCuttingSort = (field: string, order: 'asc' | 'desc') => {
    setCuttingSortField(field);
    setCuttingSortOrder(order);
  };

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
    return await orderFrozen.ensureUnlocked(orderId, () => message.error('订单已完成，无法操作'));
  };

  const isOrderFrozenById = (orderId: any) => {
    return orderFrozen.isFrozenById[orderId] || false;
  };

  // 排序后的任务列表
  const sortedTaskList = useMemo(() => {
    const sorted = [...taskList];
    sorted.sort((a: any, b: any) => {
      const aVal = a[cuttingSortField];
      const bVal = b[cuttingSortField];
      if (cuttingSortField === 'receivedTime' || cuttingSortField === 'bundledTime') {
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
      const res = await api.get<{ code: number; data: typeof cuttingStats }>('/production/cutting-task/stats', { params: filterParams });
      if (res.code === 200 && res.data) {
        setCuttingStats(res.data);
      }
    } catch (error) {
      console.error('获取裁剪统计失败', error);
    }
  }, [taskQuery.orderNo, taskQuery.styleNo]);

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
    } catch (err: any) {
      message.error(`获取裁剪任务失败: ${err?.message || '请检查网络连接'}`);
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
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || '领取任务失败';
      message.error(errMsg);
    } finally {
      setReceiveTaskLoading(false);
    }
  };

  // 退回任务
  const handleRollbackTask = async (task: CuttingTask, onRolledBack?: () => void) => {
    if (!task?.id) return;
    if (!(await ensureOrderUnlockedById((task as unknown as any)?.productionOrderNo))) return;
    let reason = '';
    modal.confirm({
      title: '确认退回该裁剪任务？',
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>退回后会清空领取信息，并删除已生成的裁剪明细，可重新领取并重新生成。</div>
          <div style={{ marginBottom: 12, fontWeight: 600 }}>退回原因</div>
          <Input.TextArea
            placeholder="请输入退回原因"
            autoSize={{ minRows: 3, maxRows: 6 }}
            maxLength={200}
            showCount
            onChange={(e) => { reason = String(e?.target?.value || ''); }}
          />
        </div>
      ),
      okText: '确认退回',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const remark = String(reason || '').trim();
        if (!remark) {
          message.error('请输入退回原因');
          return Promise.reject(new Error('请输入退回原因'));
        }
        setRollbackTaskLoading(true);
        try {
          const res = await api.post<{ code: number; message: string }>('/production/cutting-task/rollback', {
            taskId: task.id,
            operatorId: user?.id,
            reason: remark,
          });
          if (res.code === 200) {
            message.success('退回成功');
            onRolledBack?.();
            fetchTasks();
          } else {
            message.error(res.message || '退回失败');
          }
        } catch (err: any) {
          message.error(`退回失败: ${err?.message || '未知错误'}`);
        } finally {
          setRollbackTaskLoading(false);
        }
      },
    });
  };

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
    } catch (err: any) {
      message.error(err?.response?.data?.message || '编辑失败');
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
