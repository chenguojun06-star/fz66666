/**
 * 订单状态辅助函数
 * 统一管理订单、质检等状态文本转换
 * 与 PC 端 ORDER_STATUS_LABEL / 后端 OrderStatusConstants 保持一致
 * 关键：小写规范化 + 颜色分组（待生产/default，生产中/processing=blue，完成/success，逾期/warning，报废/error）
 */

const COLOR_DEFAULT = 'var(--color-text-disabled)';
const COLOR_SUCCESS = 'var(--color-success)';
const COLOR_WARNING = 'var(--color-warning)';
const COLOR_DANGER = 'var(--color-danger)';
const COLOR_PROCESSING = 'var(--color-primary)'; // 与前端 processing 对应（生产中/活跃工序）
const COLOR_BLUE = 'var(--color-info)';
const COLOR_CYAN = 'var(--color-tertiary)';
const COLOR_ORANGE = 'var(--color-warning-secondary)';
const COLOR_VOLCANO = 'var(--color-danger)';
const COLOR_PURPLE = 'var(--color-purple)';
const COLOR_GEEKBLUE = 'var(--color-geekblue)';
const COLOR_FALLBACK = 'var(--color-text-secondary)';

/** 主状态标签映射（与 PC 端 orderStatus.ts 保持一致） */
const STATUS_LABEL_MAP = {
  not_started: '未开始',
  pending: '待生产',
  procurement: '物料采购',
  cutting: '裁剪中',
  sewing: '车缝中',
  secondary_process: '二次工艺',
  quality_check: '质检中',
  warehousing: '入库中',
  production: '生产中',
  in_progress: '生产中',
  completed: '已完成',
  confirmed: '已确认',
  draft: '草稿',
  produced: '已生产',
  warehoused: '已入库',
  delayed: '已逾期',
  scrapped: '已报废',
  cancelled: '已取消',
  canceled: '已取消',
  paused: '已暂停',
  returned: '已退回',
  closed: '已关单',
  archived: '已归档',
  ironing: '大烫',
  packaging: '包装',
  material_preparation: '备料中',
  received: '已领取',
  partial: '部分到货',
  partial_arrival: '部分到货',
  awaiting_confirm: '待确认',
  warehouse_pending: '待入库',
  pending_audit: '待初审',
  passed: '初审通过',
  bundled: '已成菲',
  created: '已创建',
};

/** 主状态颜色映射（与 PC 端 ORDER_STATUS_COLOR 保持一致） */
const STATUS_COLOR_MAP = {
  // 与 PC 端 constants/statusMaps.ts ORDER_STATUS_MAP 保持一致
  not_started: COLOR_DEFAULT,
  pending: COLOR_DEFAULT,
  procurement: COLOR_BLUE,
  cutting: COLOR_CYAN,
  sewing: COLOR_CYAN,
  secondary_process: COLOR_PURPLE,
  quality_check: COLOR_GEEKBLUE,
  warehousing: COLOR_GEEKBLUE,
  production: COLOR_PROCESSING,
  in_progress: COLOR_PROCESSING,
  completed: COLOR_SUCCESS,
  confirmed: COLOR_BLUE,
  draft: COLOR_DEFAULT,
  produced: COLOR_CYAN,
  warehoused: COLOR_SUCCESS,
  delayed: COLOR_WARNING,
  scrapped: COLOR_DANGER,
  cancelled: COLOR_DEFAULT,
  canceled: COLOR_DEFAULT,
  paused: COLOR_ORANGE,
  returned: COLOR_VOLCANO,
  closed: COLOR_BLUE,
  archived: COLOR_DEFAULT,
  ironing: COLOR_CYAN,
  packaging: COLOR_GEEKBLUE,
  material_preparation: COLOR_BLUE,
  received: COLOR_BLUE,
  partial: COLOR_CYAN,
  partial_arrival: COLOR_CYAN,
  awaiting_confirm: COLOR_BLUE,
  warehouse_pending: COLOR_GEEKBLUE,
  pending_audit: COLOR_BLUE,
  passed: COLOR_SUCCESS,
  bundled: COLOR_CYAN,
  created: COLOR_DEFAULT,
};

function orderStatusText(status) {
  const s = (status || '').toString().trim().toLowerCase();
  if (!s) return '';
  return STATUS_LABEL_MAP[s] || '未知';
}

function qualityStatusText(status) {
  const s = (status || '').toString().trim().toLowerCase();
  const map = {
    qualified: '合格',
    unqualified: '次品待返修',
    repaired: '返修完成',
  };
  if (!s) return '';
  return map[s] || '未知';
}

function scanResultText(status) {
  const s = (status || '').toString().trim().toLowerCase();
  const map = {
    success: '成功',
    failure: '失败',
  };
  if (!s) return '';
  return map[s] || '未知';
}

function getStatusColor(status) {
  const s = (status || '').toString().trim().toLowerCase();
  return STATUS_COLOR_MAP[s] || COLOR_FALLBACK;
}

function getQualityColor(qualityStatus) {
  const s = (qualityStatus || '').toString().trim().toLowerCase();
  const colorMap = {
    qualified: COLOR_SUCCESS,
    unqualified: COLOR_DANGER,
    repaired: COLOR_DEFAULT,
  };
  return colorMap[s] || COLOR_FALLBACK;
}

module.exports = {
  orderStatusText,
  qualityStatusText,
  scanResultText,
  getStatusColor,
  getQualityColor,
};
