import api from '../utils/api';

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
  createApp: (data: CreateAppRequest) =>
    api.post<TenantAppInfo>(`${BASE}/create`, data),

  /** 查询应用列表 */
  listApps: (params: { appType?: string; status?: string; page?: number; size?: number }) =>
    api.post(`${BASE}/list`, params),

  /** 获取应用详情 */
  getAppDetail: (id: string) =>
    api.get<TenantAppInfo>(`${BASE}/${id}`),

  /** 更新应用配置 */
  updateApp: (id: string, data: Partial<CreateAppRequest>) =>
    api.put<TenantAppInfo>(`${BASE}/${id}`, data),

  /** 切换状态（启用/停用） */
  toggleStatus: (id: string) =>
    api.post<TenantAppInfo>(`${BASE}/${id}/toggle-status`),

  /** 重置密钥 */
  resetSecret: (id: string) =>
    api.post<TenantAppInfo>(`${BASE}/${id}/reset-secret`),

  /** 删除应用 */
  deleteApp: (id: string) =>
    api.delete(`${BASE}/${id}`),

  /** 获取可用应用类型 */
  getAppTypes: () =>
    api.get<AppTypeOption[]>(`${BASE}/app-types`),

  /** 获取统计数据 */
  getStats: () =>
    api.get<AppStats>(`${BASE}/stats`),

  /** 查询调用日志 */
  listLogs: (appId: string, params: { page?: number; size?: number }) =>
    api.post(`${BASE}/${appId}/logs`, params),

  /** 查询所有应用日志（集成总览用） */
  listAllLogs: (params: { page?: number; size?: number }) =>
    api.post(`${BASE}/all-logs`, params),

  /** 获取集成总览数据 */
  getIntegrationOverview: () =>
    api.get<IntegrationOverview>(`${BASE}/integration-overview`),
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
