import { useState, useEffect, useCallback, useRef } from 'react';
import { intelligenceApi, type PendingTaskDTO } from '@/services/intelligence/intelligenceApi';

const POLL_INTERVAL = 60_000;
const MAX_BACKOFF = 5 * 60_000;

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

  const fetchTasks = useCallback(async () => {
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
  }, []);

  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const delay = failCountRef.current === 0
      ? POLL_INTERVAL
      : Math.min(POLL_INTERVAL * Math.pow(2, failCountRef.current - 1), MAX_BACKOFF);
    timerRef.current = setTimeout(() => {
      void fetchTasks().then(scheduleNext);
    }, delay);
  }, [fetchTasks]);

  useEffect(() => {
    void fetchTasks().then(scheduleNext);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchTasks, scheduleNext]);

  return {
    tasks,
    highPriorityCount: tasks.filter(t => t.priority === 'high').length,
    totalCount: tasks.length,
    refresh: fetchTasks,
  };
}
