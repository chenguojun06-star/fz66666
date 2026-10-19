import api, { unwrapApiData } from '@/utils/api';

/**
 * 租户级设置（D-741）。
 * 第一个使用项：应收账期天数（crm.receivable.paymentTermDays，出货后 N 天到期，默认 30）。
 */
export interface TenantSettingView {
  paymentTermDays: number;
}

const tenantSettingApi = {
  get: async (): Promise<TenantSettingView> =>
    unwrapApiData<TenantSettingView>(await api.get(`/crm/tenant-setting`), '租户设置请求失败'),

  savePaymentTerm: async (paymentTermDays: number): Promise<TenantSettingView> =>
    unwrapApiData<TenantSettingView>(
      await api.put(`/crm/tenant-setting/payment-term`, { paymentTermDays }),
      '租户设置请求失败',
    ),
};

export default tenantSettingApi;
