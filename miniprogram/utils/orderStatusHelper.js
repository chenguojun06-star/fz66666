/**
 * 订单状态辅助函数
 * 统一管理订单、质检等状态文本转换
 */

/**
 * 将订单状态码转换为中文文本
 * @param {string} status - 状态码
 * @returns {string} 中文状态文本
 */
function orderStatusText(status) {
  const s = (status || '').toString().trim().toLowerCase();
  const map = {
    pending: '待生产',
    production: '生产中',
    completed: '已完成',
    delayed: '已逾期',
    cancelled: '已取消',
    canceled: '已取消',
    paused: '已暂停',
    returned: '已退回',
  };
  if (!s) return '';
  return map[s] || '未知';
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
  if (!s) return '';
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
  if (!s) return '';
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
    pending: '#faad14',      // 橙色 - 待生产
    production: '#1890ff',   // 蓝色 - 生产中
    completed: '#52c41a',    // 绿色 - 已完成
    delayed: '#f5222d',      // 红色 - 已逾期
    cancelled: '#8c8c8c',    // 灰色 - 已取消
    canceled: '#8c8c8c',     // 灰色 - 已取消
    paused: '#d9d9d9',       // 浅灰 - 已暂停
    returned: '#ff7a45',     // 橙红 - 已退回
  };
  return colorMap[s] || '#000000';
}

/**
 * 根据质检状态获取对应的颜色
 * @param {string} qualityStatus - 质检状态码
 * @returns {string} 颜色值
 */
function getQualityColor(qualityStatus) {
  const s = (qualityStatus || '').toString().trim().toLowerCase();
  const colorMap = {
    qualified: '#52c41a',       // 绿色 - 合格
    unqualified: '#f5222d',     // 红色 - 次品待返修
    repaired: '#1890ff',        // 蓝色 - 返修完成
  };
  return colorMap[s] || '#000000';
}

module.exports = {
  orderStatusText,
  qualityStatusText,
  scanResultText,
  getStatusColor,
  getQualityColor,
};
