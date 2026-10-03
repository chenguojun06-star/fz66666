/**
 * 销售数据概览页
 *
 *  - 顶部：日期范围筛选（今日 / 本周 / 本月 / 本季 / 本年）
 *  - 汇总卡片：总销售额、总订单量、总运费、净收入
 *  - 按平台分组列表：平台名 / 订单量 / 销售额 / 净收入
 *
 *  数据来源：api.ecommerce.getSalesStats({ startDate, endDate })
 *  后端返回字段：orderCount, totalPayAmount, totalFreight, netRevenue, platformBreakdown
 */
const i18n = require('../../../utils/i18n/index');

const NS = 'mp.salesOverview.';

const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { getPlatformName } = require('../../../utils/platformNames');
const { bindPageEvents, unbindPageEvents } = require('../../../utils/pageEventBinder');
const { hasFeaturePermission } = require('../../../utils/permission');
const { formatDate, pad2 } = require('../../../utils/displayHelper');

/* 日期范围预设 */
// key 保持英文（用于计算日期区间），label 由 applyLanguage 按语言重建
const DATE_RANGES = [
  { key: 'today',       labelKey: 'rangeToday' },
  { key: 'thisWeek',    labelKey: 'rangeThisWeek' },
  { key: 'thisMonth',   labelKey: 'rangeThisMonth' },
  { key: 'thisQuarter', labelKey: 'rangeThisQuarter' },
  { key: 'thisYear',    labelKey: 'rangeThisYear' },
];

function fmtDate(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function getRange(key) {
  const now = new Date();
  if (key === 'today') {
    return { startDate: fmtDate(now), endDate: fmtDate(now) };
  }
  if (key === 'thisWeek') {
    // 周一为一周开始
    var day = now.getDay() || 7;
    var monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);
    return { startDate: fmtDate(monday), endDate: fmtDate(now) };
  }
  if (key === 'thisMonth') {
    return { startDate: fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: fmtDate(now) };
  }
  if (key === 'thisQuarter') {
    var qMonth = Math.floor(now.getMonth() / 3) * 3;
    return { startDate: fmtDate(new Date(now.getFullYear(), qMonth, 1)), endDate: fmtDate(now) };
  }
  if (key === 'thisYear') {
    return { startDate: fmtDate(new Date(now.getFullYear(), 0, 1)), endDate: fmtDate(now) };
  }
  // 默认本月
  return { startDate: fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: fmtDate(now) };
}
function fmtMoney(v) {
  const n = Number(v) || 0;
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

Page({
  data: {
    loading: true,
    loadError: false,
    ranges: [],
    t: {},
    activeRange: 'thisMonth',
    startDate: '',
    endDate: '',
    summary: { totalSales: 0, totalOrders: 0, totalShipping: 0, netRevenue: 0 },
    platforms: [],
    platformNames: {},
  },

  /** 应用语言 */
  applyLanguage(language) {
    const lang = language || i18n.getLanguage();
    this._lang = lang;
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({
      t: {
        totalSales: t('totalSales'),
        totalOrders: t('totalOrders'),
        totalShipping: t('totalShipping'),
        netRevenue: t('netRevenue'),
        platformBreakdown: t('platformBreakdown'),
        viewOrders: t('viewOrders'),
        orderCountPrefix: t('orderCountPrefix'),
        salesAmount: t('salesAmount'),
        emptyData: t('emptyData'),
        emptyDataHint: t('emptyDataHint'),
        loadFailed: t('loadFailed'),
        tapRetry: t('tapRetry'),
        loading: i18n.t('common.loading', lang),
      },
      // 时间范围选项数组按语言重建（只翻 data.t 不够）
      ranges: DATE_RANGES.map((r) => ({ key: r.key, label: t(r.labelKey) })),
    });
    wx.setNavigationBarTitle({ title: t('navTitle') });
  },

  onLoad: function () {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    if (!hasFeaturePermission('view_sales') && !hasFeaturePermission('view_finance')) {
      toast(i18n.t(NS + 'noPermission', this._lang));
      wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/dashboard/index' }) });
      return;
    }
    const r = getRange(this.data.activeRange);
    this.setData({ startDate: r.startDate, endDate: r.endDate });
    this._loadStats();
    bindPageEvents(this, () => this._loadStats());
  },

  onUnload: function () {
    unbindPageEvents(this);
  },

  onShow: function () {
    // ⚠️ 本页原先有两个 onShow，后者覆盖前者 → applyLanguage 从未执行
    //（t/范围标签恒为初始值、导航标题不设）。合并为一处。
    this.applyLanguage(i18n.getLanguage());
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    // 静默刷新数据（从子页面返回时数据可能已过期）
    if (this.data.startDate) this._loadStats();
  },

  onPullDownRefresh: function () {
    this._loadStats().finally(function () { wx.stopPullDownRefresh(); });
  },

  onRangeTap: function (e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeRange) return;
    const r = getRange(key);
    const that = this;
    // 保存旧值，加载失败时回滚（避免UI高亮与数据不一致）
    const oldRange = this.data.activeRange;
    const oldStart = this.data.startDate;
    const oldEnd = this.data.endDate;
    this.setData({ activeRange: key, startDate: r.startDate, endDate: r.endDate });
    this._loadStats().catch(function () {
      // 回滚到旧值
      that.setData({ activeRange: oldRange, startDate: oldStart, endDate: oldEnd });
    });
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
                  platformName: getPlatformName(code, that._lang),
          orderCount: Number(p.orderCount || 0),
          salesAmount: Number(p.totalPayAmount || 0),
          salesAmountText: fmtMoney(Number(p.totalPayAmount || 0)),
          netRevenue: Number(p.netRevenue || 0),
          netRevenueText: fmtMoney(Number(p.netRevenue || 0)),
        };
      });
      that.setData({
        loading: false,
        loadError: false,
        summary: {
          totalSales: Number(data.totalPayAmount || 0),
          totalSalesText: fmtMoney(Number(data.totalPayAmount || 0)),
          totalOrders: Number(data.orderCount || 0),
          totalShipping: Number(data.totalFreight || 0),
          totalShippingText: fmtMoney(Number(data.totalFreight || 0)),
          netRevenue: Number(data.netRevenue || 0),
          netRevenueText: fmtMoney(Number(data.netRevenue || 0)),
        },
        platforms: platforms,
      });
    }).catch(function (err) {
      console.warn('[sales-overview] 加载失败:', err && err.errMsg || err);
      that.setData({ loading: false, loadError: true });
      toast.error(i18n.t(NS + 'refreshFailed', i18n.getLanguage()));
    });
  },

  onRetry: function () {
    this.setData({ loadError: false });
    this._loadStats();
  },
});
