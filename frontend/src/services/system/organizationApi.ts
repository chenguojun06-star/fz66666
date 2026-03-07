import api from '@/utils/api';
import type { OrganizationUnit } from '@/types/system';

export const organizationApi = {
  tree: () => api.get<OrganizationUnit[]>('/system/organization/tree'),
  departments: () => api.get<OrganizationUnit[]>('/system/organization/departments'),
  create: (payload: Partial<OrganizationUnit>) => api.post<boolean>('/system/organization', payload),
  update: (payload: Partial<OrganizationUnit>) => api.put<boolean>('/system/organization', payload),
  delete: (id: string, remark: string) => api.delete<boolean>(`/system/organization/${id}`, { params: { remark } }),
};

export default organizationApi;
