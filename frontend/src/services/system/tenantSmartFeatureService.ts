import api, { type ApiResult } from '@/utils/api';
import type { SmartFeatureKey } from '@/smart/core/featureFlags';

type TenantSmartFeatureMap = Partial<Record<SmartFeatureKey, boolean>>;

const tenantSmartFeatureService = {
  async list(): Promise<TenantSmartFeatureMap> {
    const res = await api.get<ApiResult<TenantSmartFeatureMap>>('/system/tenant-smart-feature/list');
    return res?.data || {};
  },

  async save(features: TenantSmartFeatureMap): Promise<TenantSmartFeatureMap> {
    const res = await api.put<ApiResult<TenantSmartFeatureMap>>('/system/tenant-smart-feature', { features });
    return res?.data || {};
  },
};

export default tenantSmartFeatureService;
