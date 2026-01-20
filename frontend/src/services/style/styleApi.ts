import api from '../../utils/api';

export const styleProcessApi = {
  listByStyleId: (styleId: string) => api.get<any>('/style/process/list', { params: { styleId } }),
};

export default {
  styleProcessApi,
};

