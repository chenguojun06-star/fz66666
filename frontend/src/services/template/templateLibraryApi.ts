import api, { unwrapApiData } from '../../utils/api';

export const templateLibraryApi = {
  getById: async (id: string): Promise<unknown> =>
    unwrapApiData<unknown>(
      await api.get(`/template-library/${encodeURIComponent(String(id || '').trim())}`),
      '模板库请求失败',
    ),
  list: async (params: unknown): Promise<{ records: unknown[]; total: number }> =>
    unwrapApiData<{ records: unknown[]; total: number }>(
      await api.get('/template-library/list', { params }),
      '模板库请求失败',
    ),
  listByType: async (type: string): Promise<unknown[]> =>
    unwrapApiData<unknown[]>(
      await api.get(`/template-library/type/${encodeURIComponent(String(type || '').trim())}`),
      '模板库请求失败',
    ),
  progressNodeUnitPrices: async (styleNo: string): Promise<unknown[]> =>
    unwrapApiData<unknown[]>(
      await api.get('/template-library/progress-node-unit-prices', { params: { styleNo } }),
      '模板库请求失败',
    ),
};

export default {
  templateLibraryApi,
};
