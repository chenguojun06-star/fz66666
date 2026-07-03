/**
 * 销售数据概览页
 *
 *  - 顶部：日期范围筛选（本月 / 上月 / 近30天）
 *  - 汇总卡片：总销售额、总订单量、总运费、净收入
 *  - 按平台分组列表：平台名 / 订单量 / 销售额 / 净收入
 *
 *  数据来源：api.ecommerce.getSalesStats({ startDate, endDate })
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');

/* 平台代码 → 中文名称映射（与订单详情页保持一致） */
const PLATFORM_NAMES = {
  TB: '淘宝',
  TM: '天猫',
  JD: '京东',
  PDD: '拼多多',
  DY: '抖音',
  XHS: '小红书',
  WC: '微信小店',
  SFY: 'Shopify',
  SY: '希音',
  JST: '聚水潭',
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
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: fmtDate(start), endDate: fmtDate(now) };
  }
  if (key === 'lastMonth') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { startDate: fmtDate(start), endDate: fmtDate(end) };
  }
  // last30
  const start = new Date(now.getTime() - 29 * 86400000);
  return { startDate: fmtDate(start), endDate: fmtDate(now) };
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
    summary: {
      totalSales: 0,
      totalOrders: 0,
      totalShipping: 0,
      netRevenue: 0,
    },
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
  },

  onPullDownRefresh: function () {
    const that = this;
    this._loadStats().finally(function () { wx.stopPullDownRefresh(); });
  },

  /* ======== 切换日期范围 ======== */
  onRangeTap: function (e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeRange) return;
    const r = getRange(key);
    this.setData({ activeRange: key, startDate: r.startDate, endDate: r.endDate });
    this._loadStats();
  },

  /* ======== 跳转到平台订单列表 ======== */
  onViewOrders: function () {
    wx.navigateTo({ url: '/pages/sales/order-list/index' });
  },

  onPlatformTap: function (e) {
    const platform = e.currentTarget.dataset.platform;
    const url = '/pages/sales/order-list/index' + (platform ? '?platform=' + encodeURIComponent(platform) : '');
    wx.navigateTo({ url: url });
  },

  /* ======== 加载销售统计 ======== */
  _loadStats: function () {
    const that = this;
    this.setData({ loading: true });
    return api.ecommerce.getSalesStats({
      startDate: this.data.startDate,
      endDate: this.data.endDate,
    }).then(function (res) {
      const data = res || {};
      // 兼容多种返回结构：summary 节点 + platforms 数组，或扁平字段
      const summary = data.summary || {
        totalSales: data.totalSales || data.totalAmount || 0,
        totalOrders: data.totalOrders || data.orderCount || 0,
        totalShipping: data.totalShipping || data.shippingFee || 0,
        netRevenue: data.netRevenue || data.netIncome || 0,
      };
      let platforms = data.platforms || data.platformStats || data.list || [];
      if (!Array.isArray(platforms)) platforms = [];
      platforms = platforms.map(function (p) {
        const code = p.platform || p.platformCode || '';
        return {
          platform: code,
          platformName: p.platformName || PLATFORM_NAMES[code] || code || '未知平台',
          orderCount: Number(p.orderCount || p.orders || 0),
          salesAmount: Number(p.salesAmount || p.sales || p.amount || 0),
          netRevenue: Number(p.netRevenue || p.netIncome || 0),
        };
      });
      that.setData({
        loading: false,
        summary: {
          totalSales: Number(summary.totalSales || 0),
          totalOrders: Number(summary.totalOrders || 0),
          totalShipping: Number(summary.totalShipping || 0),
          netRevenue: Number(summary.netRevenue || 0),
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
