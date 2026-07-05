/**
 * 跨端共享状态映射（P1-6）
 *
 * 与 PC 端 frontend/src/constants/statusMaps.ts 对齐：
 *   - MATERIAL_PURCHASE_STATUS_MAP：采购单状态（待采购/已到货/部分到货/...）
 *   - PATTERN_STATUS_MAP：纸样状态（未开始/进行中/已完成/...）
 *
 * 颜色取值与 PC 端 StatusMap 一致：
 *   default | processing | success | warning | error
 *
 * 使用方式：
 *   const { MATERIAL_PURCHASE_STATUS_MAP, PATTERN_STATUS_MAP, getPurchaseStatusText } = require('../../../shared/statusMap');
 *   const text = getPurchaseStatusText('partial_arrived'); // '部分到货'
 *
 * 注意：
 *   - 小程序展示层 utils/displayHelper.js 的 ORDER_STATUS_LABEL/COLOR 是「订单状态」映射（生产工序），
 *     与本文件的「采购单状态」映射是两套独立的语义，不要混用。
 *   - 某些页面（如 procurement/task-detail）有业务特定文案（领取视角），不应直接换用本文件，
 *     仅可参考本文件的颜色映射保持视觉一致。
 */

/**
 * 采购单状态映射（与 PC MATERIAL_PURCHASE_STATUS_MAP 一致）
 * 包含历史别名，便于兼容后端不同版本的枚举值。
 */
const MATERIAL_PURCHASE_STATUS_MAP = {
  pending:              { text: '待采购',      color: 'warning' },
  procurement:          { text: '采购中',      color: 'processing' },
  purchasing:           { text: '采购中',      color: 'processing' },
  material_preparation: { text: '备料中',      color: 'processing' },
  received:             { text: '已到货',      color: 'success' },
  partial:              { text: '部分到货',    color: 'warning' },
  partial_arrival:      { text: '部分到货',    color: 'warning' },
  partial_arrived:      { text: '部分到货',    color: 'warning' },
  awaiting_confirm:     { text: '待确认',      color: 'processing' },
  warehouse_pending:    { text: '待仓库出库',  color: 'processing' },
  completed:            { text: '已完成',      color: 'success' },
  cancelled:            { text: '已取消',      color: 'default' },
  canceled:             { text: '已取消',      color: 'default' },
};

/**
 * 纸样状态映射（与 PC PATTERN_STATUS_MAP 一致）
 */
const PATTERN_STATUS_MAP = {
  PENDING:      { text: '未开始',  color: 'default' },
  NOT_STARTED:  { text: '未开始',  color: 'default' },
  IN_PROGRESS:  { text: '进行中',  color: 'processing' },
  COMPLETED:    { text: '已完成',  color: 'success' },
  RETURNED:     { text: '已退回',  color: 'error' },
  LOCKED:       { text: '已锁定',  color: 'processing' },
  UNLOCKED:     { text: '未锁定',  color: 'default' },
};

function normalizeKey(s) {
  return String(s || '').trim().toLowerCase();
}

/** 取采购单状态文案，未命中返回原值或空字符串 */
function getPurchaseStatusText(status, fallback) {
  const k = normalizeKey(status);
  if (!k) return fallback || '';
  const entry = MATERIAL_PURCHASE_STATUS_MAP[k];
  return entry ? entry.text : (fallback != null ? fallback : String(status));
}

/** 取采购单状态颜色，未命中返回 default */
function getPurchaseStatusColor(status) {
  const k = normalizeKey(status);
  const entry = MATERIAL_PURCHASE_STATUS_MAP[k];
  return entry ? entry.color : 'default';
}

/** 取纸样状态文案（key 大写匹配），未命中返回原值或空字符串 */
function getPatternStatusText(status, fallback) {
  const k = String(status || '').trim().toUpperCase();
  if (!k) return fallback || '';
  const entry = PATTERN_STATUS_MAP[k];
  return entry ? entry.text : (fallback != null ? fallback : String(status));
}

/** 取纸样状态颜色，未命中返回 default */
function getPatternStatusColor(status) {
  const k = String(status || '').trim().toUpperCase();
  const entry = PATTERN_STATUS_MAP[k];
  return entry ? entry.color : 'default';
}

module.exports = {
  MATERIAL_PURCHASE_STATUS_MAP: MATERIAL_PURCHASE_STATUS_MAP,
  PATTERN_STATUS_MAP: PATTERN_STATUS_MAP,
  getPurchaseStatusText: getPurchaseStatusText,
  getPurchaseStatusColor: getPurchaseStatusColor,
  getPatternStatusText: getPatternStatusText,
  getPatternStatusColor: getPatternStatusColor,
};
