import api from '@/utils/api';

/**
 * 租户级设置（D-741）。
 * 第一个使用项：应收账期天数（crm.receivable.paymentTermDays，出货后 N 天到期，默认 30）。
 */
export interface TenantSettingView {
  paymentTermDays: number;
}

const tenantSettingApi = {
  get: () => api.get<{ code: number; data: TenantSettingView }>(`/crm/tenant-setting`),

  savePaymentTerm: (paymentTermDays: number) =>
    api.put<{ code: number; data: TenantSettingView }>(`/crm/tenant-setting/payment-term`, { paymentTermDays }),
};

export default tenantSettingApi;
