import request, { unwrapApiData } from '@/utils/api';

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
export const candidateList = async (params: Record<string, unknown>) => {
  const result = await request.post('/selection/candidate/list', params);
  return unwrapApiData(result, '获取候选款列表失败');
};

export const candidateSave = async (data: Record<string, unknown>) => {
  const result = await request.post('/selection/candidate/save', data);
  return unwrapApiData(result, '保存候选款失败');
};

export const candidateUpdate = async (id: number, data: Record<string, unknown>) => {
  const result = await request.post(`/selection/candidate/update/${id}`, data);
  return unwrapApiData(result, '更新候选款失败');
};

export const candidateReview = async (data: Record<string, unknown>) => {
  const result = await request.post('/selection/candidate/review', data);
  return unwrapApiData(result, '提交评审失败');
};

export const candidateGetReviews = async (id: number) => {
  const result = await request.get(`/selection/candidate/${id}/reviews`);
  return unwrapApiData(result, '获取评审记录失败');
};

export const candidateStageAction = async (id: number, action: string, reason?: string) => {
  const result = await request.post(
    `/selection/candidate/${id}/stage-action?action=${action}${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`
  );
  return unwrapApiData(result, '候选款状态更新失败');
};

export const candidateCreateStyle = async (id: number) => {
  const result = await request.post(`/selection/candidate/${id}/create-style`);
  return unwrapApiData(result, '下版到样衣失败');
};

export const candidateAiScore = async (id: number) => {
  const result = await request.post(`/selection/candidate/${id}/ai-score`);
  return unwrapApiData(result, 'AI 评分失败');
};

export const candidateDelete = async (id: number) => {
  const result = await request.post(`/selection/candidate/delete/${id}`);
  return unwrapApiData(result, '删除候选款失败');
};

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

/** 外部市场搜索（SerpApi 多源真实数据聚合） */
export const searchExternalMarket = async (keyword: string, limit = 20) => {
  const result = await request.get(`/selection/trend/market/external?keyword=${encodeURIComponent(keyword)}&limit=${limit}`);
  return unwrapApiData(result, '外部市场搜索失败');
};

/** 今日热榜（系统凌晨 2 点自动拉取多渠道快照，打开页面可直接查看，无需搜索） */
export const fetchDailyHotItems = async () => {
  const result = await request.get('/selection/trend/market/daily-hot');
  return unwrapApiData(result, '获取今日热榜失败');
};

/** 手动刷新今日热榜（管理员/测试用，立即触发拉取） */
export const refreshDailyHotItems = async () => {
  const result = await request.post('/selection/trend/market/daily-hot/refresh');
  return unwrapApiData(result, '刷新今日热榜失败');
};
