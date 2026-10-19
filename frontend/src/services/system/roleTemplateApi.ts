import api, { unwrapApiData } from '@/utils/api';

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
  list: async () => unwrapApiData<RoleTemplate[]>(await api.get('/role-template/list'), '角色模板请求失败'),

  getById: async (id: number) => unwrapApiData<RoleTemplate>(await api.get(`/role-template/${id}`), '角色模板请求失败'),

  checkNewTenant: async () =>
    unwrapApiData<NewTenantCheckResult>(await api.get('/role-template/check-new-tenant'), '角色模板请求失败'),

  quickSetup: async (templateIds: number[]) =>
    unwrapApiData<QuickSetupResult>(await api.post('/role-template/quick-setup', templateIds), '角色模板请求失败'),
};
