import request from '@/utils/api';

// ── 选品批次 ────────────────────────────────────────────────────────────────
export const selectionBatchList = (params: Record<string, unknown>) =>
  request.post('/api/selection/batch/list', params);

export const selectionBatchSave = (data: Record<string, unknown>) =>
  request.post('/api/selection/batch/save', data);

export const selectionBatchUpdate = (id: number, data: Record<string, unknown>) =>
  request.post(`/api/selection/batch/update/${id}`, data);

export const selectionBatchStageAction = (id: number, action: string) =>
  request.post(`/api/selection/batch/${id}/stage-action?action=${action}`);

export const selectionBatchDelete = (id: number) =>
  request.post(`/api/selection/batch/delete/${id}`);

// ── 候选款 ──────────────────────────────────────────────────────────────────
export const candidateList = (params: Record<string, unknown>) =>
  request.post('/api/selection/candidate/list', params);

export const candidateSave = (data: Record<string, unknown>) =>
  request.post('/api/selection/candidate/save', data);

export const candidateUpdate = (id: number, data: Record<string, unknown>) =>
  request.post(`/api/selection/candidate/update/${id}`, data);

export const candidateReview = (data: Record<string, unknown>) =>
  request.post('/api/selection/candidate/review', data);

export const candidateGetReviews = (id: number) =>
  request.get(`/api/selection/candidate/${id}/reviews`);

export const candidateStageAction = (id: number, action: string, reason?: string) =>
  request.post(
    `/api/selection/candidate/${id}/stage-action?action=${action}${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`
  );

export const candidateCreateStyle = (id: number) =>
  request.post(`/api/selection/candidate/${id}/create-style`);

export const candidateAiScore = (id: number) =>
  request.post(`/api/selection/candidate/${id}/ai-score`);

export const candidateDelete = (id: number) =>
  request.post(`/api/selection/candidate/delete/${id}`);

// ── 趋势与历史分析 ────────────────────────────────────────────────────────────
export const trendLatest = (params?: Record<string, unknown>) =>
  request.get('/api/selection/trend/latest', { params });

export const trendAddManual = (data: Record<string, unknown>) =>
  request.post('/api/selection/trend/manual', data);

export const historyList = (data?: Record<string, unknown>) =>
  request.post('/api/selection/trend/history/list', data ?? {});

export const topStyles = (top = 20) =>
  request.get(`/api/selection/trend/top-styles?top=${top}`);

export const aiSuggestion = (data: Record<string, unknown>) =>
  request.post('/api/selection/trend/ai-suggestion', data);
