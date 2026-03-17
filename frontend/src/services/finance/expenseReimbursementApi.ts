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
  { value: 'taxi', label: '打车费', color: 'cyan' },
  { value: 'travel', label: '出差费用', color: 'blue' },
  { value: 'material_advance', label: '面辅料垫付', color: 'purple' },
  { value: 'office', label: '办公用品', color: 'geekblue' },
  { value: 'other', label: '其他', color: 'default' },
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

export interface ExpenseReimbursementDoc {
  id: string;
  tenantId?: number;
  reimbursementId?: string;
  reimbursementNo?: string;
  imageUrl: string;
  rawText?: string;
  recognizedAmount?: number;
  recognizedDate?: string;
  recognizedTitle?: string;
  recognizedType?: string;
  uploaderId?: string;
  uploaderName?: string;
  createTime?: string;
}

export interface RecognizeDocResult {
  docId: string;
  imageUrl: string;
  rawText?: string;
  recognizedAmount?: number;
  recognizedDate?: string;
  recognizedTitle?: string;
  recognizedType?: string;
}

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

  /** 上传报销凭证并AI识别 */
  recognizeDoc: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return await api.post('/finance/expense-reimbursement/recognize-doc', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /** 查询报销单已上传的凭证列表 */
  getDocs: async (reimbursementId: string) => {
    return await api.get('/finance/expense-reimbursement/docs', {
      params: { reimbursementId },
    });
  },

  /** 将凭证与报销单关联 */
  linkDocs: async (docIds: string[], reimbursementId: string, reimbursementNo: string) => {
    return await api.post('/finance/expense-reimbursement/docs/link', {
      docIds,
      reimbursementId,
      reimbursementNo,
    });
  },
};
