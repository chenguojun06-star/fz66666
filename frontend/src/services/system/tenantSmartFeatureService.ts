import api, { type ApiResult } from '@/utils/api';
import type { SmartFeatureKey } from '@/smart/core/featureFlags';

type TenantSmartFeatureMap = Partial<Record<SmartFeatureKey, boolean>>;
type BackendActionFlagMap = Record<string, boolean>;

const tenantSmartFeatureService = {
  async list(): Promise<TenantSmartFeatureMap> {
    const res = await api.get<ApiResult<TenantSmartFeatureMap>>('/system/tenant-smart-feature/list');
    return res?.data || {};
  },

  async save(features: TenantSmartFeatureMap): Promise<TenantSmartFeatureMap> {
    const res = await api.put<ApiResult<TenantSmartFeatureMap>>('/system/tenant-smart-feature', { features });
    return res?.data || {};
  },

  /** 查询所有智能开关（前端显示类 + 后端动作类，合并返回） */
  async listAll(): Promise<BackendActionFlagMap> {
    const res = await api.get<ApiResult<BackendActionFlagMap>>('/system/tenant-smart-feature/all');
    return res?.data || {};
  },

  /** 保存后端动作类开关（backend.action.*） */
  async saveBackendActions(actionFlags: BackendActionFlagMap): Promise<BackendActionFlagMap> {
    const res = await api.put<ApiResult<BackendActionFlagMap>>('/system/tenant-smart-feature/backend-actions', actionFlags);
    return res?.data || {};
  },
};

export default tenantSmartFeatureService;
