import api, { unwrapApiData } from '@/utils/api';

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
  list: async (): Promise<TaxConfig[]> =>
    unwrapApiData<TaxConfig[]>(await api.get('/finance/tax-config/list'), '加载税率配置失败'),

  /** 仅启用项（GET） */
  active: async (): Promise<TaxConfig[]> =>
    unwrapApiData<TaxConfig[]>(await api.get('/finance/tax-config/active'), '加载启用税率失败'),

  /** 新增税率 */
  create: async (data: Omit<TaxConfig, 'id'>): Promise<TaxConfig> =>
    unwrapApiData<TaxConfig>(await api.post('/finance/tax-config/create', data), '新增税率失败'),

  /** 更新税率 */
  update: async (data: TaxConfig): Promise<TaxConfig> =>
    unwrapApiData<TaxConfig>(await api.put('/finance/tax-config/update', data), '更新税率失败'),

  /** 删除税率 */
  remove: (id: string) =>
    api.delete<void>(`/finance/tax-config/${id}`),
};

export default taxConfigApi;
