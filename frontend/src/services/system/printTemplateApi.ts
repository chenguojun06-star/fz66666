import api from '@/utils/api';

export const printTemplateApi = {
  list: (templateType?: string) => api.get('/system/print-template/list', { params: { templateType } }),
  save: (data: any) => api.post('/system/print-template', data),
  delete: (id: number) => api.delete(`/system/print-template/${id}`),
  setDefault: (id: number) => api.put(`/system/print-template/${id}/set-default`),
};
