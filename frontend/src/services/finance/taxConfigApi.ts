import api from '../../utils/api';

export interface TaxConfig {
  id?: string;
  taxName: string;
  taxType: 'VAT' | 'SURCHARGE' | 'STAMP' | 'CORPORATE';
  taxRate: number;
  description?: string;
  effectiveDate?: string;
  enabled?: boolean;
  tenantId?: number;
  createTime?: string;
  updateTime?: string;
}

export const TAX_TYPES = [
  { value: 'VAT', label: '增值税' },
  { value: 'SURCHARGE', label: '附加税' },
  { value: 'STAMP', label: '印花税' },
  { value: 'CORPORATE', label: '企业所得税' },
];

export const taxConfigApi = {
  getList: async (params?: Record<string, unknown>) => {
    return await api.post('/finance/tax-config/list', params);
  },
  listEnabled: async () => {
    return await api.get('/finance/tax-config/enabled');
  },
  getById: async (id: string) => {
    return await api.get(`/finance/tax-config/${id}`);
  },
  create: async (data: Partial<TaxConfig>) => {
    return await api.post('/finance/tax-config', data);
  },
  update: async (data: Partial<TaxConfig>) => {
    return await api.put('/finance/tax-config', data);
  },
  delete: async (id: string) => {
    return await api.delete(`/finance/tax-config/${id}`);
  },
  calculateTax: async (amount: number, taxConfigId: string) => {
    return await api.get('/finance/tax-config/calculate', { params: { amount, taxConfigId } });
  },
};
