import { useState, useCallback, useRef } from 'react';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { TaskItem, TaskStatus } from './types';
import type { PendingTaskDTO } from '@/services/intelligence/intelligenceTypes/advisor';

const POLL_INTERVAL = 30_000;

const TASK_TYPE_MODULE: Record<string, string> = {
  CUTTING_TASK: 'production', QUALITY_INSPECT: 'quality', REPAIR: 'production',
  MATERIAL_PURCHASE: 'procurement', OVERDUE_ORDER: 'production', EXCEPTION_REPORT: 'production',
  STYLE_DEVELOPMENT: 'style', PAYROLL_SETTLEMENT: 'finance', MATERIAL_RECON: 'finance',
  EXPENSE_REIMBURSE: 'finance',
};

function mapPendingToTaskItem(p: PendingTaskDTO): TaskItem {
  return {
    id: `sys-${p.id}`,
    title: p.title || `${p.taskType} ${p.orderNo || ''}`,
    description: p.description || '',
    module: TASK_TYPE_MODULE[p.taskType] || 'production',
    taskType: p.taskType,
    priority: p.priority || 'medium',
    status: (p.taskStatus || 'pending') as TaskStatus,
    orderNo: p.orderNo,
    styleNo: p.styleNo,
    deepLinkPath: p.deepLinkPath,
    source: 'system' as const,
    assigneeName: p.assigneeName || undefined,
    startTime: p.startTime || undefined,
    endTime: p.endTime || undefined,
    createdAt: p.createdAt || '',
    updatedAt: p.createdAt || '',
  };
}

export function useTaskManager() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTasks = useCallback(async (filters?: { status?: string; priority?: string; module?: string }) => {
    setLoading(true);
    const results = await Promise.allSettled([
      intelligenceApi.getMyTasks(filters?.status, filters?.priority, filters?.module, 1, 200) as any,
      intelligenceApi.getMyPendingTasks() as any,
    ]);

    const personalRes = results[0].status === 'fulfilled' ? results[0].value : null;
    const pendingRes = results[1].status === 'fulfilled' ? results[1].value : null;

    const personalRows = personalRes?.data?.rows;
    const personalTasks: TaskItem[] = Array.isArray(personalRows)
      ? personalRows.map((t: any) => ({ ...t, source: 'personal' as const }))
      : [];

    const pendingData = pendingRes?.code === 200 ? pendingRes.data : (pendingRes?.data || pendingRes);
    const pendingItems: PendingTaskDTO[] = Array.isArray(pendingData) ? pendingData : [];
    const pendingTasks: TaskItem[] = pendingItems
      .filter((p: PendingTaskDTO) => p.taskStatus !== 'completed')
      .map(mapPendingToTaskItem);

    const existingSysIds = new Set(pendingTasks.map(t => t.id));
    const merged = [...pendingTasks, ...personalTasks.filter(t => !existingSysIds.has(t.id))];

    if (filters?.status) {
      setTasks(merged.filter(t => t.status === filters.status));
    } else {
      setTasks(merged);
    }
    setLoading(false);
  }, []);

  const createTask = useCallback(async (data: {
    title: string; description?: string; priority?: string; module?: string; orderNo?: string; styleNo?: string; endTime?: string;
  }) => {
    await (intelligenceApi.createTask(data as Record<string, unknown>) as any);
    await fetchTasks();
  }, [fetchTasks]);

  const updateTask = useCallback(async (taskId: string, data: Record<string, unknown>) => {
    await (intelligenceApi.updateTask(taskId, data) as any);
    await fetchTasks();
  }, [fetchTasks]);

  const deleteTask = useCallback(async (taskId: string) => {
    await (intelligenceApi.deleteTask(taskId) as any);
    await fetchTasks();
  }, [fetchTasks]);

  const claimTask = useCallback(async (taskId: string) => {
    await (intelligenceApi.claimTask(taskId) as any);
    await fetchTasks();
  }, [fetchTasks]);

  const completeTask = useCallback(async (taskId: string) => {
    await (intelligenceApi.updateTaskStatus(taskId, 'COMPLETED') as any);
    await fetchTasks();
  }, [fetchTasks]);

  const startPolling = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => { void fetchTasks(); }, POLL_INTERVAL);
  }, [fetchTasks]);

  const stopPolling = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    highPriority: tasks.filter(t => t.priority === 'high').length,
  };

  return { tasks, loading, stats, fetchTasks, createTask, updateTask, deleteTask, claimTask, completeTask, startPolling, stopPolling };
}