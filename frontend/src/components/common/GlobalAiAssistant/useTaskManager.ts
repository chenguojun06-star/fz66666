import { useState, useCallback, useRef } from 'react';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { TaskItem, TaskStatus } from './types';

const POLL_INTERVAL = 30_000;

export function useTaskManager() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTasks = useCallback(async (filters?: { status?: string; priority?: string; module?: string }) => {
    setLoading(true);
    try {
      const res = await intelligenceApi.getMyTasks(filters?.status, filters?.priority, filters?.module, 1, 200) as any;
      const data = res?.data;
      const rows = data?.rows;
      setTasks(Array.isArray(rows) ? rows : []);
    } catch {} finally {
      setLoading(false);
    }
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