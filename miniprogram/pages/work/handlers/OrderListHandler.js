/**
 * 订单列表加载与同步操作
 * 从 work/index.js 提取，处理订单列表分页加载、统计、实时同步
 */
const api = require('../../../utils/api');
const { errorHandler } = require('../../../utils/errorHandler');
const { syncManager } = require('../../../utils/syncManager');
const { normalizeText, transformOrderData } = require('../utils/orderTransform');

/**
 * 加载订单列表（分页）
 * @param {Object} ctx - Page 上下文
 * @param {boolean} reset - 是否重置分页
 * @returns {Promise<void>}
 */
function loadOrders(ctx, reset) {
  const app = getApp();
  if (!app || typeof app.loadPagedList !== 'function') {
    return Promise.resolve();
  }

  return app.loadPagedList(
    ctx,
    'orders',
    reset === true,
    async ({ page, pageSize }) => {
      const f = ctx.data.filters;
      const params = {
        page,
        pageSize,
        orderNo: normalizeText(f.orderNo),
        styleNo: normalizeText(f.styleNo),
        factoryName: normalizeText(f.factoryName),
        parentOrgUnitId: String(f.parentOrgUnitId || '').trim() || '',
        factoryType: String(f.factoryType || '').trim() || '',
        excludeTerminal: 'true',
        delayedOnly: ctx.data.delayedOnly ? 'true' : undefined,
      };

      const tab = ctx.data.activeTab;
      const processMap = {
        procurement: '采购',
        cutting: '裁剪',
        sewing: '车缝',
        warehousing: '入库',
      };
      if (tab !== 'all' && processMap[tab]) {
        params.currentProcessName = processMap[tab];
      }

      return api.production.listOrders(params);
    },
    r => transformOrderData(r)
  ).then(() => {
    const sortedList = [...ctx.data.orders.list].sort((a, b) => {
      const safeDate = s => new Date(typeof s === 'string' ? s.replace(' ', 'T') : (s || 0));
      const timeA = safeDate(a.createdAt || a.createTime).getTime();
      const timeB = safeDate(b.createdAt || b.createTime).getTime();
      return timeB - timeA;
    });

    ctx.setData({ 'orders.list': sortedList });
    updateOrderStats(ctx);
  });
}

/**
 * 更新订单统计信息
 * @param {Object} ctx - Page 上下文
 * @param {Array} [list] - 可选的订单列表
 */
function updateOrderStats(ctx, list) {
  const source = Array.isArray(list) ? list : (ctx.data.orders.list || []);
  const orderCount = source.length;
  const totalQuantity = source.reduce((sum, item) => sum + Number(item.orderQuantity || 0), 0);
  ctx.setData({
    orderStats: { orderCount, totalQuantity },
  });
}

/**
 * 设置订单列表的实时同步（30秒轮询）
 * @param {Object} ctx - Page 上下文
 */
function setupOrderSync(ctx) {
  const syncFn = async () => {
    try {
      const f = ctx.data.filters;
      const params = {
        page: 1,
        pageSize: 20,
        orderNo: normalizeText(f.orderNo),
        styleNo: normalizeText(f.styleNo),
        factoryName: normalizeText(f.factoryName),
        parentOrgUnitId: String(f.parentOrgUnitId || '').trim() || '',
        factoryType: String(f.factoryType || '').trim() || '',
        excludeTerminal: 'true',
      };
      return await api.production.listOrders(params);
    } catch (error) {
      errorHandler.logError(error, '[Work] Sync orders');
      throw error;
    }
  };

  const onDataChange = newPage => {
    if (!newPage || !Array.isArray(newPage.records)) {
      return;
    }
    const newList = newPage.records.map(r => transformOrderData(r));
    ctx.setData({ 'orders.list': newList });
    updateOrderStats(ctx, newList);
  };

  syncManager.startSync('work_orders', syncFn, 30000, {
    onDataChange,
    onError: (_error, errorCount) => {
      if (errorCount > 3) {
        syncManager.stopSync('work_orders');
      }
    },
  });
}

module.exports = {
  loadOrders,
  updateOrderStats,
  setupOrderSync,
};
