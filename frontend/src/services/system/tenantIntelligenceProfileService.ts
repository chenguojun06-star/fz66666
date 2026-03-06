import api from '@/utils/api';

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
    const res = await api.get<TenantIntelligenceProfileResponse>('/system/tenant-intelligence-profile/current');
    return (res as any)?.data || (res as any) || {};
  },

  async save(profile: TenantIntelligenceProfilePayload): Promise<TenantIntelligenceProfileResponse> {
    const res = await api.post<TenantIntelligenceProfileResponse>('/system/tenant-intelligence-profile/save', profile);
    return (res as any)?.data || (res as any) || {};
  },

  async reset(): Promise<TenantIntelligenceProfileResponse> {
    const res = await api.post<TenantIntelligenceProfileResponse>('/system/tenant-intelligence-profile/reset');
    return (res as any)?.data || (res as any) || {};
  },
};

export default tenantIntelligenceProfileService;