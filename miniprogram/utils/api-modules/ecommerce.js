const { ok } = require('./helpers');

/**
 * 电商/销售数据 API
 *  - listOrders     多平台订单列表
 *  - getSalesStats  销售统计汇总（复用 finance.ec-revenue/summary）
 *  - getShopStats   店铺/平台连接器统计
 */
const ecommerce = {
  /**
   * 多平台订单列表
   * @param {Object} params { platform, status, page, pageSize, ... }
   */
  listOrders: function (params) {
    return ok('/api/ecommerce/orders/list', 'POST', params || {});
  },

  /**
   * 销售统计汇总（后端为 POST + RequestBody）
   * @param {Object} params { startDate, endDate, platform?, status? }
   */
  getSalesStats: function (params) {
    return ok('/api/finance/ec-revenue/summary', 'POST', params || {});
  },

  /**
   * 店铺/平台连接器统计
   */
  getShopStats: function () {
    return ok('/api/platform-connector/shop-stats', 'GET', {});
  },
};

module.exports = { ecommerce };
