import api, { type ApiResult } from '@/utils/api';

export type TenantIntelligenceProfilePayload = {
  primaryGoal: 'DELIVERY' | 'PROFIT' | 'CASHFLOW';
  deliveryWarningDays: number;
  anomalyWarningCount: number;
  lowMarginThreshold: number;
};

export type TenantIntelligenceProfileResponse = TenantIntelligenceProfilePayload & {
  primaryGoalLabel?: string;
  manualConfigured?: boolean;
  topRiskFactoryName?: string;
  topRiskFactoryReason?: string;
  updateTime?: string | null;
  learnedProfile?: {
    primaryGoal: 'DELIVERY' | 'PROFIT' | 'CASHFLOW';
    primaryGoalLabel?: string;
    deliveryWarningDays: number;
    anomalyWarningCount: number;
    lowMarginThreshold: number;
    topRiskFactoryName?: string;
    topRiskFactoryReason?: string;
  };
};

const tenantIntelligenceProfileService = {
  async getCurrent(): Promise<TenantIntelligenceProfileResponse> {
    const res = await api.get<ApiResult<TenantIntelligenceProfileResponse>>('/system/tenant-intelligence-profile/current');
    return (res?.data || {}) as TenantIntelligenceProfileResponse;
  },

  async save(profile: TenantIntelligenceProfilePayload): Promise<TenantIntelligenceProfileResponse> {
    const res = await api.put<ApiResult<TenantIntelligenceProfileResponse>>('/system/tenant-intelligence-profile/current', profile);
    return (res?.data || {}) as TenantIntelligenceProfileResponse;
  },

  async reset(): Promise<TenantIntelligenceProfileResponse> {
    const res = await api.post<ApiResult<TenantIntelligenceProfileResponse>>('/system/tenant-intelligence-profile/reset');
    return (res?.data || {}) as TenantIntelligenceProfileResponse;
  },
};

export default tenantIntelligenceProfileService;
