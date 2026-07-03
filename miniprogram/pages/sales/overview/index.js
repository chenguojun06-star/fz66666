/**
 * 销售数据概览页
 *
 *  - 顶部：日期范围筛选（本月 / 上月 / 近30天）
 *  - 汇总卡片：总销售额、总订单量、总运费、净收入
 *  - 按平台分组列表：平台名 / 订单量 / 销售额 / 净收入
 *
 *  数据来源：api.ecommerce.getSalesStats({ startDate, endDate })
 *  后端返回字段：orderCount, totalPayAmount, totalFreight, netRevenue, platformBreakdown
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');

/* 平台代码 → 中文名称映射 */
const PLATFORM_NAMES = {
  TB: '淘宝', TM: '天猫', JD: '京东', PDD: '拼多多',
  DY: '抖音', XHS: '小红书', WC: '微信小店',
  SFY: 'Shopify', SY: '希音', JST: '聚水潭',
};

/* 日期范围预设 */
const DATE_RANGES = [
  { key: 'thisMonth', label: '本月' },
  { key: 'lastMonth', label: '上月' },
  { key: 'last30', label: '近30天' },
];

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function fmtDate(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function getRange(key) {
  const now = new Date();
  if (key === 'thisMonth') {
    return { startDate: fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: fmtDate(now) };
  }
  if (key === 'lastMonth') {
    return { startDate: fmtDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), endDate: fmtDate(new Date(now.getFullYear(), now.getMonth(), 0)) };
  }
  return { startDate: fmtDate(new Date(now.getTime() - 29 * 86400000)), endDate: fmtDate(now) };
}
function fmtMoney(v) {
  const n = Number(v) || 0;
  if (n >= 10000) return (n / 10000).toFixed(2) + '万';
  return n.toFixed(2);
}

Page({
  data: {
    loading: true,
    ranges: DATE_RANGES,
    activeRange: 'thisMonth',
    startDate: '',
    endDate: '',
    summary: { totalSales: 0, totalOrders: 0, totalShipping: 0, netRevenue: 0 },
    platforms: [],
    platformNames: PLATFORM_NAMES,
  },

  onLoad: function () {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    const r = getRange(this.data.activeRange);
    this.setData({ startDate: r.startDate, endDate: r.endDate });
    this._loadStats();
  },

  onShow: function () {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    // 静默刷新数据（从子页面返回时数据可能已过期）
    if (this.data.startDate) this._loadStats();
  },

  onPullDownRefresh: function () {
    const that = this;
    this._loadStats().finally(function () { wx.stopPullDownRefresh(); });
  },

  onRangeTap: function (e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeRange) return;
    const r = getRange(key);
    this.setData({ activeRange: key, startDate: r.startDate, endDate: r.endDate });
    this._loadStats();
  },

  onViewOrders: function () {
    wx.navigateTo({ url: '/pages/sales/order-list/index' });
  },

  onPlatformTap: function (e) {
    const platform = e.currentTarget.dataset.platform;
    const url = '/pages/sales/order-list/index' + (platform ? '?platform=' + encodeURIComponent(platform) : '');
    wx.navigateTo({ url: url });
  },

  _loadStats: function () {
    const that = this;
    this.setData({ loading: true });
    return api.ecommerce.getSalesStats({
      startDate: this.data.startDate,
      endDate: this.data.endDate,
    }).then(function (res) {
      const data = res || {};
      // 后端返回扁平字段：orderCount, totalPayAmount, totalFreight, netRevenue, platformBreakdown
      var platforms = data.platformBreakdown || data.platforms || [];
      if (!Array.isArray(platforms)) platforms = [];
      platforms = platforms.map(function (p) {
        var code = p.platform || '';
        return {
          platform: code,
          platformName: PLATFORM_NAMES[code] || code || '未知平台',
          orderCount: Number(p.orderCount || 0),
          salesAmount: Number(p.totalPayAmount || 0),
          netRevenue: Number(p.netRevenue || 0),
        };
      });
      that.setData({
        loading: false,
        summary: {
          totalSales: Number(data.totalPayAmount || 0),
          totalOrders: Number(data.orderCount || 0),
          totalShipping: Number(data.totalFreight || 0),
          netRevenue: Number(data.netRevenue || 0),
        },
        platforms: platforms,
      });
    }).catch(function (err) {
      console.warn('[sales-overview] 加载失败:', err && err.errMsg || err);
      that.setData({ loading: false });
      toast.error('数据加载失败，请下拉刷新');
    });
  },
});
