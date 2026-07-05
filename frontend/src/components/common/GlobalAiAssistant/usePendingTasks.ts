import { useState, useEffect, useCallback, useRef } from 'react';
import { intelligenceApi, type PendingTaskDTO } from '@/services/intelligence/intelligenceApi';
import { useAuthState } from '@/utils/AuthContext';

const POLL_INTERVAL = 60_000;
const MAX_BACKOFF = 5 * 60_000;
const MAX_FAIL_COUNT = 5;

export interface UsePendingTasksResult {
  tasks: PendingTaskDTO[];
  highPriorityCount: number;
  totalCount: number;
  refresh: () => void;
}

export function usePendingTasks(): UsePendingTasksResult {
  const [tasks, setTasks] = useState<PendingTaskDTO[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failCountRef = useRef(0);
  const { isAuthenticated } = useAuthState();

  const fetchTasks = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await intelligenceApi.getMyPendingTasks();
      const data: PendingTaskDTO[] = (res as any)?.code === 200
        ? (res as any).data
        : ((res as any)?.data ?? res ?? []);
      setTasks(Array.isArray(data) ? data : []);
      failCountRef.current = 0;
    } catch {
      failCountRef.current += 1;
    }
  }, [isAuthenticated]);

  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (failCountRef.current >= MAX_FAIL_COUNT) return;
    const delay = failCountRef.current === 0
      ? POLL_INTERVAL
      : Math.min(POLL_INTERVAL * Math.pow(2, failCountRef.current - 1), MAX_BACKOFF);
    timerRef.current = setTimeout(() => {
      void fetchTasks().then(scheduleNext);
    }, delay);
  }, [fetchTasks]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void fetchTasks().then(scheduleNext);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchTasks, scheduleNext, isAuthenticated]);

  return {
    tasks,
    highPriorityCount: tasks.filter(t => t.priority === 'high').length,
    totalCount: tasks.length,
    refresh: fetchTasks,
  };
}
