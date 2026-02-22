import api from '../utils/api';

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
  overview: () => api.get<SystemStatusOverview>('/system/status/overview'),
  /** 租户人员统计 */
  tenantUserStats: () => api.get<TenantUserStatsResult>('/system/status/tenant-user-stats'),
};

export default systemStatusService;
