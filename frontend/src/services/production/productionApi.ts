import api from '../../utils/api';
import type { ProductionQueryParams } from '../../types/production';

export type ProductionOrderListParams = ProductionQueryParams & {
  startDate?: string;
  endDate?: string;
};

export const productionOrderApi = {
  list: (params: ProductionOrderListParams) => api.get<{ code: number; data: { records: unknown[]; total: number } }>('/production/order/list', { params }),
  detail: (orderId: string) => api.get<{ code: number; data: unknown }>(`/production/order/detail/${encodeURIComponent(String(orderId || '').trim())}`),
  close: (id: string, sourceModule: string) => api.post<{ code: number; message: string; data: boolean }>('/production/order/close', { id, sourceModule }),
  updateProgress: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: boolean }>('/production/order/update-progress', payload),
  saveProgressWorkflow: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: boolean }>('/production/order/progress-workflow/lock', payload),
  rollbackProgressWorkflow: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: boolean }>('/production/order/progress-workflow/rollback', payload),
  quickEdit: (payload: Record<string, unknown>) => api.put<{ code: number; message: string; data: unknown }>('/production/order/quick-edit', payload),
};

export const productionCuttingApi = {
  list: (params: unknown) => api.get<{ code: number; data: { records: unknown[]; total: number } }>('/production/cutting/list', { params }),
  getByCode: (qrCode: string) => api.get<{ code: number; data: unknown }>(`/production/cutting/by-code/${encodeURIComponent(String(qrCode || '').trim())}`),
};

export const productionScanApi = {
  execute: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: unknown }>('/production/scan/execute', payload),
  listByOrderId: (orderId: string, params: Record<string, unknown>) => api.get<{ code: number; data: unknown[] }>(`/production/scan/order/${encodeURIComponent(String(orderId || '').trim())}`, { params }),
};

export const productionWarehousingApi = {
  rollbackByBundle: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: boolean }>('/production/warehousing/rollback-by-bundle', payload),
};

export default {
  productionOrderApi,
  productionCuttingApi,
  productionScanApi,
  productionWarehousingApi,
};
