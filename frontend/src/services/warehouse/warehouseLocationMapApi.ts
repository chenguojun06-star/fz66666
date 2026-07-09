import api from '../../utils/api';

const AREA_BASE = '/warehouse/area';
const LOCATION_BASE = '/warehouse/location';

export const warehouseLocationMapApi = {
  getAreaList: (params?: { page?: number; pageSize?: number; warehouseType?: string; status?: string; keyword?: string }) =>
    api.get(`${AREA_BASE}/list`, { params }),

  getAreaListByType: (warehouseType?: string) =>
    api.post(`${AREA_BASE}/search`, { warehouseType }),

  getAreaOverview: () =>
    api.get(`${AREA_BASE}/overview`),

  getAreaDetail: (id: string) =>
    api.get(`${AREA_BASE}/${id}`),

  updateAreaStatus: (id: string, status: string) =>
    api.put(`${AREA_BASE}/${id}`, { status }),

  quickCreateArea: (areaName: string, warehouseType: string) =>
    api.post(`${AREA_BASE}/quick-create`, { areaName, warehouseType }),

  deleteArea: (id: string, reason: string) =>
    api.delete(`${AREA_BASE}/${id}`, { params: { reason } }),

  getLocationList: (params?: { page?: number; pageSize?: number; locationType?: string; warehouseType?: string; areaId?: string; status?: string; keyword?: string }) =>
    api.get(`${LOCATION_BASE}/list`, { params }),

  getLocationListByType: (warehouseType?: string, areaId?: string) =>
    api.post(`${LOCATION_BASE}/search`, { warehouseType, areaId }),

  createLocation: (data: Record<string, unknown>) =>
    api.post(LOCATION_BASE, data),

  deleteLocation: (id: string, reason: string) =>
    api.delete(`${LOCATION_BASE}/${id}`, { params: { reason } }),

  batchInitLocations: (data: Record<string, unknown>) =>
    api.post(`${LOCATION_BASE}/batch-init`, data),

  getLocationItems: (locationCode: string, warehouseType?: string) =>
    api.get(`${LOCATION_BASE}/items`, { params: { locationCode, warehouseType } }),

  getWarehouseOverview: () =>
    api.get(`${LOCATION_BASE}/overview`),

  transferLocation: (fromLocationCode: string, toLocationCode: string, warehouseType?: string) =>
    api.post(`${LOCATION_BASE}/transfer`, { fromLocationCode, toLocationCode, warehouseType }),
};
