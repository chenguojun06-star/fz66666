import api from '../../utils/api';

export const styleProcessApi = {
  listByStyleId: (styleId: string) => api.get<{ code: number; data: unknown[] }>('/style/process/list', { params: { styleId } }),
};

export default {
  styleProcessApi,
};

