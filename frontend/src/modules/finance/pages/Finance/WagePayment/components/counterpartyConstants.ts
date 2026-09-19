/**
 * D-474：往来对象与账单来源的展示常量（集中一处，避免组件间互相 import 形成循环依赖）。
 *
 * 历史坑：COUNTERPARTY_TYPE_MAP 原先定义在 CounterpartyLedgerTab、
 * SOURCE_TYPE_TEXT 定义在 BillDetailDrawer，而三个组件又互相引用组件，
 * 形成 CounterpartyLedgerTab → CounterpartyBillDrawer → BillDetailDrawer → CounterpartyLedgerTab 的环。
 */
export const COUNTERPARTY_TYPE_MAP: Record<string, { text: string; color: string }> = {
  WORKER: { text: '员工', color: 'blue' },
  // 历史数据里员工写作 EMPLOYEE，兼容显示（后端分组已归一到 WORKER）
  EMPLOYEE: { text: '员工', color: 'blue' },
  FACTORY: { text: '工厂', color: 'purple' },
  SUPPLIER: { text: '供应商', color: 'cyan' },
  CUSTOMER: { text: '客户', color: 'orange' },
};

/** 上游来源类型 → 中文（账单来自哪个模块推送） */
export const SOURCE_TYPE_TEXT: Record<string, string> = {
  MATERIAL_RECONCILIATION: '面料对账',
  QUALITY_DEDUCTION: '品质扣款',
  SHIPMENT_RECONCILIATION: '出货对账',
  SHIPMENT_RECONCILIATION_DEDUCTION: '出货扣款',
  PAYROLL_SETTLEMENT: '工资结算',
  SECONDARY_PROCESS: '外发二次工艺',
  MATERIAL_PICKUP: '面料领用',
  MATERIAL_OUTBOUND: '物料出库',
  PRODUCT_OUTSTOCK: '成品出库',
  EXPENSE_REIMBURSEMENT: '费用报销',
  EMPLOYEE_ADVANCE: '员工借支',
  PURCHASE_RETURN: '采购退货',
  SALES_RETURN: '销售退货',
  INVENTORY_CHECK: '库存盘点',
  EC_SALES_REVENUE: '电商收入',
  STYLE_DEVELOPMENT: '样衣开发',
};

/**
 * D-474：历史数据里的占位往来对象 ID（上游推送时拿不到真实供应商 ID 写死的）。
 * 这些值不能作为对象身份依据，否则不同供应商会被当成同一个人合并。
 */
const PLACEHOLDER_COUNTERPARTY_IDS = new Set([
  'UNKNOWN_SUPPLIER',
  'UNKNOWN',
  'UNKNOWN_FACTORY',
  'UNKNOWN_CUSTOMER',
  'UNKNOWN_WORKER',
]);

/** 是否为可用的真实对象 ID（空值与占位符都视为不可用，需改用名称匹配） */
export const isRealCounterpartyId = (id?: string | null): boolean =>
  !!id && id.trim() !== '' && !PLACEHOLDER_COUNTERPARTY_IDS.has(id.trim().toUpperCase());

/** 付款记录状态文案 */
export const PAY_STATUS_TEXT: Record<string, string> = {
  pending: '待支付',
  processing: '处理中',
  success: '已支付',
  paid: '已支付',
  failed: '失败',
  rejected: '已驳回',
  cancelled: '已取消',
};
