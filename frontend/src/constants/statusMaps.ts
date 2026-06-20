/**
 * 状态映射统一常量
 *
 * 【设计原则】
 * - 所有状态值统一为小写英文（与后端数据库一致）
 * - 同一状态值在所有域（生产/采购/质检/工资/财务）的文字/颜色必须一致
 * - Ant Design Tag color 语义：default(灰)=静止，processing(蓝)=活跃，success(绿)=完成，warning(黄)=逾期/警告，error(红)=失败/报废
 * - 各组件/页面内联 statusMap 暂不改动（改动面太大），在新增代码中强制引用本文件
 *
 * 【主状态色值规范】
 *   not_started    → default（未开始，灰）
 *   pending        → default（待生产/待采购/待确认，灰）
 *   procurement    → blue（物料采购，蓝）
 *   cutting        → cyan（裁剪，青）
 *   sewing         → cyan（车缝，青）
 *   ironing        → cyan（大烫，青）
 *   secondary_process → purple（二次工艺，紫）
 *   quality_check  → geekblue（质检，青蓝）
 *   warehousing    → geekblue（入库，青蓝）
 *   production     → processing（生产中，蓝）
 *   in_progress    → processing（进行中，蓝）
 *   paused         → orange（已暂停，橙）
 *   completed      → success（已完成，绿）
 *   warehoused     → success（已入库，绿）
 *   delayed        → warning（已逾期，黄）
 *   scrapped       → error（已报废，红）
 *   cancelled      → default（已取消，灰）
 *   returned       → volcano（已退回，红灰）
 *   closed         → blue（已关单，蓝）
 *   archived       → default（已归档，灰）
 *   active/enabled → success（启用，绿）
 *   inactive/disabled → default（停用，灰）
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
  paused:         { text: '已暂停',      color: 'orange' },
  // 工序阶段
  procurement:    { text: '物料采购',    color: 'blue' },
  cutting:        { text: '裁剪中',      color: 'cyan' },
  sewing:         { text: '车缝中',      color: 'cyan' },
  ironing:        { text: '大烫',        color: 'cyan' },
  secondary_process: { text: '二次工艺', color: 'purple' },
  quality_check:  { text: '质检中',      color: 'geekblue' },
  warehousing:    { text: '入库中',      color: 'geekblue' },
  packaging:      { text: '包装',        color: 'geekblue' },
  // 终止/异常
  completed:      { text: '已完成',      color: 'success' },
  delayed:        { text: '已逾期',      color: 'warning' },
  scrapped:       { text: '已报废',      color: 'error' },
  cancelled:      { text: '已取消',      color: 'default' },
  canceled:       { text: '已取消',      color: 'default' },
  returned:       { text: '已退回',      color: 'volcano' },
  closed:         { text: '已关单',      color: 'blue' },
  archived:       { text: '已归档',      color: 'default' },
  // 辅助状态
  confirmed:      { text: '已确认',      color: 'blue' },
  draft:          { text: '草稿',       color: 'default' },
  produced:       { text: '已生产',      color: 'cyan' },
  warehoused:     { text: '已入库',      color: 'success' },
  received:       { text: '已领取',      color: 'blue' },
  partial:        { text: '部分到货',    color: 'cyan' },
  partial_arrival:{ text: '部分到货',    color: 'cyan' },
  awaiting_confirm:{ text: '待确认',     color: 'blue' },
  warehouse_pending:{ text: '待入库',    color: 'geekblue' },
  pending_audit:  { text: '待初审',     color: 'blue' },
  passed:         { text: '初审通过',    color: 'success' },
  bundled:        { text: '已成菲',      color: 'cyan' },
  created:        { text: '已创建',      color: 'default' },
  material_preparation: { text: '备料中', color: 'blue' },
  // 通用大写
  OPEN:           { text: '待处理',      color: 'blue' },
  RESOLVED:       { text: '已解决',     color: 'success' },
  REWORK:         { text: '返工中',      color: 'orange' },
  WAREHOUSE_OUT:  { text: '已出仓',      color: 'geekblue' },
  PRODUCTION_COMPLETED: { text: '生产完成', color: 'success' },
  IN_STOCK:       { text: '在库',        color: 'success' },
  ISSUED:         { text: '已发料',      color: 'blue' },
  RETURNED:       { text: '已退回',      color: 'volcano' },
  ENABLED:        { text: '已启用',      color: 'success' },
  active:         { text: '正常',        color: 'success' },
  inactive:       { text: '已停用',      color: 'default' },
  PARTIAL:        { text: '部分付款',    color: 'cyan' },
  OVERDUE:        { text: '已逾期',      color: 'warning' },
  SETTLING:       { text: '结算中',      color: 'processing' },
  SETTLED:        { text: '已结算',      color: 'success' },
  ISSUED_INVOICE: { text: '已开具',      color: 'success' },
  processing:     { text: '处理中',      color: 'processing' },
  refunded:       { text: '已退款',      color: 'success' },
  borrowed:       { text: '借出中',      color: 'blue' },
  lost:           { text: '已丢失',      color: 'error' },
  accepted:       { text: '已接受',      color: 'success' },
  verified:       { text: '已验证',      color: 'success' },
  repaired_waiting_qc: { text: '返修待质检', color: 'orange' },
  CREATED:        { text: '已创建',      color: 'default' },
  DISCONNECTED:   { text: '未连接',      color: 'error' },
  unpaid:         { text: '未付款',      color: 'error' },
  partially_paid: { text: '部分已付',    color: 'cyan' },
  fully_paid:    { text: '已付清',      color: 'success' },
  unrepaid:       { text: '未还款',      color: 'warning' },
  repaid:         { text: '已还清',      color: 'success' },
};

/* =========================== 物料采购状态 ============================ */
export const MATERIAL_PURCHASE_STATUS_MAP: StatusMap = {
  pending:            { text: '待采购',      color: 'orange' },
  procurement:        { text: '采购中',      color: 'blue' },
  purchasing:        { text: '采购中',      color: 'blue' },
  material_preparation: { text: '备料中',    color: 'blue' },
  received:           { text: '已到货',      color: 'success' },
  partial:            { text: '部分到料',    color: 'cyan' },
  partial_arrival:    { text: '部分到料',    color: 'cyan' },
  awaiting_confirm:   { text: '待确认',      color: 'blue' },
  warehouse_pending:  { text: '待仓库出库',  color: 'geekblue' },
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
  confirmed:   { text: '已确认', color: 'blue' },
  production:  { text: '生产中', color: 'processing' },
  in_progress: { text: '生产中', color: 'processing' },
  completed:   { text: '已完成', color: 'success' },
  cancelled:   { text: '已取消', color: 'default' },
  canceled:    { text: '已取消', color: 'default' },
  closed:     { text: '已关单', color: 'blue' },
  scrapped:   { text: '已报废', color: 'error' },
  archived:   { text: '已归档', color: 'default' },
  paused:     { text: '已暂停', color: 'orange' },
  returned:   { text: '已退回', color: 'volcano' },
  delayed:    { text: '已逾期', color: 'warning' },
};

/* =========================== 支付状态 ============================ */
export const PAYMENT_STATUS_MAP: StatusMap = {
  pending:    { text: '待支付',   color: 'orange' },
  processing: { text: '支付中',   color: 'blue' },
  success:    { text: '已支付',   color: 'green' },
  failed:     { text: '支付失败', color: 'red' },
  cancelled:  { text: '已取消',   color: 'default' },
  rejected:   { text: '已驳回',   color: 'red' },
  refunded:   { text: '已退回',   color: 'volcano' },
};

/* =========================== 工资条支付状态 ============================ */
export const PAYROLL_PAYMENT_STATUS_MAP: StatusMap = {
  unpaid:         { text: '未付',   color: 'error' },
  partially_paid: { text: '部分已付', color: 'orange' },
  fully_paid:    { text: '已付清', color: 'success' },
};

/* =========================== 工厂状态 ============================ */
export const FACTORY_STATUS_MAP: StatusMap = {
  active:   { text: '启用',   color: 'success' },
  inactive: { text: '停用',   color: 'default' },
};

export const FACTORY_TYPE_MAP: StatusMap = {
  INTERNAL:  { text: '内部', color: 'blue' },
  EXTERNAL:  { text: '外部', color: 'purple' },
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
  bundled:     { text: '已成菲',    color: 'cyan' },
};

/* =========================== 裁剪任务状态 ============================ */
export const CUTTING_TASK_STATUS_MAP: StatusMap = {
  pending:     { text: '待裁剪',    color: 'default' },
  in_progress: { text: '裁剪中',    color: 'processing' },
  completed:   { text: '已完成',    color: 'success' },
  bundled:     { text: '已成菲',    color: 'cyan' },
};

/* =========================== 外发工厂发货状态 ============================ */
export const FACTORY_SHIPMENT_STATUS_MAP: StatusMap = {
  pending:           { text: '待收货',       color: 'orange' },
  received:          { text: '已收货',       color: 'blue' },
  quality_checked:   { text: '已质检',       color: 'purple' },
  partially_returned:{ text: '部分退回返修', color: 'red' },
};

/* =========================== 款式订单状态 ============================ */
export const STYLE_ORDER_STATUS_MAP: StatusMap = {
  COMPLETED:   { text: '已完成', color: 'success' },
  WAREHOUSED:  { text: '已入库', color: 'success' },
  IN_PROGRESS: { text: '生产中', color: 'blue' },
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
  PAYROLL:               { text: '员工工资',   color: 'blue' },
  PAYROLL_SETTLEMENT:    { text: '工资结算',   color: 'blue' },
  ORDER_SETTLEMENT:     { text: '订单结算',   color: 'cyan' },
  RECONCILIATION:       { text: '工厂对账',   color: 'orange' },
  material_reconciliation: { text: '工厂对账', color: 'orange' },
  REIMBURSEMENT:        { text: '费用报销',   color: 'purple' },
  BILL_RECEIVABLE:      { text: '应收账款',   color: 'green' },
  BILL_PAYABLE:         { text: '应付账款',   color: 'volcano' },
};

export const ORDER_BIZ_TYPE_MAP: StatusMap = {
  FOB:  { text: 'FOB', color: 'cyan' },
  ODM:  { text: 'ODM', color: 'purple' },
  OEM:  { text: 'OEM', color: 'blue' },
  CMT:  { text: 'CMT', color: 'orange' },
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
