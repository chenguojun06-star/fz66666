import api from '@/utils/api';
import type { OrganizationUnit, User } from '@/types/system';

// Helper to rename nodeName -> unitName to avoid DOM collision
export const transform = (unit: any): OrganizationUnit => {
  if (!unit) return unit;
  const newUnit = { ...unit };
  if (newUnit.nodeName && !newUnit.unitName) {
    newUnit.unitName = newUnit.nodeName;
    delete newUnit.nodeName;
  }
  if (Array.isArray(newUnit.children)) {
    newUnit.children = newUnit.children.map(transform);
  }
  return newUnit as OrganizationUnit;
};

// Helper to revert unitName -> nodeName for backend
export const revert = (unit: Partial<OrganizationUnit>): any => {
  const payload: any = { ...unit };
  if (payload.unitName) {
    payload.nodeName = payload.unitName;
    delete payload.unitName;
  }
  return payload;
};

export const organizationApi = {
  tree: async () => {
    const list = await api.get<OrganizationUnit[]>('/system/organization/tree');
    return Array.isArray(list) ? list.map(transform) : [];
  },
  departments: async () => {
    const list = await api.get<OrganizationUnit[]>('/system/organization/departments');
    return Array.isArray(list) ? list.map(transform) : [];
  },
  members: () => api.get<Record<string, User[]>>('/system/organization/members'),
  assignableUsers: () => api.get<User[]>('/system/organization/assignable-users'),
  assignMember: (userId: string, orgUnitId: string) =>
    api.post<void>('/system/organization/assign-member', { userId, orgUnitId }),
  removeMember: (userId: string) =>
    api.post<void>('/system/organization/remove-member', { userId }),
  create: (payload: Partial<OrganizationUnit>) => api.post<boolean>('/system/organization', revert(payload)),
  update: (payload: Partial<OrganizationUnit>) => api.put<boolean>('/system/organization', revert(payload)),
  delete: (id: string, remark: string) => api.delete<boolean>(`/system/organization/${id}`, { params: { remark } }),
  initTemplate: (templateType: string, rootName: string, factoryId?: string) =>
    api.post<void>('/system/organization/init-template', { templateType, rootName, factoryId }),
};

export default organizationApi;
