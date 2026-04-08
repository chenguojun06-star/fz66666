import api from '@/utils/api';

// ============================================================
// 类型定义
// ============================================================

export interface BillAggregation {
  id: string;
  billNo: string;
  billType: string;
  billCategory: string;
  sourceType: string;
  sourceId: string;
  sourceNo: string;
  counterpartyType: string;
  counterpartyId: string;
  counterpartyName: string;
  orderId?: string;
  orderNo?: string;
  styleNo?: string;
  amount: number;
  settledAmount: number;
  status: string;
  settlementMonth?: string;
  remark?: string;
  confirmedById?: string;
  confirmedByName?: string;
  confirmedAt?: string;
  settledById?: string;
  settledByName?: string;
  settledAt?: string;
  creatorId?: string;
  creatorName?: string;
  createTime?: string;
  updateTime?: string;
  tenantId?: number;
  deleteFlag?: number;
}

export interface BillQueryRequest {
  pageNum?: number;
  pageSize?: number;
  billType?: string;
  billCategory?: string;
  status?: string;
  settlementMonth?: string;
  counterpartyName?: string;
  orderNo?: string;
}

export interface BillStats {
  pendingAmount: number;
  pendingCount: number;
  confirmedAmount: number;
  confirmedCount: number;
  settledAmount: number;
  settledCount: number;
}

// ============================================================
// 常量
// ============================================================

export const BILL_TYPE_MAP: Record<string, { text: string; color: string }> = {
  PAYABLE: { text: '应付', color: 'red' },
  RECEIVABLE: { text: '应收', color: 'green' },
};

export const BILL_CATEGORY_MAP: Record<string, { text: string; color: string }> = {
  MATERIAL: { text: '面料', color: 'blue' },
  PRODUCT: { text: '成品', color: 'cyan' },
  EXTERNAL_FACTORY: { text: '外发厂', color: 'orange' },
  PAYROLL: { text: '工资', color: 'purple' },
  EXPENSE: { text: '费用', color: 'magenta' },
  SHIPMENT: { text: '成品发货', color: 'geekblue' },
  DEDUCTION: { text: '扣款', color: 'volcano' },
};

export const BILL_STATUS_MAP: Record<string, { text: string; color: string }> = {
  PENDING: { text: '待确认', color: 'orange' },
  CONFIRMED: { text: '已确认', color: 'blue' },
  SETTLING: { text: '结算中', color: 'processing' },
  SETTLED: { text: '已结清', color: 'green' },
  CANCELLED: { text: '已取消', color: 'default' },
};

export const BILL_TYPE_OPTIONS = [
  { label: '全部', value: '' },
  { label: '应付', value: 'PAYABLE' },
  { label: '应收', value: 'RECEIVABLE' },
];

export const BILL_CATEGORY_OPTIONS = [
  { label: '全部', value: '' },
  { label: '面料', value: 'MATERIAL' },
  { label: '成品', value: 'PRODUCT' },
  { label: '外发厂', value: 'EXTERNAL_FACTORY' },
  { label: '工资', value: 'PAYROLL' },
  { label: '费用', value: 'EXPENSE' },
  { label: '扣款', value: 'DEDUCTION' },
];

export const BILL_STATUS_OPTIONS = [
  { label: '全部', value: '' },
  { label: '待确认', value: 'PENDING' },
  { label: '已确认', value: 'CONFIRMED' },
  { label: '结算中', value: 'SETTLING' },
  { label: '已结清', value: 'SETTLED' },
  { label: '已取消', value: 'CANCELLED' },
];

// ============================================================
// API 方法
// ============================================================

export const billAggregationApi = {
  /** 推送账单（由各模块审批后自动调用） */
  pushBill: (data: Record<string, unknown>) =>
    api.post('/finance/bill-aggregation/push', data),

  /** 分页查询账单列表 */
  listBills: (query: BillQueryRequest) =>
    api.post('/finance/bill-aggregation/list', query),

  /** 获取账单统计 */
  getStats: (billType?: string) =>
    api.get('/finance/bill-aggregation/stats', { params: { billType } }),

  /** 确认账单 */
  confirmBill: (id: string) =>
    api.post(`/finance/bill-aggregation/${id}/confirm`),

  /** 批量确认账单 */
  batchConfirm: (ids: string[]) =>
    api.post('/finance/bill-aggregation/batch-confirm', ids),

  /** 结算账单 */
  settleBill: (id: string, settledAmount: number) =>
    api.post(`/finance/bill-aggregation/${id}/settle`, null, { params: { settledAmount } }),

  /** 取消账单 */
  cancelBill: (id: string, reason: string) =>
    api.post(`/finance/bill-aggregation/${id}/cancel`, null, { params: { reason } }),
};
