/**
 * 生产订单状态共享常量
 * 统一来源：后端 ProductionOrder.status 字段 + OrderProcessQueryService.calculateCurrentProcess
 * 与小程序 / H5 orderStatusHelper.js 保持一致
 * 文字 → 颜色映射严格按"待生产/生产中/已完成/已逾期/已报废/已取消/已暂停/已退回/已关单/已归档"分组
 */

const ORDER_STATUS_LABEL_BASE: Record<string, string> = {
  not_started:    '未开始',
  pending:        '待生产',
  procurement:    '物料采购',
  cutting:        '裁剪中',
  sewing:         '车缝中',
  secondary_process: '二次工艺',
  quality_check:  '质检中',
  warehousing:    '入库中',
  production:     '生产中',
  in_progress:    '生产中',
  completed:      '已完成',
  confirmed:      '已确认',
  draft:          '草稿',
  produced:       '已生产',
  warehoused:     '已入库',
  delayed:        '已逾期',
  scrapped:       '已报废',
  cancelled:      '已取消',
  canceled:       '已取消',
  paused:         '已暂停',
  returned:       '已退回',
  closed:         '已关单',
  archived:       '已归档',
  ironing:        '大烫',
  packaging:      '包装',
  material_preparation: '备料中',
  received:       '已领取',
  partial:        '部分到货',
  partial_arrival:'部分到货',
  awaiting_confirm:'待确认',
  warehouse_pending:'待入库',
  pending_audit:  '待初审',
  passed:         '初审通过',
  bundled:        '已成菲',
  created:        '已创建',
  OPEN:           '待处理',
  RESOLVED:       '已解决',
  REWORK:         '返工中',
  WAREHOUSE_OUT:  '已出仓',
  PRODUCTION_COMPLETED: '生产完成',
  IN_STOCK:       '在库',
  ISSUED:         '已发料',
  RETURNED:       '已退回',
  ENABLED:        '已启用',
  active:         '正常',
  inactive:       '已停用',
  PARTIAL:        '部分付款',
  OVERDUE:        '已逾期',
  SETTLING:       '结算中',
  SETTLED:        '已结算',
  ISSUED_INVOICE: '已开具',
  processing:     '处理中',
  refunded:       '已退款',
  borrowed:       '借出中',
  lost:           '已丢失',
  accepted:       '已接受',
  verified:       '已验证',
  repaired_waiting_qc: '返修待质检',
  CREATED:        '已创建',
  DISCONNECTED:   '未连接',
  unpaid:         '未付款',
  partially_paid: '部分已付',
  fully_paid:     '已付清',
  unrepaid:       '未还款',
  repaid:         '已还清',
};

const ORDER_STATUS_COLOR_BASE: Record<string, string> = {
  not_started:    'default',
  pending:        'default',
  procurement:    'processing',
  cutting:        'processing',
  sewing:         'processing',
  secondary_process: 'info',
  quality_check:  'processing',
  warehousing:    'processing',
  production:     'processing',
  in_progress:    'processing',
  completed:      'success',
  confirmed:      'processing',
  draft:          'default',
  produced:       'processing',
  warehoused:     'success',
  delayed:        'warning',
  scrapped:       'error',
  cancelled:      'default',
  canceled:       'default',
  paused:         'warning',
  returned:       'error',
  closed:         'processing',
  archived:       'default',
  ironing:        'processing',
  packaging:      'processing',
  material_preparation: 'processing',
  received:       'processing',
  partial:        'processing',
  partial_arrival:'processing',
  awaiting_confirm:'processing',
  warehouse_pending:'processing',
  pending_audit:  'processing',
  passed:         'success',
  bundled:        'processing',
  created:        'default',
  OPEN:           'processing',
  RESOLVED:       'success',
  REWORK:         'warning',
  WAREHOUSE_OUT:  'processing',
  PRODUCTION_COMPLETED: 'success',
  IN_STOCK:       'success',
  ISSUED:         'processing',
  RETURNED:       'error',
  ENABLED:        'success',
  active:         'success',
  inactive:       'default',
  PARTIAL:        'processing',
  OVERDUE:        'warning',
  SETTLING:       'processing',
  SETTLED:        'success',
  ISSUED_INVOICE: 'success',
  processing:     'processing',
  refunded:       'success',
  borrowed:       'processing',
  lost:           'error',
  accepted:       'success',
  verified:       'success',
  repaired_waiting_qc: 'warning',
  CREATED:        'default',
  DISCONNECTED:   'error',
  unpaid:         'error',
  partially_paid: 'processing',
  fully_paid:     'success',
  unrepaid:       'warning',
  repaid:         'success',
};

/** 大小写兼容：对传入的 key 先做 .toLowerCase() 再查找 */
const buildCaseInsensitiveMap = (base: Record<string, string>): Record<string, string> => {
  const map: Record<string, string> = { ...base };
  Object.keys(base).forEach(k => {
    const lower = k.toLowerCase();
    if (!(lower in map)) map[lower] = base[k];
    const upper = k.toUpperCase();
    if (!(upper in map)) map[upper] = base[k];
  });
  return map;
};

export const ORDER_STATUS_LABEL: Record<string, string> = buildCaseInsensitiveMap(ORDER_STATUS_LABEL_BASE);
export const ORDER_STATUS_COLOR: Record<string, string> = buildCaseInsensitiveMap(ORDER_STATUS_COLOR_BASE);

/** 小写规范化（与后端一致） */
export const ORDER_STATUS: Record<string, string> = {
  NOT_STARTED:    'not_started',
  PENDING:        'pending',
  PRODUCTION:     'production',
  IN_PROGRESS:    'in_progress',
  COMPLETED:      'completed',
  DELAYED:        'delayed',
  SCRAPPED:       'scrapped',
  CANCELLED:      'cancelled',
  CANCELED:       'canceled',
  PAUSED:         'paused',
  RETURNED:       'returned',
  CLOSED:         'closed',
  ARCHIVED:       'archived',
};

/**
 * 历史款式订单状态（StyleQuote 场景，值为大写英文）
 */
export const STYLE_ORDER_STATUS_LABEL: Record<string, string> = {
  COMPLETED:   '已完成',
  WAREHOUSED:  '已入库',
  IN_PROGRESS: '生产中',
  DRAFT:       '草稿',
  CANCELLED:   '已取消',
};

export const STYLE_ORDER_STATUS_COLOR: Record<string, string> = {
  COMPLETED:   'success',
  WAREHOUSED:  'success',
  IN_PROGRESS: 'processing',
  DRAFT:       'default',
  CANCELLED:   'error',
};
