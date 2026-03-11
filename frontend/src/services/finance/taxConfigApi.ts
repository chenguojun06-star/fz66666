import api from '@/utils/api';

// ============================================================
// 类型定义（与后端 TaxConfig Entity 对齐）
// taxRate 后端存小数：0.1300 = 13%，前端展示/输入时需 ×100/÷100
// ============================================================

export interface TaxConfig {
  id?: string;
  taxName: string;
  taxCode: string;
  /** 后端存储小数（0.1300 = 13%），接口收发均为小数 */
  taxRate: number;
  isDefault?: number;       // 1=默认, 0=非默认
  effectiveDate?: string;   // YYYY-MM-DD
  expiryDate?: string;      // YYYY-MM-DD  NULL=永久有效
  description?: string;
  /** 'ACTIVE' | 'INACTIVE' */
  status?: string;
  tenantId?: number;
  creatorId?: string;
  createTime?: string;
  updateTime?: string;
}

// ============================================================
// API 方法（list/active 均为 GET 请求）
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
