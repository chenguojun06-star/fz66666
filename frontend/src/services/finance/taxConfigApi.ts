import api from '@/utils/api';

// ============================================================
// 类型定义
// ============================================================

export interface TaxConfig {
  id?: string;
  taxName: string;
  taxCode: string;
  taxRate: number;
  appScope?: string;
  description?: string;
  isActive?: boolean;
  createTime?: string;
  updateTime?: string;
}

// ============================================================
// API 方法（注意：list/active 均为 GET 请求，不可用 POST）
// ============================================================

const taxConfigApi = {
  /** 全量列表（GET） */
  list: () =>
    api.get<TaxConfig[]>('/finance/tax-config/list'),

  /** 仅启用项（GET） */
  active: () =>
    api.get<TaxConfig[]>('/finance/tax-config/active'),

  /** 新增税率 */
  create: (data: Omit<TaxConfig, 'id'>) =>
    api.post<TaxConfig>('/finance/tax-config/create', data),

  /** 更新税率 */
  update: (data: TaxConfig) =>
    api.put<TaxConfig>('/finance/tax-config/update', data),

  /** 删除税率 */
  remove: (id: string) =>
    api.delete<void>(`/finance/tax-config/${id}`),
};

export default taxConfigApi;
