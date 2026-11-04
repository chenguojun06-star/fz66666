import type { AxiosRequestConfig } from 'axios';
import api from '@/utils/api';
import { unwrapApiData } from '@/utils/api/core';

/**
 * AI 执行待验证任务（AiTaskTracker）— D-914
 *
 * 与 `/intelligence/task-center/tasks`（业务待办，TaskCenterOrchestrator）是两套东西：
 * 这里记录的是「AI 刚通过工具做了一次写操作，等人确认结果」，由 HighRiskAuditHook 写入。
 */
export interface AiVerifyTask {
  id: number;
  taskSourceTool?: string;
  taskType?: string;
  targetType?: string;
  targetId?: string;
  taskSummary?: string;
  status?: string;
  assignedTo?: string;
  createdAt?: string;
  completedAt?: string;
  resultSummary?: string;
}

export const aiTaskApi = {
  /**
   * 待验证列表。不传 sessionId 时后端按当前登录人（assignedTo）查询——
   * 消息中心没有会话上下文，按人查才是用户真正想看的。
   */
  pending: async (sessionId?: string): Promise<AiVerifyTask[]> => {
    const data = unwrapApiData<AiVerifyTask[]>(
      await api.get('/intelligence/task-center/ai-tasks', {
        params: sessionId ? { sessionId } : undefined,
        retry: 0,
      } as AxiosRequestConfig),
      '待验证任务请求失败',
    );
    // D-290：List 型接口兜底必须带 || []，否则无数据时静默变 undefined
    return Array.isArray(data) ? data : [];
  },

  /** 确认/关闭一条待验证任务 */
  complete: async (taskId: number, note?: string): Promise<boolean> => {
    await unwrapApiData<boolean>(
      await api.post(`/intelligence/task-center/ai-tasks/${taskId}/complete`, null, {
        params: note ? { note } : undefined,
      }),
      '确认失败',
    );
    return true;
  },
};
