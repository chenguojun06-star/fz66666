import request from '@/utils/api';

// ── 选品批次 ────────────────────────────────────────────────────────────────
export const selectionBatchList = (params: Record<string, unknown>) =>
  request.post('/selection/batch/list', params);

export const selectionBatchSave = (data: Record<string, unknown>) =>
  request.post('/selection/batch/save', data);

export const selectionBatchUpdate = (id: number, data: Record<string, unknown>) =>
  request.post(`/selection/batch/update/${id}`, data);

export const selectionBatchStageAction = (id: number, action: string) =>
  request.post(`/selection/batch/${id}/stage-action?action=${action}`);

export const selectionBatchDelete = (id: number) =>
  request.post(`/selection/batch/delete/${id}`);

// ── 候选款 ──────────────────────────────────────────────────────────────────
export const candidateList = (params: Record<string, unknown>) =>
  request.post('/selection/candidate/list', params);

export const candidateSave = (data: Record<string, unknown>) =>
  request.post('/selection/candidate/save', data);

export const candidateUpdate = (id: number, data: Record<string, unknown>) =>
  request.post(`/selection/candidate/update/${id}`, data);

export const candidateReview = (data: Record<string, unknown>) =>
  request.post('/selection/candidate/review', data);

export const candidateGetReviews = (id: number) =>
  request.get(`/selection/candidate/${id}/reviews`);

export const candidateStageAction = (id: number, action: string, reason?: string) =>
  request.post(
    `/selection/candidate/${id}/stage-action?action=${action}${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`
  );

export const candidateCreateStyle = (id: number) =>
  request.post(`/selection/candidate/${id}/create-style`);

export const candidateAiScore = (id: number) =>
  request.post(`/selection/candidate/${id}/ai-score`);

export const candidateDelete = (id: number) =>
  request.post(`/selection/candidate/delete/${id}`);

// ── 趋势与历史分析 ────────────────────────────────────────────────────────────
export const trendLatest = (params?: Record<string, unknown>) =>
  request.get('/selection/trend/latest', { params });

export const trendAddManual = (data: Record<string, unknown>) =>
  request.post('/selection/trend/manual', data);

export const historyList = (data?: Record<string, unknown>) =>
  request.post('/selection/trend/history/list', data ?? {});

export const topStyles = (top = 20) =>
  request.get(`/selection/trend/top-styles?top=${top}`);

/** 搜索系统真实款式数据（市场热品数据源） */
export const searchMarketStyles = (params: { keyword?: string; category?: string; limit?: number }) => {
  const qs = new URLSearchParams();
  if (params.keyword) qs.set('keyword', params.keyword);
  if (params.category && params.category !== '全部') qs.set('category', params.category);
  if (params.limit) qs.set('limit', String(params.limit));
  return request.get(`/selection/trend/market/search?${qs.toString()}`);
};

export const aiSuggestion = (data: Record<string, unknown>) =>
  request.post('/selection/trend/ai-suggestion', data);
