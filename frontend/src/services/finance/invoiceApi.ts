import api from '../../utils/api';

export interface Invoice {
  id?: string;
  invoiceNo?: string;
  invoiceType: 'ORDINARY' | 'SPECIAL' | 'ELECTRONIC';
  invoiceCode?: string;
  amount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  buyerName?: string;
  buyerTaxNo?: string;
  buyerAddress?: string;
  buyerPhone?: string;
  buyerBank?: string;
  buyerBankAccount?: string;
  sellerName?: string;
  sellerTaxNo?: string;
  relatedOrderNo?: string;
  relatedSettlementId?: string;
  status?: 'DRAFT' | 'ISSUED' | 'VERIFIED' | 'CANCELLED';
  issueDate?: string;
  remark?: string;
  tenantId?: number;
  createTime?: string;
  updateTime?: string;
}

export const INVOICE_TYPES = [
  { value: 'ORDINARY', label: '普通发票' },
  { value: 'SPECIAL', label: '增值税专用发票' },
  { value: 'ELECTRONIC', label: '电子发票' },
];

export const INVOICE_STATUS = [
  { value: 'DRAFT', label: '草稿', color: 'default' },
  { value: 'ISSUED', label: '已开票', color: 'blue' },
  { value: 'VERIFIED', label: '已核销', color: 'green' },
  { value: 'CANCELLED', label: '已作废', color: 'red' },
];

export const invoiceApi = {
  getList: async (params?: Record<string, unknown>) => {
    return await api.post('/finance/invoices/list', params);
  },
  getById: async (id: string) => {
    return await api.get(`/finance/invoices/${id}`);
  },
  create: async (data: Partial<Invoice>) => {
    return await api.post('/finance/invoices', data);
  },
  update: async (data: Partial<Invoice>) => {
    return await api.put('/finance/invoices', data);
  },
  issue: async (id: string) => {
    return await api.post(`/finance/invoices/${id}/issue`);
  },
  verify: async (id: string) => {
    return await api.post(`/finance/invoices/${id}/verify`);
  },
  cancel: async (id: string) => {
    return await api.post(`/finance/invoices/${id}/cancel`);
  },
  delete: async (id: string) => {
    return await api.delete(`/finance/invoices/${id}`);
  },
};
