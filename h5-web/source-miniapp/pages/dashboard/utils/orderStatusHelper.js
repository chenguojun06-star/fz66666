/**
 * 订单状态辅助函数
 * 统一管理订单状态文本与封面徽标样式类名转换
 *
 * 状态文案统一代理到 utils/displayHelper.js（覆盖 40+ 状态，含 cutting/sewing/procurement 等工序），
 * 避免各页面独立维护导致 cutting 等工序状态显示英文/未知。
 */

const { displayStatusText } = require('../../../utils/displayHelper');

/**
 * 将订单状态码转换为中文文本
 * 直接走 displayHelper.displayStatusText（覆盖所有工序状态）
 */
function orderStatusText(status) {
  return displayStatusText(status);
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
};
