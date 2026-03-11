import api from '../../utils/api';

export interface Payable {
  id?: string;
  payableNo?: string;
  supplierId?: string;
  supplierName?: string;
  amount: number;
  paidAmount?: number;
  unpaidAmount?: number;
  dueDate?: string;
  paymentDate?: string;
  description?: string;
  relatedOrderNo?: string;
  relatedPurchaseId?: string;
  status?: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';
  remark?: string;
  tenantId?: number;
  createTime?: string;
  updateTime?: string;
}

export interface PayableStats {
  totalPending: number;
  totalOverdue: number;
  overdueCount: number;
  newThisMonth: number;
}

export const PAYABLE_STATUS = [
  { value: 'PENDING', label: '待付款', color: 'orange' },
  { value: 'PARTIAL', label: '部分付款', color: 'blue' },
  { value: 'PAID', label: '已付清', color: 'green' },
  { value: 'OVERDUE', label: '已逾期', color: 'red' },
];

export const payableApi = {
  getList: async (params?: Record<string, unknown>) => {
    return await api.post('/finance/payables/list', params);
  },
  getStats: async () => {
    return await api.get('/finance/payables/stats');
  },
  getById: async (id: string) => {
    return await api.get(`/finance/payables/${id}`);
  },
  create: async (data: Partial<Payable>) => {
    return await api.post('/finance/payables', data);
  },
  confirmPayment: async (id: string, amount: number) => {
    return await api.post(`/finance/payables/${id}/confirm-payment`, null, { params: { amount } });
  },
  update: async (data: Partial<Payable>) => {
    return await api.put('/finance/payables', data);
  },
  delete: async (id: string) => {
    return await api.delete(`/finance/payables/${id}`);
  },
  markOverdue: async () => {
    return await api.post('/finance/payables/mark-overdue');
  },
};
