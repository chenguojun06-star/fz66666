/**
 * 全局搜索操作
 * 从 work/index.js 提取，处理全局搜索相关交互
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { transformOrderData } = require('../utils/orderTransform');

/**
 * 全局搜索输入
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 */
function onGlobalSearchInput(ctx, e) {
  const value = e && e.detail ? e.detail.value : '';
  ctx.setData({ 'globalSearch.keyword': value });
}

/**
 * 执行全局搜索
 * @param {Object} ctx - Page 上下文
 */
async function doGlobalSearch(ctx) {
  const keyword = String(ctx.data.globalSearch.keyword || '').trim();
  if (!keyword) {
    toast.error('请输入搜索关键词');
    return;
  }

  ctx.setData({ 'globalSearch.loading': true });
  wx.showLoading({ title: '搜索中...', mask: true });

  try {
    const ordersRes = await api.production.listOrders({
      page: 1,
      pageSize: 50,
      keyword,
      parentOrgUnitId: String(ctx.data.filters.parentOrgUnitId || '').trim() || '',
      factoryType: String(ctx.data.filters.factoryType || '').trim() || '',
    }).catch(() => ({ records: [] }));

    const results = (ordersRes.records || []).map(item => {
      const transformed = transformOrderData(item);
      return {
        id: transformed.id,
        type: 'order',
        title: transformed.orderNo || '-',
        subtitle: `款号: ${transformed.styleNo || '-'} | 工厂: ${transformed.factoryName || '-'}`,
        statusText: transformed.statusText || '-',
        statusColor: transformed.isClosed ? 'var(--color-success)' : 'var(--color-primary)',
        orderNo: transformed.orderNo,
        styleNo: transformed.styleNo,
        progress: transformed.productionProgress || 0,
        currentProcessName: transformed.currentProcessName || '',
        rawData: transformed,
      };
    });

    ctx.setData({
      'globalSearch.results': results,
      'globalSearch.hasSearched': true,
      'globalSearch.loading': false,
    });

    wx.hideLoading();

    if (results.length === 0) {
      toast.info('未找到匹配的订单');
    }
  } catch (error) {
    console.error('[doGlobalSearch] 搜索失败:', error);
    ctx.setData({ 'globalSearch.loading': false });
    wx.hideLoading();
    toast.error('搜索失败，请重试');
  }
}

/**
 * 清空搜索
 * @param {Object} ctx - Page 上下文
 */
function clearGlobalSearch(ctx) {
  ctx.setData({
    'globalSearch.keyword': '',
    'globalSearch.hasSearched': false,
    'globalSearch.results': [],
  });
}

/**
 * 关闭搜索结果
 * @param {Object} ctx - Page 上下文
 */
function closeGlobalSearch(ctx) {
  ctx.setData({
    'globalSearch.hasSearched': false,
    'globalSearch.results': [],
  });
}

/**
 * 点击搜索结果项 - 跳转到对应订单并高亮
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 */
function onResultItemTap(ctx, e) {
  const item = (e && e.detail && e.detail.item) ||
               (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.item);
  if (!item || item.type !== 'order') {
    return;
  }

  closeGlobalSearch(ctx);

  const status = item.rawData?.status || item.rawData?.currentStage;
  let targetTab = 'all';

  if (status === 'cutting') {
    targetTab = 'cutting';
  } else if (status === 'sewing') {
    targetTab = 'sewing';
  } else if (status === 'procurement') {
    targetTab = 'procurement';
  }

  ctx.setData({
    activeTab: targetTab,
    highlightOrderNo: item.orderNo,
  });

  ctx.loadOrders(true);

  setTimeout(() => {
    const orders = ctx.data.orders?.list || [];
    const index = orders.findIndex(order => order.orderNo === item.orderNo);

    if (index !== -1) {
      wx.pageScrollTo({
        selector: `.list-item:nth-child(${index + 1})`,
        duration: 300,
      });
    }

    setTimeout(() => {
      ctx.setData({ highlightOrderNo: '' });
    }, 3000);
  }, 500);
}

module.exports = {
  onGlobalSearchInput,
  doGlobalSearch,
  clearGlobalSearch,
  closeGlobalSearch,
  onResultItemTap,
};
