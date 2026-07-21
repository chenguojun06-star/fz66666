declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

export interface TenantOption {
  id: number;
  tenantName: string;
}

export type LoginMode = 'password' | 'sms';

export interface LoginFormValues {
  tenantId: number;
  companySearch: string;
  username?: string;
  password?: string;
  phone?: string;
  smsCode?: string;
}

export const getBuildCommit = (): string => (typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'unknown');

export const getRawBuildTime = (): string => (typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '');

export const formatBuildTimeText = (buildTime: string): string => {
  if (!buildTime) return '-';
  const d = new Date(buildTime);
  if (Number.isNaN(d.getTime())) return buildTime;
  return d.toLocaleString('zh-CN', { hour12: false });
};
