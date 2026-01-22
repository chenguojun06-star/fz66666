import api from '../../utils/api';
import type { ProductionQueryParams } from '../../types/production';

export type ProductionOrderListParams = ProductionQueryParams & {
  startDate?: string;
  endDate?: string;
};

export const productionOrderApi = {
  list: (params: ProductionOrderListParams) => api.get<any>('/production/order/list', { params }),
  detail: (orderId: string) => api.get<any>(`/production/order/detail/${encodeURIComponent(String(orderId || '').trim())}`),
  close: (id: string, sourceModule: string) => api.post<any>('/production/order/close', { id, sourceModule }),
  updateProgress: (payload: any) => api.post<any>('/production/order/update-progress', payload),
  saveProgressWorkflow: (payload: any) => api.post<any>('/production/order/progress-workflow/lock', payload),
  rollbackProgressWorkflow: (payload: any) => api.post<any>('/production/order/progress-workflow/rollback', payload),
};

export const productionCuttingApi = {
  list: (params: any) => api.get<any>('/production/cutting/list', { params }),
  getByCode: (qrCode: string) => api.get<any>(`/production/cutting/by-code/${encodeURIComponent(String(qrCode || '').trim())}`),
};

export const productionScanApi = {
  execute: (payload: any) => api.post<any>('/production/scan/execute', payload),
  listByOrderId: (orderId: string, params: any) => api.get<any>(`/production/scan/order/${encodeURIComponent(String(orderId || '').trim())}`, { params }),
};

export const productionWarehousingApi = {
  rollbackByBundle: (payload: any) => api.post<any>('/production/warehousing/rollback-by-bundle', payload),
};

export default {
  productionOrderApi,
  productionCuttingApi,
  productionScanApi,
  productionWarehousingApi,
};
