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
  // 保留 category 字段
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
  // category 字段无需特殊处理，直接传递
  return payload;
};

export const organizationApi = {
  tree: async () => {
    const res = await api.get<any>('/system/organization/tree');
    // Handle both wrapped {data: [...]} and unwrapped [...] formats
    const list = Array.isArray(res) ? res : (res?.data || []);
    return Array.isArray(list) ? list.map(transform) : [];
  },
  departments: async () => {
    const res = await api.get<any>('/system/organization/departments');
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
  removeMember: (userId: string) =>
    api.post<void>('/system/organization/remove-member', { userId }),
  /** 设置外发工厂主账号（老板/联系人），同一工厂前一个主账号自动清除 */
  setFactoryOwner: (userId: string, factoryId: string) =>
    api.post<void>('/system/organization/factory/set-owner', { userId, factoryId }),
  create: (payload: Partial<OrganizationUnit>) => api.post<boolean>('/system/organization', revert(payload)),
  update: (payload: Partial<OrganizationUnit>) => api.put<boolean>('/system/organization', revert(payload)),
  delete: (id: string, remark: string) => api.delete<boolean>(`/system/organization/${id}`, { params: { remark } }),
  initTemplate: (templateType: string, rootName: string, factoryId?: string) =>
    api.post<void>('/system/organization/init-template', { templateType, rootName, factoryId }),
};

export default organizationApi;
