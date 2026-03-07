import api from '@/utils/api';
import type { OrganizationUnit } from '@/types/system';
import type { User } from '@/types/system';

export const organizationApi = {
  tree: () => api.get<OrganizationUnit[]>('/system/organization/tree'),
  departments: () => api.get<OrganizationUnit[]>('/system/organization/departments'),
  members: () => api.get<Record<string, User[]>>('/system/organization/members'),
  assignableUsers: () => api.get<User[]>('/system/organization/assignable-users'),
  assignMember: (userId: string, orgUnitId: string) =>
    api.post<void>('/system/organization/assign-member', { userId, orgUnitId }),
  removeMember: (userId: string) =>
    api.post<void>('/system/organization/remove-member', { userId }),
  create: (payload: Partial<OrganizationUnit>) => api.post<boolean>('/system/organization', payload),
  update: (payload: Partial<OrganizationUnit>) => api.put<boolean>('/system/organization', payload),
  delete: (id: string, remark: string) => api.delete<boolean>(`/system/organization/${id}`, { params: { remark } }),
  initTemplate: (templateType: string, rootName: string) =>
    api.post<void>('/system/organization/init-template', { templateType, rootName }),
};

export default organizationApi;
