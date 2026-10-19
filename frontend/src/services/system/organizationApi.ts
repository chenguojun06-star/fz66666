import api, { unwrapApiData } from '@/utils/api';
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
    const data = await unwrapApiData<any>(await api.get('/system/organization/tree'), '组织架构请求失败');
    const list = Array.isArray(data) ? data : (data?.data || []);
    return Array.isArray(list) ? list.map(transform) : [];
  },
  departments: async () => {
    const data = await unwrapApiData<any>(await api.get('/system/organization/departments'), '组织架构请求失败');
    const list = Array.isArray(data) ? data : (data?.data || []);
    return Array.isArray(list) ? list.map(transform) : [];
  },
  externalTree: async () => {
    const data = await unwrapApiData<any>(await api.get('/system/organization/external-tree'), '组织架构请求失败');
    const list = Array.isArray(data) ? data : (data?.data || []);
    return Array.isArray(list) ? list.map(transform) : [];
  },
  members: async () => {
    const data = await unwrapApiData<any>(await api.get('/system/organization/members'), '组织架构请求失败');
    return (data ?? {}) as Record<string, User[]>;
  },
  assignableUsers: async () => {
    const data = await unwrapApiData<any>(await api.get('/system/organization/assignable-users'), '组织架构请求失败');
    return (Array.isArray(data) ? data : []) as User[];
  },
  assignMember: async (userId: string, orgUnitId: string) =>
    unwrapApiData<void>(await api.post('/system/organization/assign-member', { userId, orgUnitId }), '组织架构请求失败'),
  batchAssignMembers: async (userIds: string[], orgUnitId: string) =>
    unwrapApiData<number>(await api.post('/system/organization/assign-members', { userIds, orgUnitId }), '组织架构请求失败'),
  removeMember: async (userId: string, remark?: string) =>
    unwrapApiData<void>(await api.post('/system/organization/remove-member', { userId, remark }), '组织架构请求失败'),
  setFactoryOwner: async (userId: string, factoryId: string) =>
    unwrapApiData<void>(await api.post('/system/organization/factory/set-owner', { userId, factoryId }), '组织架构请求失败'),
  setManager: async (unitId: string, managerUserId: string) =>
    unwrapApiData<boolean>(await api.post(`/system/organization/${unitId}/set-manager`, { managerUserId }), '组织架构请求失败'),
  create: async (payload: Partial<OrganizationUnit>) => unwrapApiData<boolean>(await api.post('/system/organization', revert(payload)), '组织架构请求失败'),
  update: async (payload: Partial<OrganizationUnit>) => unwrapApiData<boolean>(await api.put('/system/organization', revert(payload)), '组织架构请求失败'),
  delete: async (id: string, remark: string) => unwrapApiData<boolean>(await api.delete(`/system/organization/${id}`, { params: { remark } }), '组织架构请求失败'),
  initTemplate: async (templateType: string, rootName: string, factoryId?: string) =>
    unwrapApiData<void>(await api.post('/system/organization/init-template', { templateType, rootName, factoryId }), '组织架构请求失败'),
  adminResetMemberPwd: async (userId: string, newPassword: string) =>
    unwrapApiData<void>(await api.post('/system/user/admin-reset-member-pwd', { userId, newPassword }), '组织架构请求失败'),
  ownerResetMemberPwd: async (userId: string) =>
    unwrapApiData<void>(await api.post('/system/user/owner-reset-member-pwd', { userId }), '组织架构请求失败'),
};

export default organizationApi;
