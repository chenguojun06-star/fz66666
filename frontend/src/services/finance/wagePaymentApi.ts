import api from '@/utils/api';

// ============================================================
// 类型定义
// ============================================================

export interface PaymentAccount {
  id?: string;
  ownerType: 'WORKER' | 'FACTORY';
  ownerId: string;
  ownerName?: string;
  accountType: 'BANK' | 'WECHAT' | 'ALIPAY';
  accountName?: string;
  accountNo?: string;
  bankName?: string;
  bankBranch?: string;
  qrCodeUrl?: string;
  isDefault?: number;
  status?: string;
  tenantId?: number;
  createTime?: string;
  updateTime?: string;
}

export interface WagePayment {
  id: string;
  paymentNo: string;
  payeeType: 'WORKER' | 'FACTORY';
  payeeId: string;
  payeeName: string;
  paymentAccountId?: string;
  paymentMethod: 'OFFLINE' | 'BANK' | 'WECHAT' | 'ALIPAY';
  amount: number;
  currency?: string;
  bizType?: string;
  bizId?: string;
  bizNo?: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'cancelled' | 'rejected' | 'refunded';
  paymentTime?: string;
  paymentProof?: string;
  paymentRemark?: string;
  thirdPartyOrderId?: string;
  thirdPartyStatus?: string;
  operatorId?: string;
  operatorName?: string;
  confirmTime?: string;
  confirmBy?: string;
  notifyStatus?: string;
  notifyTime?: string;
  tenantId?: number;
  createTime?: string;
  updateTime?: string;
}

export interface WagePaymentDetail {
  payment: WagePayment;
  account?: PaymentAccount;
}

export interface PaymentInitiateRequest {
  payeeType: string;
  payeeId: string;
  payeeName: string;
  paymentAccountId?: string;
  paymentMethod: string;
  amount: number;
  bizType?: string;
  bizId?: string;
  bizNo?: string;
  remark?: string;
}

export interface PaymentQueryRequest {
  payeeType?: string;
  payeeId?: string;
  payeeName?: string;
  status?: string;
  paymentMethod?: string;
  bizType?: string;
  startTime?: string;
  endTime?: string;
}

/**
 * 待付款项目 — 聚合工厂对账 + 费用报销 + 工资审批
 */
export interface PayableItem {
  bizType:
    | 'PAYROLL'
    | 'PAYROLL_SETTLEMENT'
    | 'ORDER_SETTLEMENT'
    | 'RECONCILIATION'
    | 'REIMBURSEMENT'
    | 'BILL_RECEIVABLE'
    | 'BILL_PAYABLE';
  bizId: string;
  bizNo: string;
  payeeType: 'WORKER' | 'FACTORY' | 'PERSON' | 'CUSTOMER';
  payeeId: string;
  payeeName: string;
  amount: number;
  paidAmount: number;
  description: string;
  sourceStatus: string;
  createTime: string;
  /** 所属月份 yyyy-MM，后端计算，供前端按月聚合展示 */
  yearMonth?: string;
}

export const BIZ_TYPE_OPTIONS = [
  { label: '全部', value: '' },
  { label: '工资结算', value: 'PAYROLL_SETTLEMENT' },
  { label: '订单结算', value: 'ORDER_SETTLEMENT' },
  { label: '工厂对账', value: 'RECONCILIATION' },
  { label: '费用报销', value: 'REIMBURSEMENT' },
  { label: '应收账款', value: 'BILL_RECEIVABLE' },
  { label: '应付账款', value: 'BILL_PAYABLE' },
];

export const BIZ_TYPE_MAP: Record<string, { text: string; color: string }> = {
  PAYROLL: { text: '员工工资', color: 'blue' },
  PAYROLL_SETTLEMENT: { text: '工资结算', color: 'blue' },
  ORDER_SETTLEMENT: { text: '订单结算', color: 'cyan' },
  RECONCILIATION: { text: '工厂对账', color: 'orange' },
  material_reconciliation: { text: '工厂对账', color: 'orange' },
  REIMBURSEMENT: { text: '费用报销', color: 'purple' },
  BILL_RECEIVABLE: { text: '应收账款', color: 'green' },
  BILL_PAYABLE: { text: '应付账款', color: 'volcano' },
};

// ============================================================
// 常量
// ============================================================

export const ACCOUNT_TYPE_OPTIONS = [
  { label: '银行卡', value: 'BANK' },
  { label: '微信', value: 'WECHAT' },
  { label: '支付宝', value: 'ALIPAY' },
];

export const PAYMENT_METHOD_OPTIONS = [
  { label: '线下付款', value: 'OFFLINE' },
  { label: '银行卡转账', value: 'BANK' },
  { label: '微信支付', value: 'WECHAT' },
  { label: '支付宝支付', value: 'ALIPAY' },
];

export const PAYMENT_STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: '待支付', color: 'orange' },
  processing: { text: '支付中', color: 'blue' },
  success: { text: '已支付', color: 'green' },
  failed: { text: '支付失败', color: 'red' },
  cancelled: { text: '已取消', color: 'default' },
  rejected: { text: '已驳回', color: 'red' },
  refunded: { text: '已退回', color: 'volcano' },
};

export interface PayeeSearchResult {
  id: string;
  payeeType: 'WORKER' | 'FACTORY';
  name: string;
  phone?: string;
  label: string;
}

export const OWNER_TYPE_OPTIONS = [
  { label: '员工', value: 'WORKER' },
  { label: '工厂', value: 'FACTORY' },
];

// ============================================================
// API 方法
// ============================================================

export const wagePaymentApi = {
  // ---- 收款方搜索 ----
  searchPayee: (keyword: string, payeeType?: string) =>
    api.post('/finance/payee-search', { keyword, payeeType }),

  // ---- 收款账户 ----
  listAccounts: (ownerType: string, ownerId: string) =>
    api.post('/finance/payment-accounts/list', { ownerType, ownerId }),

  saveAccount: (account: PaymentAccount) =>
    api.post('/finance/payment-accounts', account),

  removeAccount: (id: string) =>
    api.delete(`/finance/payment-accounts/${id}`),

  // ---- 工资支付 ----
  initiatePayment: (request: PaymentInitiateRequest) =>
    api.post('/finance/wage-payments/initiate', request),

  confirmOffline: (id: string, proofUrl?: string, remark?: string) =>
    api.post(`/finance/wage-payments/${id}/confirm-offline`, { proofUrl, remark }),

  confirmReceived: (id: string) =>
    api.post(`/finance/wage-payments/${id}/confirm-received`),

  cancelPayment: (id: string, reason: string) =>
    api.post(`/finance/wage-payments/${id}/cancel`, { reason }),

  listPayments: (query: PaymentQueryRequest) =>
    api.post('/finance/wage-payments/list', query),

  getPaymentDetail: (id: string) =>
    api.get(`/finance/wage-payments/${id}`),

  // ---- 收付款中心 ----
  /** 获取待付款单据列表（聚合工厂对账 + 费用报销） */
  listPendingPayables: (bizType?: string) =>
    api.post('/finance/wage-payments/pending-payables', bizType ? { bizType } : { bizType: null }),

  /** 发起支付并回写上游状态 */
  initiateWithCallback: (request: PaymentInitiateRequest) =>
    api.post('/finance/wage-payments/initiate-with-callback', request),

  /** 确认线下支付并回写上游 */
  confirmOfflineWithCallback: (id: string, proofUrl?: string, remark?: string) =>
    api.post(`/finance/wage-payments/${id}/confirm-offline-with-callback`, { proofUrl, remark }),

  /** 驳回待付款项（回写上游状态） */
  rejectPayable: (params: { paymentId?: string; bizType: string; bizId: string; reason: string }) =>
    api.post('/finance/wage-payments/reject', params),

  /** 退回已付款项（主管权限，回写上游状态） */
  refundPayment: (id: string, reason: string) =>
    api.post(`/finance/wage-payments/${id}/refund`, { reason }),

  // ---- 工资结算反馈 ----
  listFeedback: (params?: Record<string, string>) =>
    api.post('/finance/wage-settlement-feedback/list', params || {}),

  getFeedbackStats: () =>
    api.get('/finance/wage-settlement-feedback/stats'),

  resolveFeedback: (id: string, action: string, resolveRemark?: string) =>
    api.post(`/finance/wage-settlement-feedback/${id}/resolve`, { action, resolveRemark }),
};
