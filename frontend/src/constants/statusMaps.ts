export type StatusMapItem = {
  text: string;
  color: string;
};

export type StatusMap = Record<string, StatusMapItem>;

export const ORDER_STATUS_MAP: StatusMap = {
  pending: { text: '待生产', color: 'default' },
  production: { text: '生产中', color: 'processing' },
  in_progress: { text: '进行中', color: 'processing' },
  completed: { text: '已完成', color: 'success' },
  confirmed: { text: '已确认', color: 'blue' },
  draft: { text: '草稿', color: 'default' },
  produced: { text: '已生产', color: 'cyan' },
  warehoused: { text: '已入库', color: 'success' },
  delayed: { text: '已逾期', color: 'warning' },
  scrapped: { text: '已报废', color: 'error' },
  cancelled: { text: '已取消', color: 'default' },
  canceled: { text: '已取消', color: 'default' },
  paused: { text: '已暂停', color: 'orange' },
  returned: { text: '已退回', color: 'volcano' },
  closed: { text: '已关单', color: 'blue' },
  archived: { text: '已归档', color: 'default' },
};

export const SETTLEMENT_STATUS_MAP: StatusMap = {
  PENDING: { text: '待生产', color: 'orange' },
  CONFIRMED: { text: '已确认', color: 'blue' },
  IN_PRODUCTION: { text: '生产中', color: 'success' },
  COMPLETED: { text: '已完成', color: 'cyan' },
  CANCELLED: { text: '已取消', color: 'error' },
  CLOSED: { text: '已关单', color: 'blue' },
  SCRAPPED: { text: '已报废', color: 'error' },
  ARCHIVED: { text: '已归档', color: 'default' },
  PAUSED: { text: '已暂停', color: 'orange' },
  RETURNED: { text: '已退回', color: 'orange' },
  pending: { text: '待生产', color: 'orange' },
  confirmed: { text: '已确认', color: 'blue' },
  in_production: { text: '生产中', color: 'success' },
  production: { text: '生产中', color: 'success' },
  completed: { text: '已完成', color: 'cyan' },
  cancelled: { text: '已取消', color: 'error' },
  closed: { text: '已关单', color: 'blue' },
  scrapped: { text: '已报废', color: 'error' },
  archived: { text: '已归档', color: 'default' },
  paused: { text: '已暂停', color: 'orange' },
  returned: { text: '已退回', color: 'orange' },
  delayed: { text: '已逾期', color: 'error' },
};

export const PAYMENT_STATUS_MAP: StatusMap = {
  pending: { text: '待支付', color: 'orange' },
  processing: { text: '支付中', color: 'blue' },
  success: { text: '已支付', color: 'green' },
  failed: { text: '支付失败', color: 'red' },
  cancelled: { text: '已取消', color: 'default' },
  rejected: { text: '已驳回', color: 'red' },
  refunded: { text: '已退回', color: 'volcano' },
};

export const PAYROLL_PAYMENT_STATUS_MAP: StatusMap = {
  unpaid: { text: '未付', color: 'red' },
  partially_paid: { text: '部分已付', color: 'orange' },
  fully_paid: { text: '已付清', color: 'green' },
};

export const FACTORY_STATUS_MAP: StatusMap = {
  active: { text: '启用', color: 'success' },
  inactive: { text: '停用', color: 'default' },
};

export const FACTORY_TYPE_MAP: StatusMap = {
  INTERNAL: { text: '内部', color: 'blue' },
  EXTERNAL: { text: '外部', color: 'purple' },
};

export const MATERIAL_STATUS_MAP: StatusMap = {
  completed: { text: '已完成', color: 'default' },
  pending: { text: '待完成', color: 'warning' },
  disabled: { text: '已停用', color: 'error' },
};

export const MATERIAL_RECON_STATUS_MAP: StatusMap = {
  pending: { text: '待核实', color: 'default' },
  verified: { text: '已核实', color: 'processing' },
  approved: { text: '已审批', color: 'success' },
  paid: { text: '已付款', color: 'success' },
  rejected: { text: '已驳回', color: 'error' },
};

export const SECONDARY_PROCESS_STATUS_MAP: StatusMap = {
  pending: { text: '待处理', color: 'default' },
  processing: { text: '处理中', color: 'processing' },
  completed: { text: '已完成', color: 'success' },
  cancelled: { text: '已取消', color: 'error' },
};

export const AGENT_EXECUTION_STATUS_MAP: StatusMap = {
  SUCCESS: { text: '成功', color: 'success' },
  FAILED: { text: '失败', color: 'error' },
  EXECUTING: { text: '执行中', color: 'processing' },
  TIMEOUT: { text: '超时', color: 'warning' },
  PENDING: { text: '待执行', color: 'default' },
  UNKNOWN: { text: '未知', color: 'default' },
};

export const MATERIAL_PURCHASE_STATUS_MAP: StatusMap = {
  completed: { text: '已完成', color: 'green' },
  received: { text: '已到货', color: 'green' },
  partial: { text: '部分到料', color: 'orange' },
  partial_arrival: { text: '部分到料', color: 'orange' },
  cancelled: { text: '已取消', color: 'default' },
  warehouse_pending: { text: '待仓库出库', color: 'blue' },
  purchasing: { text: '采购中', color: 'purple' },
  pending: { text: '待采购', color: 'orange' },
  awaiting_confirm: { text: '待确认', color: 'blue' },
};

export const FACTORY_SHIPMENT_STATUS_MAP: StatusMap = {
  pending: { text: '待收货', color: 'orange' },
  received: { text: '已收货', color: 'blue' },
  quality_checked: { text: '已质检', color: 'purple' },
  partially_returned: { text: '部分退回返修', color: 'red' },
};

export const STYLE_ORDER_STATUS_MAP: StatusMap = {
  COMPLETED: { text: '已完成', color: 'success' },
  WAREHOUSED: { text: '已入库', color: 'success' },
  IN_PROGRESS: { text: '生产中', color: 'blue' },
  DRAFT: { text: '草稿', color: 'default' },
  CANCELLED: { text: '已取消', color: 'error' },
};

export const BIZ_TYPE_MAP: StatusMap = {
  PAYROLL: { text: '员工工资', color: 'blue' },
  PAYROLL_SETTLEMENT: { text: '工资结算', color: 'blue' },
  ORDER_SETTLEMENT: { text: '订单结算', color: 'cyan' },
  RECONCILIATION: { text: '工厂对账', color: 'orange' },
  material_reconciliation: { text: '工厂对账', color: 'orange' },
  REIMBURSEMENT: { text: '费用报销', color: 'purple' },
  BILL_RECEIVABLE: { text: '应收账款', color: 'green' },
  BILL_PAYABLE: { text: '应付账款', color: 'volcano' },
};

export const ORDER_BIZ_TYPE_MAP: StatusMap = {
  FOB: { text: 'FOB', color: 'cyan' },
  ODM: { text: 'ODM', color: 'purple' },
  OEM: { text: 'OEM', color: 'blue' },
  CMT: { text: 'CMT', color: 'orange' },
};

export const REVIEW_STATUS_MAP: StatusMap = {
  PASS: { text: '通过', color: 'success' },
  REWORK: { text: '需修改', color: 'warning' },
  REJECT: { text: '不通过', color: 'error' },
};
