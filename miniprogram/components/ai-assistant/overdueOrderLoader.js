/**
 * 延期订单加载器
 * 负责加载和归纳延期订单数据
 */
const api = require('../../utils/api');

/**
 * 格式化时间为友好显示（本地定义，避免与 bellTaskLoader 循环依赖）
 */
function formatTimeAgo(time) {
  if (!time) return '';
  const date = new Date(time);
  if (isNaN(date.getTime())) return '';
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  return date.toLocaleDateString();
}

/**
 * 计算订单超期天数
 * @param {string} deadline - 截止日期
 * @returns {number} 超期天数（正数表示超期，负数表示未超期）
 */
function calculateOverdueDays(deadline) {
  if (!deadline) return 0;

  try {
    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) return 0;

    const now = new Date();
    now.setHours(0, 0, 0, 0); // 重置到当天0点
    deadlineDate.setHours(0, 0, 0, 0);

    const diffTime = now.getTime() - deadlineDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  } catch (err) {
    console.error('计算超期天数失败:', err);
    return 0;
  }
}

/**
 * 格式化超期信息
 * @param {number} overdueDays - 超期天数
 * @returns {Object} 超期信息 { text, level }
 */
function formatOverdueInfo(overdueDays) {
  if (overdueDays <= 0) {
    return { text: '未超期', level: 'normal' };
  }

  if (overdueDays <= 3) {
    return { text: `超期${overdueDays}天`, level: 'warning' };
  }

  if (overdueDays > 3 && overdueDays <= 7) {
    return { text: `超期${overdueDays}天`, level: 'urgent' };
  }

  return { text: `超期${overdueDays}天`, level: 'critical' };
}

/**
 * 加载延期订单列表
 * @returns {Promise<Array>} 延期订单列表
 */
async function loadOverdueOrders() {
  try {
    const res = await api.production.listOrders({
      page: 1,
      pageSize: 100, // 加载更多数量以确保获取所有延期订单
    });

    const list = Array.isArray(res) ? res : res?.records || [];

    // 筛选出延期订单
    const overdueOrders = list
      .map(item => {
        const overdueDays = calculateOverdueDays(item.deadline || item.deliveryDate);

        if (overdueDays <= 0) return null; // 未超期，过滤掉

        const overdueInfo = formatOverdueInfo(overdueDays);

        return {
          id: item.id,
          orderNo: item.orderNo || item.productionOrderNo,
          styleNo: item.styleNo,
          styleName: item.styleName || '',
          factoryName: item.factoryName || '',
          orderQuantity: item.orderQuantity || 0,
          completedQuantity: item.completedQuantity || 0,
          currentProcessName: item.currentProcessName || '未知',
          progress: item.progress || 0,
          deadline: item.deadline || item.deliveryDate,
          overdueDays,
          overdueText: overdueInfo.text,
          overdueLevel: overdueInfo.level,
          createdAt: item.createdAt || item.createTime,
          timeText: formatTimeAgo(item.createdAt || item.createTime),
          // 计算完成进度
          completionRate: item.orderQuantity > 0
            ? Math.round((item.completedQuantity / item.orderQuantity) * 100)
            : 0,
        };
      })
      .filter(item => item !== null);

    // 按超期天数排序（超期越久越靠前）
    overdueOrders.sort((a, b) => b.overdueDays - a.overdueDays);

    return overdueOrders;
  } catch (err) {
    console.error('[loadOverdueOrders] 加载延期订单失败:', err);
    return [];
  }
}

/**
 * 归纳延期订单统计
 * @param {Array} overdueOrders - 延期订单列表
 * @returns {Object} 统计信息
 */
function summarizeOverdueOrders(overdueOrders) {
  if (!Array.isArray(overdueOrders) || overdueOrders.length === 0) {
    return {
      total: 0,
      criticalCount: 0,  // 超期7天以上
      urgentCount: 0,    // 超期4-7天
      warningCount: 0,   // 超期1-3天
      totalQuantity: 0,
      completedQuantity: 0,
      completionRate: 0,
    };
  }

  const summary = overdueOrders.reduce((acc, order) => {
    // 按严重程度分类
    if (order.overdueLevel === 'critical') {
      acc.criticalCount++;
    } else if (order.overdueLevel === 'urgent') {
      acc.urgentCount++;
    } else if (order.overdueLevel === 'warning') {
      acc.warningCount++;
    }

    // 数量统计
    acc.totalQuantity += order.orderQuantity;
    acc.completedQuantity += order.completedQuantity;

    return acc;
  }, {
    criticalCount: 0,
    urgentCount: 0,
    warningCount: 0,
    totalQuantity: 0,
    completedQuantity: 0,
  });

  return {
    total: overdueOrders.length,
    ...summary,
    completionRate: summary.totalQuantity > 0
      ? Math.round((summary.completedQuantity / summary.totalQuantity) * 100)
      : 0,
  };
}

module.exports = {
  calculateOverdueDays,
  formatOverdueInfo,
  loadOverdueOrders,
  summarizeOverdueOrders,
};
