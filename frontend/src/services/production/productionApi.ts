import api from '../../utils/api';
import type { ProductionQueryParams, PatternDevelopmentStats } from '../../types/production';

export type ProductionOrderListParams = ProductionQueryParams & {
  startDate?: string;
  endDate?: string;
};

export const productionOrderApi = {
  list: (params: ProductionOrderListParams) => api.get<{ code: number; data: { records: unknown[]; total: number } }>('/production/order/list', { params }),
  // detail 已废弃，统一使用 list({ orderNo: 'xxx' }) 查询单个订单
  close: (id: string, sourceModule: string, remark?: string) => api.post<{ code: number; message: string; data: boolean }>('/production/order/close', { id, sourceModule, remark }),
  updateProgress: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: boolean }>('/production/order/update-progress', payload),
  saveProgressWorkflow: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: boolean }>('/production/order/progress-workflow/lock', payload),
  rollbackProgressWorkflow: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: boolean }>('/production/order/progress-workflow/rollback', payload),
  quickEdit: (payload: Record<string, unknown>) => api.put<{ code: number; message: string; data: unknown }>('/production/order/quick-edit', payload),
  // 节点操作记录 API
  getNodeOperations: (id: string) => api.get<{ code: number; data: string }>(`/production/order/node-operations/${encodeURIComponent(id)}`),
  saveNodeOperations: (id: string, nodeOperations: string) => api.post<{ code: number; message: string }>('/production/order/node-operations', { id, nodeOperations }),
};

export const productionCuttingApi = {
  list: (params: unknown) => api.get<{ code: number; data: { records: unknown[]; total: number } }>('/production/cutting/list', { params }),
  getByCode: (qrCode: string) => api.get<{ code: number; data: unknown }>(`/production/cutting/by-code/${encodeURIComponent(String(qrCode || '').trim())}`),
  listBundles: (orderId: any) => api.get<any>(`/production/cutting/bundles/${encodeURIComponent(String(orderId || '').trim())}`),
};

export const productionScanApi = {
  execute: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: unknown }>('/production/scan/execute', payload),
  listByOrderId: (orderId: string, params: Record<string, unknown>) => api.get<{ code: number; data: unknown[] }>(`/production/scan/order/${encodeURIComponent(String(orderId || '').trim())}`, { params }),
  create: (payload: any) => api.post<any>('/production/scan/execute', payload),
  rollback: (orderId: any, payload?: any) => api.post<any>('/production/scan/rollback', { orderId, ...(payload || {}) }),
};

export const productionWarehousingApi = {
  rollbackByBundle: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: boolean }>('/production/warehousing/rollback-by-bundle', payload),
};

export const patternProductionApi = {
  // 获取样衣开发费用统计
  getDevelopmentStats: (rangeType: 'day' | 'week' | 'month' = 'day') =>
    api.get<{ code: number; data: PatternDevelopmentStats }>('/production/pattern/development-stats', {
      params: { rangeType },
    }),
};

export default {
  productionOrderApi,
  productionCuttingApi,
  productionScanApi,
  productionWarehousingApi,
  patternProductionApi,
};
