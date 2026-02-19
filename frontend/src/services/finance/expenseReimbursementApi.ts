import api from '../../utils/api';

export interface ExpenseReimbursement {
  id?: string;
  reimbursementNo?: string;
  applicantId?: number;
  applicantName?: string;
  expenseType: string;
  title: string;
  amount: number;
  expenseDate: string;
  description?: string;
  orderNo?: string;
  supplierName?: string;
  paymentAccount?: string;
  paymentMethod?: string;
  accountName?: string;
  bankName?: string;
  attachments?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'paid';
  approverId?: number;
  approverName?: string;
  approvalTime?: string;
  approvalRemark?: string;
  paymentTime?: string;
  paymentBy?: string;
  createTime?: string;
  updateTime?: string;
}

export const EXPENSE_TYPES = [
  { value: 'taxi', label: '打车费' },
  { value: 'travel', label: '出差费用' },
  { value: 'material_advance', label: '面辅料垫付' },
  { value: 'office', label: '办公用品' },
  { value: 'other', label: '其他' },
];

export const EXPENSE_STATUS = [
  { value: 'pending', label: '待审批', color: 'orange' },
  { value: 'approved', label: '已批准', color: 'blue' },
  { value: 'rejected', label: '已驳回', color: 'red' },
  { value: 'paid', label: '已付款', color: 'green' },
];

export const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: '银行转账' },
  { value: 'alipay', label: '支付宝' },
  { value: 'wechat', label: '微信' },
];

export const expenseReimbursementApi = {
  /** 分页查询报销单列表 */
  getList: async (params?: Record<string, unknown>) => {
    return await api.get('/finance/expense-reimbursement/list', { params });
  },

  /** 查询报销单详情 */
  getById: async (id: string) => {
    return await api.get(`/finance/expense-reimbursement/${id}`);
  },

  /** 创建报销单 */
  create: async (data: ExpenseReimbursement) => {
    return await api.post('/finance/expense-reimbursement', data);
  },

  /** 更新报销单 */
  update: async (data: ExpenseReimbursement) => {
    return await api.put('/finance/expense-reimbursement', data);
  },

  /** 删除报销单 */
  delete: async (id: string) => {
    return await api.delete(`/finance/expense-reimbursement/${id}`);
  },

  /** 审批（批准/驳回） */
  approve: async (id: string, action: 'approve' | 'reject', remark?: string) => {
    const params = new URLSearchParams();
    params.append('action', action);
    if (remark) params.append('remark', remark);
    return await api.post(`/finance/expense-reimbursement/${id}/approve?${params.toString()}`);
  },

  /** 确认付款 */
  pay: async (id: string, remark?: string) => {
    const params = new URLSearchParams();
    if (remark) params.append('remark', remark);
    return await api.post(`/finance/expense-reimbursement/${id}/pay?${params.toString()}`);
  },
};
