import api from '@/utils/api';
import type { SmartFeatureKey } from '@/smart/core/featureFlags';

type TenantSmartFeatureMap = Partial<Record<SmartFeatureKey, boolean>>;

const tenantSmartFeatureService = {
  async list(): Promise<TenantSmartFeatureMap> {
    const res = await api.get<TenantSmartFeatureMap>('/system/tenant-smart-feature/list');
    return (res as any)?.data || (res as any) || {};
  },

  async save(features: TenantSmartFeatureMap): Promise<TenantSmartFeatureMap> {
    const res = await api.post<TenantSmartFeatureMap>('/system/tenant-smart-feature/save', { features });
    return (res as any)?.data || (res as any) || {};
  },
};

export default tenantSmartFeatureService;
