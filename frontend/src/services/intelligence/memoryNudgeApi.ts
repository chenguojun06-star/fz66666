import api from '@/utils/api';
import { unwrapApiData } from '@/utils/api/core';

export interface MemoryNudgeItem {
  id: string;
  title?: string;
  content?: string;
  confidence?: number;
  status?: string;
  createdAt?: string;
}

export const memoryNudgeApi = {
  pending: async (): Promise<MemoryNudgeItem[]> =>
    unwrapApiData<MemoryNudgeItem[]>(await api.get('/intelligence/memory-nudge/pending'), '记忆提醒请求失败') ?? [],

  accept: async (id: string): Promise<boolean> => {
    await unwrapApiData<any>(await api.post(`/intelligence/memory-nudge/${id}/accept`), '采纳失败');
    return true;
  },

  dismiss: async (id: string): Promise<boolean> => {
    await unwrapApiData<any>(await api.post(`/intelligence/memory-nudge/${id}/dismiss`), '忽略失败');
    return true;
  },
};