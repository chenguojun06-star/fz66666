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
   * 销售统计汇总
   * @param {Object} params { startDate, endDate, platform?, ... }
   */
  getSalesStats: function (params) {
    const p = params || {};
    const qs = [];
    if (p.startDate) qs.push('startDate=' + encodeURIComponent(p.startDate));
    if (p.endDate) qs.push('endDate=' + encodeURIComponent(p.endDate));
    if (p.platform) qs.push('platform=' + encodeURIComponent(p.platform));
    const url = '/api/finance/ec-revenue/summary' + (qs.length ? '?' + qs.join('&') : '');
    return ok(url, 'GET', {});
  },

  /**
   * 店铺/平台连接器统计
   */
  getShopStats: function () {
    return ok('/api/platform-connector/shop-stats', 'GET', {});
  },
};

module.exports = { ecommerce };
