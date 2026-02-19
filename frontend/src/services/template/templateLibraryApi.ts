import api from '../../utils/api';

export const templateLibraryApi = {
  getById: (id: string) => api.get<{ code: number; data: any }>(`/template-library/${encodeURIComponent(String(id || '').trim())}`),
  list: (params: unknown) => api.get<{ code: number; data: { records: unknown[]; total: number } }>('/template-library/list', { params }),
  listByType: (type: string) => api.get<{ code: number; data: any[] }>(`/template-library/type/${encodeURIComponent(String(type || '').trim())}`),
  progressNodeUnitPrices: (styleNo: string) =>
    api.get<{ code: number; data: any[] }>('/template-library/progress-node-unit-prices', { params: { styleNo } }),
};

export default {
  templateLibraryApi,
};
