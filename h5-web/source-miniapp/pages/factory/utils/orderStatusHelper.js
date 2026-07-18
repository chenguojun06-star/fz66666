/**
 * 订单状态辅助函数
 * 统一管理订单、质检等状态文本转换
 */

const COLOR_DEFAULT = 'var(--color-text-disabled)';
const COLOR_SUCCESS = 'var(--color-success)';
const COLOR_WARNING = 'var(--color-warning)';
const COLOR_DANGER = 'var(--color-danger)';
const COLOR_FALLBACK = 'var(--color-text-secondary)';

function orderStatusText(status) {
  const s = (status || '').toString().trim().toLowerCase();
  const map = {
    pending: '待生产',
    production: '生产中',
    completed: '已完成',
    delayed: '已逾期',
    scrapped: '已报废',
    cancelled: '已取消',
    canceled: '已取消',
    paused: '已暂停',
    returned: '已退回',
    closed: '已关单',
    archived: '已归档',
  };
  if (!s) {
    return '';
  }
  return map[s] || '未知';
}

function orderStatusCls(status) {
  const s = (status || '').toString().trim().toLowerCase();
  const map = {
    pending: 'tag-gray',
    production: 'tag-blue',
    completed: 'tag-green',
    delayed: 'tag-orange',
    scrapped: 'tag-red',
    cancelled: 'tag-red',
    canceled: 'tag-red',
    paused: 'tag-orange',
    returned: 'tag-red',
    closed: 'tag-green',
    archived: 'tag-gray',
  };
  return map[s] || 'tag-gray';
}

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
  orderStatusText: orderStatusText,
  orderStatusCls: orderStatusCls,
  qualityStatusText: qualityStatusText,
  scanResultText: scanResultText,
  getStatusColor: getStatusColor,
  getQualityColor: getQualityColor,
};
