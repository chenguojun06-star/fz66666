import api from '../../utils/api';

const BASE = '/warehouse/inventory-check';

export const inventoryCheckApi = {
  create: (params: Record<string, unknown>) =>
    api.post(`${BASE}/create`, params),

  fillActual: (params: { checkId: string; items: Array<{ itemId: string; actualQuantity: number }> }) =>
    api.post(`${BASE}/fill-actual`, params),

  confirm: (checkId: string) =>
    api.post(`${BASE}/confirm/${checkId}`),

  cancel: (checkId: string) =>
    api.post(`${BASE}/cancel/${checkId}`),

  list: (params: Record<string, unknown>) =>
    api.post(`${BASE}/list`, params),

  detail: (checkId: string) =>
    api.get(`${BASE}/detail/${checkId}`),

  summary: () =>
    api.get(`${BASE}/summary`),
};

export const warehouseOperationApi = {
  freeInbound: (params: Record<string, unknown>) =>
    api.post('/warehouse/operation/free-inbound', params),

  freeOutbound: (params: Record<string, unknown>) =>
    api.post('/warehouse/operation/free-outbound', params),

  scanInbound: (params: Record<string, unknown>) =>
    api.post('/warehouse/operation/scan-inbound', params),

  scanOutbound: (params: Record<string, unknown>) =>
    api.post('/warehouse/operation/scan-outbound', params),

  scanQuery: (scanCode: string, warehouseType?: string) =>
    api.get('/warehouse/operation/scan-query', { params: { scanCode, warehouseType: warehouseType || 'finished' } }),
};
