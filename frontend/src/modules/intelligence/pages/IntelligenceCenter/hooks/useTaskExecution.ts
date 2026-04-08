import { useState, useCallback } from 'react';
import { intelligenceApi as execApi } from '@/services/intelligenceApi';

export function useTaskExecution(reload: () => void) {
  const [executingTask, setExecutingTask] = useState<string | null>(null);
  const [executeTaskResult, setExecuteTaskResult] = useState<{ taskCode: string; ok: boolean; msg: string } | null>(null);

  const handleExecuteTask = useCallback(async (task: any) => {
    if (!task?.taskCode) return;
    setExecutingTask(task.taskCode);
    setExecuteTaskResult(null);
    try {
      const result = await execApi.executeCommand(task) as any;
      const ok = result?.status === 'SUCCESS' || result?.success === true || result?.code === 200;
      setExecuteTaskResult({ taskCode: task.taskCode, ok, msg: result?.message || (ok ? '执行成功' : '执行失败') });
      if (ok) reload();
    } catch (err: unknown) {
      setExecuteTaskResult({ taskCode: task.taskCode, ok: false, msg: err instanceof Error ? err.message : '执行失败' });
    } finally {
      setExecutingTask(null);
    }
  }, [reload]);

  return { executingTask, executeTaskResult, handleExecuteTask };
}
