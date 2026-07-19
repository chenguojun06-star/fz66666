/**
 * 订单状态辅助函数
 * 统一管理订单、质检等状态文本转换
 *
 * 状态文案统一代理到 utils/displayHelper.js（覆盖 40+ 状态，含 cutting/sewing/procurement 等工序），
 * 避免各页面独立维护导致 cutting 等工序状态显示英文/未知。
 */

const { displayStatusText, displayStatusColor } = require('../../../utils/displayHelper');

const COLOR_DEFAULT = 'var(--color-text-disabled)';
const COLOR_SUCCESS = 'var(--color-success)';
const COLOR_WARNING = 'var(--color-warning)';
const COLOR_DANGER = 'var(--color-danger)';
const COLOR_FALLBACK = 'var(--color-text-secondary)';

/**
 * 将订单状态码转换为中文文本
 * 直接走 displayHelper.displayStatusText（覆盖所有工序状态）
 */
function orderStatusText(status) {
  return displayStatusText(status);
}

/**
 * 将质检状态码转换为中文文本
 * @param {string} status - 质检状态码
 * @returns {string} 中文状态文本
 */
function qualityStatusText(status) {
  const s = (status || '').toString().trim().toLowerCase();
  const map = {
    qualified: '合格',
    unqualified: '次品待返修',
    repaired: '返修完成',
  };
  if (!s) {
    return '';
  }
  return map[s] || '未知';
}

/**
 * 将扫码结果码转换为中文文本
 * @param {string} status - 扫码结果码
 * @returns {string} 中文状态文本
 */
function scanResultText(status) {
  const s = (status || '').toString().trim().toLowerCase();
  const map = {
    success: '成功',
    failure: '失败',
  };
  if (!s) {
    return '';
  }
  return map[s] || '未知';
}

/**
 * 根据订单状态获取对应的颜色
 * @param {string} status - 状态码
 * @returns {string} 颜色值
 */
function getStatusColor(status) {
  const s = (status || '').toString().trim().toLowerCase();
  const colorMap = {
    pending: COLOR_DEFAULT,
    production: COLOR_SUCCESS,
    completed: COLOR_SUCCESS,
    delayed: COLOR_WARNING,
    scrapped: COLOR_DANGER,
    cancelled: COLOR_DANGER,
    canceled: COLOR_DANGER,
    paused: COLOR_WARNING,
    returned: COLOR_DANGER,
    closed: COLOR_SUCCESS,
    archived: COLOR_DEFAULT,
  };
  return colorMap[s] || COLOR_FALLBACK;
}

/**
 * 根据质检状态获取对应的颜色
 * @param {string} qualityStatus - 质检状态码
 * @returns {string} 颜色值
 */
function getQualityColor(qualityStatus) {
  const s = (qualityStatus || '').toString().trim().toLowerCase();
  const colorMap = {
    qualified: COLOR_SUCCESS,
    unqualified: COLOR_DANGER,
    repaired: COLOR_DEFAULT,
  };
  return colorMap[s] || COLOR_FALLBACK;
}

/**
 * 根据订单状态获取封面徽标样式类名
 * @param {string} status - 状态码
 * @returns {string} CSS 类名后缀（production/completed/overdue/pending）
 *
 * 补全 cutting/sewing/procurement/ironing/packaging/quality_check/warehousing 等工序状态
 * 与 utils/displayHelper.js ORDER_STATUS_LABEL 完全对齐
 */
function orderStatusBadgeClass(status) {
  const s = (status || '').toString().trim().toLowerCase();
  const map = {
    // 灰色：未开始/暂停/草稿
    not_started: 'pending',
    pending: 'pending',
    paused: 'pending',
    draft: 'pending',
    created: 'pending',
    // 蓝色：生产中（含所有工序状态）
    production: 'production',
    in_progress: 'production',
    procurement: 'production',
    material_preparation: 'production',
    cutting: 'production',
    sewing: 'production',
    ironing: 'production',
    secondary_process: 'production',
    packaging: 'production',
    quality_check: 'production',
    warehousing: 'production',
    received: 'production',
    partial: 'production',
    partial_arrival: 'production',
    awaiting_confirm: 'production',
    warehouse_pending: 'production',
    bundled: 'production',
    confirmed: 'production',
    pending_audit: 'production',
    passed: 'production',
    produced: 'production',
    // 绿色：已完成
    completed: 'completed',
    closed: 'completed',
    archived: 'completed',
    warehoused: 'completed',
    // 红色：逾期/异常
    delayed: 'overdue',
    scrapped: 'overdue',
    cancelled: 'overdue',
    canceled: 'overdue',
    returned: 'overdue',
  };
  return map[s] || 'pending';
}

module.exports = {
  orderStatusText,
  orderStatusBadgeClass,
  qualityStatusText,
  scanResultText,
  getStatusColor,
  getQualityColor,
};
