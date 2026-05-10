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

export const finishedWarehouseApi = {
  freeInbound: (params: Record<string, unknown>) =>
    api.post('/warehouse/finished-inventory/free-inbound', params),

  freeOutbound: (params: Record<string, unknown>) =>
    api.post('/warehouse/finished-inventory/free-outbound', params),

  scanInbound: (params: Record<string, unknown>) =>
    api.post('/warehouse/finished-inventory/scan-inbound', params),

  scanOutbound: (params: Record<string, unknown>) =>
    api.post('/warehouse/finished-inventory/scan-outbound', params),

  scanQuery: (scanCode: string) =>
    api.get('/warehouse/finished-inventory/scan-query', { params: { scanCode } }),
};

export const materialWarehouseApi = {
  freeInbound: (params: Record<string, unknown>) =>
    api.post('/production/material/stock/free-inbound', params),

  freeOutbound: (params: Record<string, unknown>) =>
    api.post('/production/material/stock/free-outbound', params),

  scanInbound: (params: Record<string, unknown>) =>
    api.post('/production/material/stock/scan-inbound', params),

  scanOutbound: (params: Record<string, unknown>) =>
    api.post('/production/material/stock/scan-outbound', params),

  scanQuery: (materialCode: string) =>
    api.get('/production/material/stock/scan-query', { params: { materialCode } }),
};
