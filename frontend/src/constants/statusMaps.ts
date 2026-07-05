/**
 * 状态映射统一常量
 *
 * 【设计原则】
 * - 所有状态值统一为小写英文（与后端数据库一致）
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

export type StatusMapItem = {
  text: string;
  color: string;
};

export type StatusMap = Record<string, StatusMapItem>;

/* =========================== 通用主状态映射（ORDER_STATUS_MAP）=========================== */
export const ORDER_STATUS_MAP: StatusMap = {
  // 基础状态
  not_started:    { text: '未开始',      color: 'default' },
  pending:        { text: '待生产',      color: 'default' },
  production:     { text: '生产中',      color: 'processing' },
  in_progress:    { text: '生产中',      color: 'processing' },
  paused:         { text: '已暂停',      color: 'warning' },
  // 工序阶段
  procurement:    { text: '物料采购',    color: 'processing' },
  cutting:        { text: '裁剪中',      color: 'processing' },
  sewing:         { text: '车缝中',      color: 'processing' },
  ironing:        { text: '大烫',        color: 'processing' },
  secondary_process: { text: '二次工艺', color: 'info' },
  quality_check:  { text: '质检中',      color: 'processing' },
  warehousing:    { text: '入库中',      color: 'processing' },
  packaging:      { text: '包装',        color: 'processing' },
  // 终止/异常
  completed:      { text: '已完成',      color: 'success' },
  delayed:        { text: '已逾期',      color: 'warning' },
  scrapped:       { text: '已报废',      color: 'error' },
  cancelled:      { text: '已取消',      color: 'default' },
  canceled:       { text: '已取消',      color: 'default' },
  returned:       { text: '已退回',      color: 'error' },
  closed:         { text: '已关单',      color: 'processing' },
  archived:       { text: '已归档',      color: 'default' },
  // 辅助状态
  confirmed:      { text: '已确认',      color: 'processing' },
  draft:          { text: '草稿',       color: 'default' },
  produced:       { text: '已生产',      color: 'processing' },
  warehoused:     { text: '已入库',      color: 'success' },
  received:       { text: '已领取',      color: 'processing' },
  partial:        { text: '部分到货',    color: 'processing' },
  partial_arrival:{ text: '部分到货',    color: 'processing' },
  awaiting_confirm:{ text: '待确认',     color: 'processing' },
  warehouse_pending:{ text: '待入库',    color: 'processing' },
  pending_audit:  { text: '待初审',     color: 'processing' },
  passed:         { text: '初审通过',    color: 'success' },
  bundled:        { text: '已成菲',      color: 'processing' },
  created:        { text: '已创建',      color: 'default' },
  material_preparation: { text: '备料中', color: 'processing' },
  // 通用大写
  OPEN:           { text: '待处理',      color: 'processing' },
  RESOLVED:       { text: '已解决',     color: 'success' },
  REWORK:         { text: '返工中',      color: 'warning' },
  WAREHOUSE_OUT:  { text: '已出仓',      color: 'processing' },
  PRODUCTION_COMPLETED: { text: '生产完成', color: 'success' },
  IN_STOCK:       { text: '在库',        color: 'success' },
  ISSUED:         { text: '已发料',      color: 'processing' },
  RETURNED:       { text: '已退回',      color: 'error' },
  ENABLED:        { text: '已启用',      color: 'success' },
  active:         { text: '正常',        color: 'success' },
  inactive:       { text: '已停用',      color: 'default' },
  PARTIAL:        { text: '部分付款',    color: 'processing' },
  OVERDUE:        { text: '已逾期',      color: 'warning' },
  SETTLING:       { text: '结算中',      color: 'processing' },
  SETTLED:        { text: '已结算',      color: 'success' },
  ISSUED_INVOICE: { text: '已开具',      color: 'success' },
  processing:     { text: '处理中',      color: 'processing' },
  refunded:       { text: '已退款',      color: 'success' },
  borrowed:       { text: '借出中',      color: 'processing' },
  lost:           { text: '已丢失',      color: 'error' },
  accepted:       { text: '已接受',      color: 'success' },
  verified:       { text: '已验证',      color: 'success' },
  repaired_waiting_qc: { text: '返修待质检', color: 'warning' },
  CREATED:        { text: '已创建',      color: 'default' },
  DISCONNECTED:   { text: '未连接',      color: 'error' },
  unpaid:         { text: '未付款',      color: 'error' },
  partially_paid: { text: '部分已付',    color: 'processing' },
  fully_paid:    { text: '已付清',      color: 'success' },
  unrepaid:       { text: '未还款',      color: 'warning' },
  repaid:         { text: '已还清',      color: 'success' },
};

/* =========================== 物料采购状态 ============================ */
export const MATERIAL_PURCHASE_STATUS_MAP: StatusMap = {
  pending:            { text: '待采购',      color: 'warning' },
  procurement:        { text: '采购中',      color: 'processing' },
  purchasing:        { text: '采购中',      color: 'processing' },
  material_preparation: { text: '备料中',    color: 'processing' },
  received:           { text: '已到货',      color: 'success' },
  partial:            { text: '部分到料',    color: 'processing' },
  partial_arrival:    { text: '部分到料',    color: 'processing' },
  awaiting_confirm:   { text: '待确认',      color: 'processing' },
  warehouse_pending:  { text: '待仓库出库',  color: 'processing' },
  completed:          { text: '已完成',      color: 'success' },
  cancelled:          { text: '已取消',      color: 'default' },
};

/* =========================== 物料对账状态 ============================ */
export const MATERIAL_RECON_STATUS_MAP: StatusMap = {
  pending:   { text: '待核实', color: 'default' },
  verified:  { text: '已核实', color: 'processing' },
  approved:  { text: '已审批', color: 'success' },
  paid:      { text: '已付款', color: 'success' },
  rejected: { text: '已驳回', color: 'error' },
};

/* =========================== 工资/结算状态 ============================ */
export const SETTLEMENT_STATUS_MAP: StatusMap = {
  pending:     { text: '待生产', color: 'default' },
  confirmed:   { text: '已确认', color: 'processing' },
  production:  { text: '生产中', color: 'processing' },
  in_progress: { text: '生产中', color: 'processing' },
  completed:   { text: '已完成', color: 'success' },
  cancelled:   { text: '已取消', color: 'default' },
  canceled:    { text: '已取消', color: 'default' },
  closed:     { text: '已关单', color: 'processing' },
  scrapped:   { text: '已报废', color: 'error' },
  archived:   { text: '已归档', color: 'default' },
  paused:     { text: '已暂停', color: 'warning' },
  returned:   { text: '已退回', color: 'error' },
  delayed:    { text: '已逾期', color: 'warning' },
};

/* =========================== 支付状态 ============================ */
export const PAYMENT_STATUS_MAP: StatusMap = {
  pending:    { text: '待支付',   color: 'warning' },
  processing: { text: '支付中',   color: 'processing' },
  success:    { text: '已支付',   color: 'success' },
  failed:     { text: '支付失败', color: 'error' },
  cancelled:  { text: '已取消',   color: 'default' },
  rejected:   { text: '已驳回',   color: 'error' },
  refunded:   { text: '已退回',   color: 'error' },
};

/* =========================== 工资条支付状态 ============================ */
export const PAYROLL_PAYMENT_STATUS_MAP: StatusMap = {
  unpaid:         { text: '未付',   color: 'error' },
  partially_paid: { text: '部分已付', color: 'warning' },
  fully_paid:    { text: '已付清', color: 'success' },
};

/* =========================== 工厂状态 ============================ */
export const FACTORY_STATUS_MAP: StatusMap = {
  active:   { text: '启用',   color: 'success' },
  inactive: { text: '停用',   color: 'default' },
};

export const FACTORY_TYPE_MAP: StatusMap = {
  INTERNAL:  { text: '内部', color: 'processing' },
  EXTERNAL:  { text: '外部', color: 'info' },
};

/* =========================== 物料/仓库状态 ============================ */
export const MATERIAL_STATUS_MAP: StatusMap = {
  completed: { text: '已完成', color: 'default' },
  pending:   { text: '待完成', color: 'warning' },
  disabled:  { text: '已停用', color: 'error' },
};

export const SECONDARY_PROCESS_STATUS_MAP: StatusMap = {
  pending:    { text: '待处理', color: 'default' },
  processing: { text: '处理中', color: 'processing' },
  completed:  { text: '已完成', color: 'success' },
  cancelled:  { text: '已取消', color: 'error' },
};

/* =========================== 裁剪菲状态 ============================ */
export const CUTTING_BUNDLE_STATUS_MAP: StatusMap = {
  created:     { text: '已创建',    color: 'default' },
  active:      { text: '有效',      color: 'success' },
  qualified:   { text: '合格',      color: 'success' },
  unqualified: { text: '不合格',    color: 'error' },
  inactive:    { text: '无效',      color: 'default' },
  split:       { text: '已拆分',    color: 'processing' },
  pending:     { text: '待处理',    color: 'default' },
  in_progress: { text: '进行中',    color: 'processing' },
  completed:   { text: '已完成',    color: 'success' },
  bundled:     { text: '已成菲',    color: 'processing' },
};

/* =========================== 裁剪任务状态 ============================ */
export const CUTTING_TASK_STATUS_MAP: StatusMap = {
  pending:     { text: '待裁剪',    color: 'default' },
  in_progress: { text: '裁剪中',    color: 'processing' },
  completed:   { text: '已完成',    color: 'success' },
  bundled:     { text: '已成菲',    color: 'processing' },
};

/* =========================== 外发工厂发货状态 ============================ */
export const FACTORY_SHIPMENT_STATUS_MAP: StatusMap = {
  pending:           { text: '待收货',       color: 'warning' },
  received:          { text: '已收货',       color: 'processing' },
  quality_checked:   { text: '已质检',       color: 'info' },
  partially_returned:{ text: '部分退回返修', color: 'error' },
};

/* =========================== 款式订单状态 ============================ */
export const STYLE_ORDER_STATUS_MAP: StatusMap = {
  COMPLETED:   { text: '已完成', color: 'success' },
  WAREHOUSED:  { text: '已入库', color: 'success' },
  IN_PROGRESS: { text: '生产中', color: 'processing' },
  DRAFT:       { text: '草稿',   color: 'default' },
  CANCELLED:   { text: '已取消', color: 'error' },
};

/* =========================== AI Agent 状态 ============================ */
export const AGENT_EXECUTION_STATUS_MAP: StatusMap = {
  SUCCESS:    { text: '成功',   color: 'success' },
  FAILED:     { text: '失败',   color: 'error' },
  EXECUTING:  { text: '执行中', color: 'processing' },
  TIMEOUT:    { text: '超时',   color: 'warning' },
  PENDING:    { text: '待执行', color: 'default' },
  UNKNOWN:    { text: '未知',   color: 'default' },
};

/* =========================== 业务类型 ============================ */
export const BIZ_TYPE_MAP: StatusMap = {
  PAYROLL:               { text: '员工工资',   color: 'processing' },
  PAYROLL_SETTLEMENT:    { text: '工资结算',   color: 'processing' },
  ORDER_SETTLEMENT:     { text: '订单结算',   color: 'processing' },
  RECONCILIATION:       { text: '工厂对账',   color: 'warning' },
  material_reconciliation: { text: '工厂对账', color: 'warning' },
  REIMBURSEMENT:        { text: '费用报销',   color: 'info' },
  BILL_RECEIVABLE:      { text: '应收账款',   color: 'success' },
  BILL_PAYABLE:         { text: '应付账款',   color: 'error' },
};

export const ORDER_BIZ_TYPE_MAP: StatusMap = {
  FOB:  { text: 'FOB 离岸价', color: 'processing' },
  ODM:  { text: 'ODM 原厂设计', color: 'info' },
  OEM:  { text: 'OEM 代工生产', color: 'processing' },
  CMT:  { text: 'CMT 来料加工', color: 'warning' },
};

/* =========================== 审核状态 ============================ */
export const REVIEW_STATUS_MAP: StatusMap = {
  PASS:   { text: '通过',   color: 'success' },
  REWORK: { text: '需修改', color: 'warning' },
  REJECT: { text: '不通过', color: 'error' },
};

/* =========================== 通用辅助函数 ============================ */

/**
 * 从 statusMap 中查找状态配置（大小写兼容）
 * 优先精确匹配 → 小写 → 大写 → fallback
 */
export function resolveStatus(key: string, fallback?: StatusMapItem): StatusMapItem {
  const k = String(key ?? '').trim();
  if (!k) return fallback ?? { text: '-', color: 'default' };
  return (
    ORDER_STATUS_MAP[k] ??
    ORDER_STATUS_MAP[k.toLowerCase()] ??
    ORDER_STATUS_MAP[k.toUpperCase()] ??
    fallback ??
    { text: k, color: 'default' }
  );
}
