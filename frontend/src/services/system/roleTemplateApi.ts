import api from '@/utils/api';

export interface RoleTemplate {
  id: number;
  templateCode: string;
  templateName: string;
  templateDesc: string;
  category: string;
  permissionsJson: string;
  permissionRange: string;
  isDefault: boolean;
}

export interface NewTenantCheckResult {
  isNewTenant: boolean;
  roleCount: number;
  recommendedTemplates: RoleTemplate[];
}

export interface QuickSetupResult {
  createdCount: number;
  createdRoleIds: number[];
}

export const roleTemplateApi = {
  list: () => api.get<{ code: number; data: RoleTemplate[]; message?: string }>('/role-template/list'),

  getById: (id: number) => api.get<{ code: number; data: RoleTemplate; message?: string }>(`/role-template/${id}`),

  checkNewTenant: () =>
    api.get<{ code: number; data: NewTenantCheckResult; message?: string }>('/role-template/check-new-tenant'),

  quickSetup: (templateIds: number[]) =>
    api.post<{ code: number; data: QuickSetupResult; message?: string }>('/role-template/quick-setup', templateIds),
};
