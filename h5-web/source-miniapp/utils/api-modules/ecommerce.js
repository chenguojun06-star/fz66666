/**
 * 电商订单 API
 *
 * 对应后端 /api/ecommerce/*
 */
const { ok } = require('./helpers');

const ecommerce = {
  /**
   * 查询销售统计
   * @param {Object} params - { startDate, endDate }
   * @returns {Promise<Object>} { orderCount, totalPayAmount, totalFreight, netRevenue, platformBreakdown }
   */
  getSalesStats(params) {
    return ok('/api/ecommerce/sales-stats', 'GET', params || {});
  },

  /**
   * 查询电商订单列表
   * @param {Object} params - { platform, status, keyword, page, pageSize }
   * @returns {Promise<Object>} { records, total, size, current, pages }
   */
  listOrders(params) {
    return ok('/api/ecommerce/orders/list', 'POST', params || {});
  },
};

module.exports = ecommerce;
