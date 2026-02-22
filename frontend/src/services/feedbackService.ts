import api from '../utils/api';

export interface UserFeedback {
  id?: number;
  tenantId?: number;
  userId?: number;
  userName?: string;
  tenantName?: string;
  source: 'PC' | 'MINIPROGRAM';
  category: 'BUG' | 'SUGGESTION' | 'QUESTION' | 'OTHER';
  title: string;
  content: string;
  screenshotUrls?: string;
  contact?: string;
  status?: 'PENDING' | 'PROCESSING' | 'RESOLVED' | 'CLOSED';
  reply?: string;
  replyTime?: string;
  replyUserId?: number;
  createTime?: string;
  updateTime?: string;
}

export interface FeedbackStats {
  total: number;
  pending: number;
  processing: number;
  resolved: number;
}

const BASE = '/system/feedback';

const feedbackService = {
  /** 提交反馈 */
  submit: (data: Partial<UserFeedback>) =>
    api.post(`${BASE}/submit`, { ...data, source: 'PC' }),

  /** 我的反馈列表 */
  myList: (params?: { page?: number; pageSize?: number }) =>
    api.post(`${BASE}/my-list`, params || {}),

  /** 反馈列表（超管） */
  list: (params?: { page?: number; pageSize?: number; status?: string; tenantName?: string; category?: string }) =>
    api.post(`${BASE}/list`, params || {}),

  /** 回复反馈（超管） */
  reply: (id: number, reply: string, status?: string) =>
    api.post(`${BASE}/${id}/reply`, { reply, status }),

  /** 修改状态（超管） */
  updateStatus: (id: number, status: string) =>
    api.post(`${BASE}/${id}/status`, { status }),

  /** 反馈统计（超管） */
  stats: () => api.get(`${BASE}/stats`),
};

export default feedbackService;
