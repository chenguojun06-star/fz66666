import api, { unwrapApiData } from '../utils/api';

export interface SystemStatusOverview {
  applicationName: string;
  javaVersion: string;
  osName: string;
  osArch: string;
  startTime: string;
  currentTime: string;
  uptime: string;
  uptimeMs: number;
  heapUsedMb: number;
  heapMaxMb: number;
  heapUsedPercent: number;
  nonHeapUsedMb: number;
  availableProcessors: number;
  systemLoadAverage: number;
  threadCount: number;
  peakThreadCount: number;
  database: {
    status: string;
    product?: string;
    version?: string;
    url?: string;
    error?: string;
  };
}

export interface TenantUserStat {
  tenantId: number;
  tenantName: string;
  userCount: number;
}

export interface TenantUserStatsResult {
  totalTenants: number;
  totalUsers: number;
  tenants: TenantUserStat[];
}

const systemStatusService = {
  /** 系统运行状态概览 */
  overview: async (): Promise<SystemStatusOverview> =>
    unwrapApiData<SystemStatusOverview>(await api.get('/system/status/overview'), '系统状态请求失败'),
  /** 租户人员统计 */
  tenantUserStats: async (): Promise<TenantUserStatsResult> =>
    unwrapApiData<TenantUserStatsResult>(await api.get('/system/status/tenant-user-stats'), '系统状态请求失败'),
};

export default systemStatusService;

// ─── 系统问题收集（超管专用）───────────────────────────────────────
export interface SystemIssueItem {
  level: 'ERROR' | 'WARN' | 'INFO';
  category: string;
  title: string;
  description: string;
  count: number;
  lastSeen: string | null;
  actionHint: string;
}

export interface SystemIssueSummary {
  errorCount: number;
  warnCount: number;
  infoCount: number;
  totalCount: number;
  checkedAt: string;
  issues: SystemIssueItem[];
}

export const systemIssueApi = {
  /** 实时收集当前系统问题（只有 ROLE_SUPER_ADMIN 可调用） */
  collect: async (): Promise<SystemIssueSummary> =>
    unwrapApiData<SystemIssueSummary>(await api.get('/system/issues/collect'), '系统问题收集失败'),
};

// ────────────────────────────────────────────────────────────
// 前端异常上报
// ────────────────────────────────────────────────────────────

export interface FrontendErrorRecord {
  type: string;          // error / unhandledrejection / react
  message: string;
  stack?: string;
  url: string;           // 发生异常的页面 URL
  occurredAt: string;    // ISO 时间字符串
}

export const frontendErrorApi = {
  /** 最近 N 条前端异常（仅 ROLE_SUPER_ADMIN） */
  recent: async (limit = 50): Promise<FrontendErrorRecord[]> =>
    unwrapApiData<FrontendErrorRecord[]>(await api.get(`/system/frontend-errors/recent?limit=${limit}`), '前端异常请求失败'),
};

