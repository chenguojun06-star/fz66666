import api, { unwrapApiData } from '../utils/api';

const BASE = '/system/tenant-app';

// ========== 类型定义 ==========

export interface TenantAppInfo {
  id: string;
  tenantId: number;
  appName: string;
  appType: string;
  appTypeName: string;
  appKey: string;
  appSecret: string;
  status: string;
  statusName: string;
  callbackUrl?: string;
  callbackSecret?: string;
  externalApiUrl?: string;
  configJson?: string;
  dailyQuota: number;
  dailyUsed: number;
  totalCalls: number;
  lastCallTime?: string;
  expireTime?: string;
  createTime: string;
  remark?: string;
  exampleSnippet?: string;
}

export interface TenantAppLogInfo {
  id: string;
  appId: string;
  tenantId: number;
  appType: string;
  direction: string;
  httpMethod: string;
  requestPath: string;
  requestBody?: string;
  responseCode: number;
  responseBody?: string;
  costMs: number;
  result: string;
  errorMessage?: string;
  clientIp: string;
  createTime: string;
}

export interface CreateAppRequest {
  appName: string;
  appType: string;
  callbackUrl?: string;
  externalApiUrl?: string;
  dailyQuota?: number;
  configJson?: string;
  expireTime?: string;
  remark?: string;
}

export interface AppTypeOption {
  value: string;
  label: string;
}

export interface AppStats {
  total: number;
  active: number;
  disabled: number;
  totalCalls: number;
  byType: Record<string, number>;
}

// ========== API 方法 ==========

const tenantAppService = {
  /** 创建应用（返回含明文密钥） */
  createApp: async (data: CreateAppRequest): Promise<TenantAppInfo> =>
    unwrapApiData<TenantAppInfo>(await api.post(`${BASE}/create`, data), '应用请求失败'),

  /** 查询应用列表 */
  listApps: async (params: { appType?: string; status?: string; page?: number; size?: number }): Promise<{ records: TenantAppInfo[]; total: number }> =>
    unwrapApiData<{ records: TenantAppInfo[]; total: number }>(await api.post(`${BASE}/list`, params), '应用请求失败'),

  /** 获取应用详情 */
  getAppDetail: async (id: string): Promise<TenantAppInfo> =>
    unwrapApiData<TenantAppInfo>(await api.get(`${BASE}/${id}`), '应用请求失败'),

  /** 更新应用配置 */
  updateApp: async (id: string, data: Partial<CreateAppRequest>): Promise<TenantAppInfo> =>
    unwrapApiData<TenantAppInfo>(await api.put(`${BASE}/${id}`, data), '应用请求失败'),

  /** 切换状态（启用/停用） */
  toggleStatus: async (id: string): Promise<TenantAppInfo> =>
    unwrapApiData<TenantAppInfo>(await api.post(`${BASE}/${id}/toggle-status`), '应用请求失败'),

  /** 重置密钥 */
  resetSecret: async (id: string): Promise<TenantAppInfo> =>
    unwrapApiData<TenantAppInfo>(await api.post(`${BASE}/${id}/reset-secret`), '应用请求失败'),

  /** 删除应用 */
  deleteApp: async (id: string): Promise<void> =>
    unwrapApiData<void>(await api.delete(`${BASE}/${id}`), '应用请求失败'),

  /** 获取可用应用类型 */
  getAppTypes: async (): Promise<AppTypeOption[]> =>
    unwrapApiData<AppTypeOption[]>(await api.get(`${BASE}/app-types`), '应用请求失败'),

  /** 获取统计数据 */
  getStats: async (): Promise<AppStats> =>
    unwrapApiData<AppStats>(await api.get(`${BASE}/stats`), '应用请求失败'),

  /** 查询调用日志 */
  listLogs: async (appId: string, params: { page?: number; size?: number }): Promise<{ records: TenantAppLogInfo[]; total: number }> =>
    unwrapApiData<{ records: TenantAppLogInfo[]; total: number }>(await api.post(`${BASE}/${appId}/logs`, params), '应用请求失败'),

  /** 查询所有应用日志（集成总览用） */
  listAllLogs: async (params: { page?: number; size?: number }): Promise<{ records: TenantAppLogInfo[]; total: number }> =>
    unwrapApiData<{ records: TenantAppLogInfo[]; total: number }>(await api.post(`${BASE}/all-logs`, params), '应用请求失败'),

  /** 获取集成总览数据 */
  getIntegrationOverview: async (): Promise<IntegrationOverview> =>
    unwrapApiData<IntegrationOverview>(await api.get(`${BASE}/integration-overview`), '应用请求失败'),
};

// ========== 集成总览类型 ==========
export interface IntegrationModuleInfo {
  appType: string;
  appTypeName: string;
  viewPage: string;
  viewPath: string;
  activeApps: number;
  connected: boolean;
  totalCalls: number;
  lastCallTime?: string;
}

export interface IntegrationOverview {
  modules: IntegrationModuleInfo[];
  totalApps: number;
  activeApps: number;
  totalCalls: number;
  recentLogs: TenantAppLogInfo[];
}

export default tenantAppService;
