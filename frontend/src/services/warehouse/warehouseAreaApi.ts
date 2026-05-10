import api from '../../utils/api';

const BASE = '/warehouse/area';

export const warehouseAreaApi = {
  list: (params: { page?: number; pageSize?: number; warehouseType?: string; status?: string; keyword?: string }) =>
    api.get(`${BASE}/list`, { params }),

  listByType: (warehouseType?: string) =>
    api.get(`${BASE}/list-by-type`, { params: { warehouseType } }),

  create: (data: Record<string, unknown>) =>
    api.post(BASE, data),

  update: (id: string, data: Record<string, unknown>) =>
    api.put(`${BASE}/${id}`, data),

  delete: (id: string) =>
    api.delete(`${BASE}/${id}`),

  quickCreate: (areaName: string, warehouseType: string) =>
    api.post(`${BASE}/quick-create`, { areaName, warehouseType }),

  getDetail: (id: string) =>
    api.get(`${BASE}/${id}`),

  getOverview: () =>
    api.get(`${BASE}/overview`),
};
