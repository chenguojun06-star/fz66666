import api from '../../utils/api';

export const templateLibraryApi = {
  getById: (id: string) => api.get<any>(`/template-library/${encodeURIComponent(String(id || '').trim())}`),
  list: (params: any) => api.get<any>('/template-library/list', { params }),
  listByType: (type: string) => api.get<any>(`/template-library/type/${encodeURIComponent(String(type || '').trim())}`),
  progressNodeUnitPrices: (styleNo: string) =>
    api.get<any>('/template-library/progress-node-unit-prices', { params: { styleNo } }),
};

export default {
  templateLibraryApi,
};
