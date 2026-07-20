/**
 * 订单状态辅助函数
 * 统一管理订单状态文本与 CSS 标签类名转换
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
 * 订单状态对应的 CSS 标签类名
 * 补全 cutting/sewing/procurement/ironing/packaging/quality_check/warehousing 等工序状态
 * 与 utils/displayHelper.js ORDER_STATUS_LABEL 完全对齐
 */
function orderStatusCls(status) {
  const s = (status || '').toString().trim().toLowerCase();
  const map = {
    // 灰色：未开始/暂停/草稿
    not_started: 'tag-gray',
    pending: 'tag-gray',
    paused: 'tag-orange',
    draft: 'tag-gray',
    created: 'tag-gray',
    // 蓝色：生产中（含所有工序状态）
    production: 'tag-blue',
    in_progress: 'tag-blue',
    procurement: 'tag-blue',
    material_preparation: 'tag-blue',
    cutting: 'tag-cyan',
    sewing: 'tag-cyan',
    ironing: 'tag-cyan',
    secondary_process: 'tag-purple',
    packaging: 'tag-blue',
    quality_check: 'tag-blue',
    warehousing: 'tag-blue',
    received: 'tag-blue',
    partial: 'tag-cyan',
    partial_arrival: 'tag-cyan',
    awaiting_confirm: 'tag-blue',
    warehouse_pending: 'tag-blue',
    bundled: 'tag-cyan',
    confirmed: 'tag-blue',
    pending_audit: 'tag-blue',
    passed: 'tag-green',
    produced: 'tag-cyan',
    // 绿色：已完成
    completed: 'tag-green',
    closed: 'tag-green',
    archived: 'tag-gray',
    warehoused: 'tag-green',
    // 红色/橙色：逾期/异常
    delayed: 'tag-orange',
    scrapped: 'tag-red',
    cancelled: 'tag-red',
    canceled: 'tag-red',
    returned: 'tag-red',
  };
  return map[s] || 'tag-gray';
}

module.exports = {
  orderStatusText: orderStatusText,
  orderStatusCls: orderStatusCls,
};
