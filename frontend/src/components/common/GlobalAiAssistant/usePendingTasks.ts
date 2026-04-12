import { useState, useEffect, useCallback, useRef } from 'react';
import { intelligenceApi, type PendingTaskDTO } from '@/services/intelligence/intelligenceApi';

const POLL_INTERVAL = 60_000; // 每60秒轮询一次

export interface UsePendingTasksResult {
  tasks: PendingTaskDTO[];
  highPriorityCount: number;
  totalCount: number;
  refresh: () => void;
}

export function usePendingTasks(): UsePendingTasksResult {
  const [tasks, setTasks] = useState<PendingTaskDTO[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await intelligenceApi.getMyPendingTasks();
      // api拦截器会自动解包 .data，兼容两种响应结构
      const data: PendingTaskDTO[] = (res as any)?.code === 200
        ? (res as any).data
        : ((res as any)?.data ?? res ?? []);
      setTasks(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[usePendingTasks] fetch failed', e);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
    timerRef.current = setInterval(() => void fetchTasks(), POLL_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchTasks]);

  return {
    tasks,
    highPriorityCount: tasks.filter(t => t.priority === 'high').length,
    totalCount: tasks.length,
    refresh: fetchTasks,
  };
}
