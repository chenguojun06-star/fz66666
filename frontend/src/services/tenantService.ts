import api from '../utils/api';

const BASE = '/system/tenant';

export interface RoleTemplate {
  id: number;
  roleName: string;
  roleCode: string;
  description: string;
  status: string;
  sortOrder: number;
  permissionCount: number;
  isTemplate: boolean;
}

export interface TenantInfo {
  id: number;
  tenantName: string;
  tenantCode: string;
  contactName: string;
  contactPhone: string;
  status: string;
  paidStatus: string;
  maxUsers: number;
  ownerUserId: number;
  ownerUsername?: string;
  applyUsername?: string;
  remark?: string;
  createTime: string;
}

export interface TenantUser {
  id: number;
  username: string;
  name: string;
  roleId: number;
  roleName: string;
  phone: string;
  status: string;
  registrationStatus: string;
  createTime: string;
  tenantId?: number;
  tenantName?: string;
}

export interface PermissionNode {
  id: number;
  permissionName: string;
  permissionCode: string;
  parentId: number;
  permissionType: string;
}

const tenantService = {
  // ========== 超级管理员：租户管理 ==========
  createTenant: (data: Record<string, unknown>) => api.post(`${BASE}/create`, data),
  listTenants: (params: Record<string, unknown>) => api.post(`${BASE}/list`, params),
  updateTenant: (id: number, data: Record<string, unknown>) => api.put(`${BASE}/${id}`, data),
  toggleTenantStatus: (id: number, status: string) => api.post(`${BASE}/${id}/toggle-status`, { status }),
  approveApplication: (id: number) => api.post(`${BASE}/${id}/approve-application`, {}),
  rejectApplication: (id: number, reason?: string) => api.post(`${BASE}/${id}/reject-application`, { reason }),
  updateApplication: (id: number, data: { applyUsername?: string; contactName?: string; contactPhone?: string }) =>
    api.post(`${BASE}/${id}/update-application`, data),
  markTenantPaid: (id: number, paidStatus: string) => api.post(`${BASE}/${id}/mark-paid`, { paidStatus }),

  // ========== 子账号管理 ==========
  addSubAccount: (data: Record<string, unknown>) => api.post(`${BASE}/sub/add`, data),
  listSubAccounts: (params: Record<string, unknown>) => api.post(`${BASE}/sub/list`, params),
  updateSubAccount: (id: number, data: Record<string, unknown>) => api.put(`${BASE}/sub/${id}`, data),
  deleteSubAccount: (id: number) => api.delete(`${BASE}/sub/${id}`),

  // ========== 当前租户 ==========
  myTenant: () => api.get(`${BASE}/my`),
  updateMyTenantInfo: (data: { tenantName?: string; contactName?: string; contactPhone?: string }) =>
    api.put(`${BASE}/my/info`, data),

  // ========== 角色模板 ==========
  listRoleTemplates: () => api.get(`${BASE}/role-templates`),
  cloneRoleTemplate: (tenantId: number, templateId: number) =>
    api.post(`${BASE}/roles/clone`, { tenantId, templateId }),
  listTenantRoles: (tenantId: number) => api.get(`${BASE}/roles/${tenantId}`),
  updateTenantRolePermissions: (roleId: number, permissionIds: number[]) =>
    api.post(`${BASE}/roles/${roleId}/permissions`, { permissionIds }),

  // ========== 权限天花板 ==========
  getTenantCeiling: (tenantId: number) => api.get(`${BASE}/ceiling/${tenantId}`),
  setTenantCeiling: (tenantId: number, grantedPermissionIds: number[]) =>
    api.post(`${BASE}/ceiling/${tenantId}`, { grantedPermissionIds }),

  // ========== 密码管理 ==========
  resetTenantOwnerPassword: (tenantId: number, newPassword: string) =>
    api.post('/system/user/reset-tenant-owner-password', { tenantId, newPassword }),

  // ========== 工人注册审批 ==========
  workerRegister: (data: Record<string, string>) => api.post(`${BASE}/registration/register`, data),

  /** 工厂入驻申请（无需登录） */
  applyForTenant: (data: {
    tenantName: string;
    contactName: string;
    contactPhone: string;
    applyUsername: string;
    applyPassword: string;
  }) => api.post(`${BASE}/apply`, data),
  listPendingRegistrations: (params: Record<string, unknown>) =>
    api.post(`${BASE}/registrations/pending`, params),
  approveRegistration: (userId: number, roleId?: number) =>
    api.post(`${BASE}/registrations/${userId}/approve`, { roleId }),
  rejectRegistration: (userId: number, reason: string) =>
    api.post(`${BASE}/registrations/${userId}/reject`, { reason }),

  // ========== 用户权限覆盖 ==========
  getUserPermissionOverrides: (userId: number) => api.get(`${BASE}/user-overrides/${userId}`),
  setUserPermissionOverrides: (userId: number, grantPermissionIds: number[], revokePermissionIds: number[]) =>
    api.post(`${BASE}/user-overrides/${userId}`, { grantPermissionIds, revokePermissionIds }),
};

export default tenantService;
