import api from '@/utils/api';
import { unwrapApiData } from '@/utils/api/core';

export interface RiskTrackingItem {
  id: number;
  orderNo: string;
  riskLevel: string;
  riskFactors?: string;
  handlingStatus: string;
  assignedTo?: string;
  handlingAction?: string;
  handlingResult?: string;
  createdAt?: string;
}

export const riskTrackingApi = {
  list: async (): Promise<RiskTrackingItem[]> =>
    unwrapApiData<RiskTrackingItem[]>(await api.get('/intelligence/risk-tracking/list'), '风险列表请求失败') ?? [],

  stats: async (days = 30): Promise<any> =>
    unwrapApiData<any>(await api.get('/intelligence/risk-tracking/stats', { params: { days } }), '风险统计请求失败'),

  resolve: async (id: number, action: string, result: string): Promise<any> =>
    unwrapApiData<any>(await api.post(`/intelligence/risk-tracking/${id}/resolve`, { handlingAction: action, handlingResult: result }), '风险处理请求失败'),

  escalate: async (id: number, assignedTo: string): Promise<any> =>
    unwrapApiData<any>(await api.post(`/intelligence/risk-tracking/${id}/escalate`, { assignedTo }), '风险升级请求失败'),

  clear: async (id: number, reason: string): Promise<any> =>
    unwrapApiData<any>(await api.post(`/intelligence/risk-tracking/${id}/clear`, { reason }), '风险撤销请求失败'),

  reopen: async (id: number, reason: string): Promise<any> =>
    unwrapApiData<any>(await api.post(`/intelligence/risk-tracking/${id}/reopen`, { reason }), '风险重开请求失败'),
};