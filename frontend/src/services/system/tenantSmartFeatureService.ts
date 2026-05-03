import api, { type ApiResult } from '@/utils/api';
import type { SmartFeatureKey, MiniprogramMenuKey } from '@/smart/core/featureFlags';

type TenantSmartFeatureMap = Partial<Record<SmartFeatureKey, boolean>>;
type MiniprogramMenuMap = Partial<Record<MiniprogramMenuKey, boolean>>;

const tenantSmartFeatureService = {
  async list(): Promise<TenantSmartFeatureMap> {
    const res = await api.get<ApiResult<TenantSmartFeatureMap>>('/system/tenant-smart-feature/list');
    return res?.data || {};
  },

  async save(features: TenantSmartFeatureMap): Promise<TenantSmartFeatureMap> {
    const res = await api.put<ApiResult<TenantSmartFeatureMap>>('/system/tenant-smart-feature', { features });
    return res?.data || {};
  },

  async listMiniprogramMenus(): Promise<MiniprogramMenuMap> {
    const res = await api.get<ApiResult<MiniprogramMenuMap>>('/system/tenant-miniprogram-menu/my-menus');
    return res?.data || {};
  },

  async saveMiniprogramMenus(menus: MiniprogramMenuMap): Promise<MiniprogramMenuMap> {
    const res = await api.put<ApiResult<MiniprogramMenuMap>>('/system/tenant-miniprogram-menu', { menus });
    return res?.data || {};
  },
};

export default tenantSmartFeatureService;
