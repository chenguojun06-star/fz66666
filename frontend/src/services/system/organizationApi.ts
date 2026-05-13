import api from '@/utils/api';
import type { OrganizationUnit, User } from '@/types/system';

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
    const res = await api.get<any>('/system/organization/tree');
    const list = Array.isArray(res) ? res : (res?.data || []);
    return Array.isArray(list) ? list.map(transform) : [];
  },
  departments: async () => {
    const res = await api.get<any>('/system/organization/departments');
    const list = Array.isArray(res) ? res : (res?.data || []);
    return Array.isArray(list) ? list.map(transform) : [];
  },
  externalTree: async () => {
    const res = await api.get<any>('/system/organization/external-tree');
    const list = Array.isArray(res) ? res : (res?.data || []);
    return Array.isArray(list) ? list.map(transform) : [];
  },
  members: async () => {
    const res = await api.get<any>('/system/organization/members');
    return (res?.data || res) as Record<string, User[]>;
  },
  assignableUsers: async () => {
    const res = await api.get<any>('/system/organization/assignable-users');
    return (Array.isArray(res) ? res : (res?.data || [])) as User[];
  },
  assignMember: (userId: string, orgUnitId: string) =>
    api.post<void>('/system/organization/assign-member', { userId, orgUnitId }),
  batchAssignMembers: (userIds: string[], orgUnitId: string) =>
    api.post<number>('/system/organization/assign-members', { userIds, orgUnitId }),
  removeMember: (userId: string, remark?: string) =>
    api.post<void>('/system/organization/remove-member', { userId, remark }),
  setFactoryOwner: (userId: string, factoryId: string) =>
    api.post<void>('/system/organization/factory/set-owner', { userId, factoryId }),
  setManager: (unitId: string, managerUserId: string) =>
    api.post<boolean>(`/system/organization/${unitId}/set-manager`, { managerUserId }),
  create: (payload: Partial<OrganizationUnit>) => api.post<boolean>('/system/organization', revert(payload)),
  update: (payload: Partial<OrganizationUnit>) => api.put<boolean>('/system/organization', revert(payload)),
  delete: (id: string, remark: string) => api.delete<boolean>(`/system/organization/${id}`, { params: { remark } }),
  initTemplate: (templateType: string, rootName: string, factoryId?: string) =>
    api.post<void>('/system/organization/init-template', { templateType, rootName, factoryId }),
  adminResetMemberPwd: (userId: string, newPassword: string) =>
    api.post<void>('/system/user/admin-reset-member-pwd', { userId, newPassword }),
  ownerResetMemberPwd: (userId: string) =>
    api.post<void>('/system/user/owner-reset-member-pwd', { userId }),
};

export default organizationApi;
