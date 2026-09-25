/**
 * 状态映射统一常量
 *
 * 【设计原则】
 * - 所有状态值统一为小写英文（与后端数据库一致）
 * - 【D-520】text 字段存 i18n key（如 `status.order.production`），
 *   渲染侧统一用 t() 翻译后再展示；禁止直接把 text 渲染到界面。
 *   映射定义见 shared-locales/source/*.json 的 status.* 节点。
 * - 同一状态值在所有域（生产/采购/质检/工资/财务）的文字/颜色必须一致
 * - 状态色严格限制为6种：success(绿)/processing(蓝)/warning(黄)/error(红)/default(灰)/info(紫)
 * - 各组件/页面内联 statusMap 暂不改动（改动面太大），在新增代码中强制引用本文件
 *
 * 【主状态色值规范（6色系统）】
 *   success    → 绿色：完成/通过/已确认/启用
 *   processing → 蓝色：进行中/生产中/处理中/活跃状态
 *   warning    → 黄色：逾期/警告/待处理/暂停
 *   error      → 红色：错误/失败/报废/退回
 *   default    → 灰色：默认/草稿/取消/停用/归档
 *   info       → 紫色：信息/次要状态/类型标签
 */

import { t } from '@/i18n';

export type StatusMapItem = {
  text: string;
  color: string;
};

export type StatusMap = Record<string, StatusMapItem>;

/* =========================== 通用主状态映射（ORDER_STATUS_MAP）=========================== */
export const ORDER_STATUS_MAP: StatusMap = {
  // 基础状态
  not_started: { text: 'status.order.not_started', color: 'default' },
  pending: { text: 'status.order.pending', color: 'default' },
  production: { text: 'status.order.production', color: 'processing' },
  in_progress: { text: 'status.order.in_progress', color: 'processing' },
  paused: { text: 'status.order.paused', color: 'warning' },
  // 工序阶段
  procurement: { text: 'status.order.procurement', color: 'processing' },
  cutting: { text: 'status.order.cutting', color: 'processing' },
  sewing: { text: 'status.order.sewing', color: 'processing' },
  ironing: { text: 'status.order.ironing', color: 'processing' },
  secondary_process: { text: 'status.order.secondary_process', color: 'info' },
  quality_check: { text: 'status.order.quality_check', color: 'processing' },
  warehousing: { text: 'status.order.warehousing', color: 'processing' },
  packaging: { text: 'status.order.packaging', color: 'processing' },
  // 终止/异常
  completed: { text: 'status.order.completed', color: 'success' },
  delayed: { text: 'status.order.delayed', color: 'warning' },
  scrapped: { text: 'status.order.scrapped', color: 'error' },
  cancelled: { text: 'status.order.cancelled', color: 'default' },
  canceled: { text: 'status.order.canceled', color: 'default' },
  returned: { text: 'status.order.returned', color: 'error' },
  closed: { text: 'status.order.closed', color: 'processing' },
  archived: { text: 'status.order.archived', color: 'default' },
  // 辅助状态
  confirmed: { text: 'status.order.confirmed', color: 'processing' },
  draft: { text: 'status.order.draft', color: 'default' },
  produced: { text: 'status.order.produced', color: 'processing' },
  warehoused: { text: 'status.order.warehoused', color: 'success' },
  received: { text: 'status.order.received', color: 'processing' },
  partial: { text: 'status.order.partial', color: 'processing' },
  partial_arrival: { text: 'status.order.partial_arrival', color: 'processing' },
  awaiting_confirm: { text: 'status.order.awaiting_confirm', color: 'processing' },
  warehouse_pending: { text: 'status.order.warehouse_pending', color: 'processing' },
  pending_audit: { text: 'status.order.pending_audit', color: 'processing' },
  passed: { text: 'status.order.passed', color: 'success' },
  bundled: { text: 'status.order.bundled', color: 'processing' },
  created: { text: 'status.order.created', color: 'default' },
  material_preparation: { text: 'status.order.material_preparation', color: 'processing' },
  // 通用大写
  OPEN: { text: 'status.order.open', color: 'processing' },
  RESOLVED: { text: 'status.order.resolved', color: 'success' },
  REWORK: { text: 'status.order.rework', color: 'warning' },
  WAREHOUSE_OUT: { text: 'status.order.warehouse_out', color: 'processing' },
  PRODUCTION_COMPLETED: { text: 'status.order.production_completed', color: 'success' },
  IN_STOCK: { text: 'status.order.in_stock', color: 'success' },
  ISSUED: { text: 'status.order.issued', color: 'processing' },
  RETURNED: { text: 'status.order.returned', color: 'error' },
  ENABLED: { text: 'status.order.enabled', color: 'success' },
  active: { text: 'status.order.active', color: 'success' },
  inactive: { text: 'status.order.inactive', color: 'default' },
  PARTIAL: { text: 'status.order.partial', color: 'processing' },
  OVERDUE: { text: 'status.order.overdue', color: 'warning' },
  SETTLING: { text: 'status.order.settling', color: 'processing' },
  SETTLED: { text: 'status.order.settled', color: 'success' },
  ISSUED_INVOICE: { text: 'status.order.issued_invoice', color: 'success' },
  processing: { text: 'status.order.processing', color: 'processing' },
  refunded: { text: 'status.order.refunded', color: 'success' },
  borrowed: { text: 'status.order.borrowed', color: 'processing' },
  lost: { text: 'status.order.lost', color: 'error' },
  accepted: { text: 'status.order.accepted', color: 'success' },
  verified: { text: 'status.order.verified', color: 'success' },
  repaired_waiting_qc: { text: 'status.order.repaired_waiting_qc', color: 'warning' },
  CREATED: { text: 'status.order.created', color: 'default' },
  DISCONNECTED: { text: 'status.order.disconnected', color: 'error' },
  unpaid: { text: 'status.order.unpaid', color: 'error' },
  partially_paid: { text: 'status.order.partially_paid', color: 'processing' },
  fully_paid: { text: 'status.order.fully_paid', color: 'success' },
  unrepaid: { text: 'status.order.unrepaid', color: 'warning' },
  repaid: { text: 'status.order.repaid', color: 'success' },
};

/* =========================== 物料采购状态 ============================
 * 文案/颜色三端统一（PC / 小程序 / H5）：
 *   pending→待采购(warning) / received→已到货(success) / awaiting_confirm→待确认(processing)
 *   completed→已完成(success) / partial_arrived→部分到货(warning) / cancelled→已取消(default)
 * 小程序/H5 引用 h5-web/source-miniapp/shared/statusMap.js 中的 MATERIAL_PURCHASE_STATUS_LABELS/COLORS
 */
export const MATERIAL_PURCHASE_STATUS_MAP: StatusMap = {
  pending: { text: 'status.purchase.pending', color: 'warning' },
  procurement: { text: 'status.purchase.procurement', color: 'processing' },
  purchasing: { text: 'status.purchase.purchasing', color: 'processing' },
  material_preparation: { text: 'status.purchase.material_preparation', color: 'processing' },
  received: { text: 'status.purchase.received', color: 'success' },
  partial: { text: 'status.purchase.partial', color: 'warning' },
  partial_arrival: { text: 'status.purchase.partial_arrival', color: 'warning' },
  partial_arrived: { text: 'status.purchase.partial_arrived', color: 'warning' },
  awaiting_confirm: { text: 'status.purchase.awaiting_confirm', color: 'processing' },
  warehouse_pending: { text: 'status.purchase.warehouse_pending', color: 'processing' },
  completed: { text: 'status.purchase.completed', color: 'success' },
  cancelled: { text: 'status.purchase.cancelled', color: 'default' },
  canceled: { text: 'status.purchase.canceled', color: 'default' },
};

/* =========================== 纸样生产状态（PatternProduction）============================
 * 三端统一（PC / 小程序 / H5）：枚举值大写。
 * 小程序/H5 引用 h5-web/source-miniapp/shared/statusMap.js 中的 PATTERN_STATUS_LABELS
 *
 * 后端状态来源：PatternStatusHelper.java / PatternProduction.status
 *   PENDING               未开始（初始）
 *   IN_PROGRESS           进行中（含 REWORK 操作后回到 IN_PROGRESS）
 *   PRODUCTION_COMPLETED  生产完成（待入库）
 *   COMPLETED             已完成（已入库）
 *   WAREHOUSE_OUT         已出库
 *   WAREHOUSE_RETURN      已归还（状态归到 COMPLETED，但保留映射兼容历史）
 *   RECEIVED              已领取（历史状态，新流程不再使用）
 *   SCRAPPED              已报废
 *   LOCKED / UNLOCKED     工序流程锁定状态
 *
 * 注：REWORK 是审核结果（sampleReviewStatus），不是 PatternProduction.status，
 *     在 SAMPLE_REVIEW_STATUS_MAP 中定义。
 */
export const PATTERN_STATUS_MAP: StatusMap = {
  PENDING: { text: 'status.pattern.pending', color: 'default' },
  NOT_STARTED: { text: 'status.pattern.not_started', color: 'default' },
  RECEIVED: { text: 'status.pattern.received', color: 'processing' },
  IN_PROGRESS: { text: 'status.pattern.in_progress', color: 'processing' },
  PRODUCTION_COMPLETED: { text: 'status.pattern.production_completed', color: 'success' },
  COMPLETED: { text: 'status.pattern.completed', color: 'success' },
  WAREHOUSE_IN: { text: 'status.pattern.warehouse_in', color: 'success' },
  WAREHOUSE_OUT: { text: 'status.pattern.warehouse_out', color: 'processing' },
  WAREHOUSE_RETURN: { text: 'status.pattern.warehouse_return', color: 'default' },
  SCRAPPED: { text: 'status.pattern.scrapped', color: 'error' },
  RETURNED: { text: 'status.pattern.returned', color: 'error' },
  LOCKED: { text: 'status.pattern.locked', color: 'processing' },
  UNLOCKED: { text: 'status.pattern.unlocked', color: 'default' },
};

/* =========================== 物料对账状态 ============================ */
export const MATERIAL_RECON_STATUS_MAP: StatusMap = {
  pending: { text: 'status.recon.pending', color: 'default' },
  verified: { text: 'status.recon.verified', color: 'processing' },
  approved: { text: 'status.recon.approved', color: 'success' },
  paid: { text: 'status.recon.paid', color: 'success' },
  rejected: { text: 'status.recon.rejected', color: 'error' },
};

/* =========================== 工资/结算状态 ============================ */
export const SETTLEMENT_STATUS_MAP: StatusMap = {
  pending: { text: 'status.settlement.pending', color: 'default' },
  confirmed: { text: 'status.settlement.confirmed', color: 'processing' },
  production: { text: 'status.settlement.production', color: 'processing' },
  in_progress: { text: 'status.settlement.in_progress', color: 'processing' },
  completed: { text: 'status.settlement.completed', color: 'success' },
  cancelled: { text: 'status.settlement.cancelled', color: 'default' },
  canceled: { text: 'status.settlement.canceled', color: 'default' },
  closed: { text: 'status.settlement.closed', color: 'processing' },
  scrapped: { text: 'status.settlement.scrapped', color: 'error' },
  archived: { text: 'status.settlement.archived', color: 'default' },
  paused: { text: 'status.settlement.paused', color: 'warning' },
  returned: { text: 'status.settlement.returned', color: 'error' },
  delayed: { text: 'status.settlement.delayed', color: 'warning' },
};

/* =========================== 支付状态 ============================ */
export const PAYMENT_STATUS_MAP: StatusMap = {
  pending: { text: 'status.payment.pending', color: 'warning' },
  processing: { text: 'status.payment.processing', color: 'processing' },
  success: { text: 'status.payment.success', color: 'success' },
  failed: { text: 'status.payment.failed', color: 'error' },
  cancelled: { text: 'status.payment.cancelled', color: 'default' },
  rejected: { text: 'status.payment.rejected', color: 'error' },
  refunded: { text: 'status.payment.refunded', color: 'error' },
};

/* =========================== 工资条支付状态 ============================ */
export const PAYROLL_PAYMENT_STATUS_MAP: StatusMap = {
  unpaid: { text: 'status.payrollPayment.unpaid', color: 'error' },
  partially_paid: { text: 'status.payrollPayment.partially_paid', color: 'warning' },
  fully_paid: { text: 'status.payrollPayment.fully_paid', color: 'success' },
};

/* =========================== 工厂状态 ============================ */
export const FACTORY_STATUS_MAP: StatusMap = {
  active: { text: 'status.factory.active', color: 'success' },
  inactive: { text: 'status.factory.inactive', color: 'default' },
};

export const FACTORY_TYPE_MAP: StatusMap = {
  INTERNAL: { text: 'status.factoryType.internal', color: 'processing' },
  EXTERNAL: { text: 'status.factoryType.external', color: 'info' },
};

/* =========================== 物料/仓库状态 ============================ */
export const MATERIAL_STATUS_MAP: StatusMap = {
  completed: { text: 'status.material.completed', color: 'default' },
  pending: { text: 'status.material.pending', color: 'warning' },
  disabled: { text: 'status.material.disabled', color: 'error' },
};

export const SECONDARY_PROCESS_STATUS_MAP: StatusMap = {
  pending: { text: 'status.secondary.pending', color: 'default' },
  processing: { text: 'status.secondary.processing', color: 'processing' },
  completed: { text: 'status.secondary.completed', color: 'success' },
  cancelled: { text: 'status.secondary.cancelled', color: 'error' },
};

/* =========================== 裁剪菲状态 ============================ */
export const CUTTING_BUNDLE_STATUS_MAP: StatusMap = {
  created: { text: 'status.bundle.created', color: 'default' },
  active: { text: 'status.bundle.active', color: 'success' },
  qualified: { text: 'status.bundle.qualified', color: 'success' },
  unqualified: { text: 'status.bundle.unqualified', color: 'error' },
  inactive: { text: 'status.bundle.inactive', color: 'default' },
  split: { text: 'status.bundle.split', color: 'processing' },
  pending: { text: 'status.bundle.pending', color: 'default' },
  in_progress: { text: 'status.bundle.in_progress', color: 'processing' },
  completed: { text: 'status.bundle.completed', color: 'success' },
  bundled: { text: 'status.bundle.bundled', color: 'processing' },
};

/* =========================== 裁剪任务状态 ============================ */
export const CUTTING_TASK_STATUS_MAP: StatusMap = {
  pending: { text: 'status.task.pending', color: 'default' },
  in_progress: { text: 'status.task.in_progress', color: 'processing' },
  completed: { text: 'status.task.completed', color: 'success' },
  bundled: { text: 'status.task.bundled', color: 'processing' },
};

/* =========================== 外发工厂发货状态 ============================ */
export const FACTORY_SHIPMENT_STATUS_MAP: StatusMap = {
  pending: { text: 'status.shipment.pending', color: 'warning' },
  // D-242：分批收货中间态——已收部分、仍有在途未收
  partial: { text: 'status.shipment.partial', color: 'warning' },
  received: { text: 'status.shipment.received', color: 'processing' },
  quality_checked: { text: 'status.shipment.quality_checked', color: 'info' },
  partially_returned: { text: 'status.shipment.partially_returned', color: 'error' },
};

/* =========================== 款式订单状态 ============================ */
export const STYLE_ORDER_STATUS_MAP: StatusMap = {
  COMPLETED: { text: 'status.styleOrder.completed', color: 'success' },
  WAREHOUSED: { text: 'status.styleOrder.warehoused', color: 'success' },
  IN_PROGRESS: { text: 'status.styleOrder.in_progress', color: 'processing' },
  DRAFT: { text: 'status.styleOrder.draft', color: 'default' },
  CANCELLED: { text: 'status.styleOrder.cancelled', color: 'error' },
};

/* =========================== AI Agent 状态 ============================ */
export const AGENT_EXECUTION_STATUS_MAP: StatusMap = {
  SUCCESS: { text: 'status.agent.success', color: 'success' },
  FAILED: { text: 'status.agent.failed', color: 'error' },
  EXECUTING: { text: 'status.agent.executing', color: 'processing' },
  TIMEOUT: { text: 'status.agent.timeout', color: 'warning' },
  PENDING: { text: 'status.agent.pending', color: 'default' },
  UNKNOWN: { text: 'status.agent.unknown', color: 'default' },
};

/* =========================== 业务类型 ============================ */
export const BIZ_TYPE_MAP: StatusMap = {
  PAYROLL: { text: 'status.biz.payroll', color: 'processing' },
  PAYROLL_SETTLEMENT: { text: 'status.biz.payroll_settlement', color: 'processing' },
  ORDER_SETTLEMENT: { text: 'status.biz.order_settlement', color: 'processing' },
  RECONCILIATION: { text: 'status.biz.reconciliation', color: 'warning' },
  material_reconciliation: { text: 'status.biz.material_reconciliation', color: 'warning' },
  REIMBURSEMENT: { text: 'status.biz.reimbursement', color: 'info' },
  BILL_RECEIVABLE: { text: 'status.biz.bill_receivable', color: 'success' },
  BILL_PAYABLE: { text: 'status.biz.bill_payable', color: 'error' },
};

export const ORDER_BIZ_TYPE_MAP: StatusMap = {
  FOB: { text: 'status.orderBiz.fob', color: 'processing' },
  ODM: { text: 'status.orderBiz.odm', color: 'info' },
  OEM: { text: 'status.orderBiz.oem', color: 'processing' },
  CMT: { text: 'status.orderBiz.cmt', color: 'warning' },
};

/* =========================== 审核状态 ============================ */
export const REVIEW_STATUS_MAP: StatusMap = {
  PASS: { text: 'status.review.pass', color: 'success' },
  REWORK: { text: 'status.review.rework', color: 'warning' },
  REJECT: { text: 'status.review.reject', color: 'error' },
};

/* =========================== 通用辅助函数 ============================ */

/**
 * 从 statusMap 中查找状态配置（大小写兼容）
 * 优先精确匹配 → 小写 → 大写 → fallback
 */
export function resolveStatus(key: string, fallback?: StatusMapItem): StatusMapItem {
  const k = String(key ?? '').trim();
  if (!k) return fallback ?? { text: '-', color: 'default' };
  const found =
    ORDER_STATUS_MAP[k] ??
    ORDER_STATUS_MAP[k.toLowerCase()] ??
    ORDER_STATUS_MAP[k.toUpperCase()] ??
    fallback ??
    { text: 'common.unknown', color: 'default' };
  // D-520：text 为 i18n key，统一在此翻译后返回
  return { text: t(found.text), color: found.color };
}
