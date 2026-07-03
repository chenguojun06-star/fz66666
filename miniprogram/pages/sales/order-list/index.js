/**
 * 平台订单列表页
 *
 *  - 顶部平台筛选 Tab：全部 / 淘宝 / 抖音 / 京东 / 拼多多 / 希音 等
 *  - 状态筛选：全部 / 待发货 / 已发货 / 已完成
 *  - 订单列表：平台标签 + 订单号 + 买家名 + 金额 + 状态 + 下单时间
 *  - 分页加载
 *
 *  数据来源：api.ecommerce.listOrders({ platform, status, page, pageSize })
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');

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

const PLATFORM_TABS = [
  { key: '',        label: '全部' },
  { key: 'TB',      label: '淘宝' },
  { key: 'TM',      label: '天猫' },
  { key: 'DY',      label: '抖音' },
  { key: 'JD',      label: '京东' },
  { key: 'PDD',     label: '拼多多' },
  { key: 'XHS',     label: '小红书' },
  { key: 'SY',      label: '希音' },
  { key: 'WC',      label: '微信小店' },
];

const STATUS_TABS = [
  { key: '',           label: '全部' },
  { key: 'pending',    label: '待发货' },
  { key: 'shipped',    label: '已发货' },
  { key: 'completed',  label: '已完成' },
];

const STATUS_MAP = {
  pending:   { text: '待发货', cls: 'order-tag--warning' },
  paid:      { text: '已付款', cls: 'order-tag--info' },
  shipped:   { text: '已发货', cls: 'order-tag--info' },
  completed: { text: '已完成', cls: 'order-tag--success' },
  closed:    { text: '已关闭', cls: 'order-tag--default' },
  cancelled: { text: '已取消', cls: 'order-tag--default' },
  refunded:  { text: '已退款', cls: 'order-tag--default' },
};

function fmtTime(val) {
  if (!val) return '';
  const s = String(val);
  if (s.length > 16) return s.substring(0, 16);
  return s;
}

function fmtMoney(v) {
  const n = Number(v) || 0;
  return n.toFixed(2);
}

Page({
  data: {
    loading: false,
    platformTabs: PLATFORM_TABS,
    statusTabs: STATUS_TABS,
    activePlatform: '',
    activeStatus: '',
    list: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loadingMore: false,
    platformNames: PLATFORM_NAMES,
  },

  onLoad: function (options) {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    // 支持从概览页带 platform 跳转
    if (options && options.platform) {
      const p = decodeURIComponent(options.platform);
      // 校验是否在 TABS 内
      const exists = PLATFORM_TABS.some(function (t) { return t.key === p; });
      if (exists) this.setData({ activePlatform: p });
    }
    this._resetAndLoad();
  },

  onShow: function () {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
  },

  onPullDownRefresh: function () {
    const that = this;
    this._resetAndLoad().finally(function () { wx.stopPullDownRefresh(); });
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loadingMore) this._loadMore();
  },

  /* ======== 切换平台 ======== */
  onPlatformTap: function (e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activePlatform) return;
    this.setData({ activePlatform: key });
    this._resetAndLoad();
  },

  /* ======== 切换状态 ======== */
  onStatusTap: function (e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeStatus) return;
    this.setData({ activeStatus: key });
    this._resetAndLoad();
  },

  /* ======== 复制订单号 ======== */
  onCopyOrderNo: function (e) {
    const no = e.currentTarget.dataset.no;
    if (!no) return;
    wx.setClipboardData({ data: no, success: function () { toast.success('已复制'); } });
  },

  /* ======== 重置并加载 ======== */
  _resetAndLoad: function () {
    this.setData({ list: [], page: 1, hasMore: true });
    return this._loadPage(true);
  },

  _loadMore: function () {
    this.setData({ loadingMore: true });
    this._loadPage(false).finally(() => {
      this.setData({ loadingMore: false });
    });
  },

  _loadPage: function (isReset) {
    const that = this;
    if (isReset) this.setData({ loading: true });

    const params = {
      platform: this.data.activePlatform,
      status: this.data.activeStatus,
      page: this.data.page,
      pageSize: this.data.pageSize,
    };

    return api.ecommerce.listOrders(params).then(function (res) {
      const data = res || {};
      let records = data.records || data.list || data.items || [];
      if (!Array.isArray(records)) records = [];
      const total = Number(data.total || 0);

      const mapped = records.map(function (r) {
        const code = r.platform || r.platformCode || r.ecPlatform || '';
        const statusKey = String(r.status || r.orderStatus || '').toLowerCase();
        const st = STATUS_MAP[statusKey] || { text: r.status || r.orderStatus || '-', cls: 'order-tag--default' };
        return {
          id: r.id || r.orderId || r.orderNo,
          orderNo: r.orderNo || r.orderSn || r.outerOrderNo || '-',
          platform: code,
          platformName: r.platformName || PLATFORM_NAMES[code] || code || '-',
          buyerName: r.buyerName || r.buyerNick || r.receiverName || '-',
          amount: fmtMoney(r.amount || r.totalAmount || r.payAmount || 0),
          status: st.text,
          statusCls: st.cls,
          orderTime: fmtTime(r.orderTime || r.createTime || r.createdAt),
        };
      });

      const newList = isReset ? mapped : that.data.list.concat(mapped);
      const hasMore = newList.length < total || mapped.length >= that.data.pageSize;
      that.setData({
        list: newList,
        loading: false,
        hasMore: hasMore,
        page: isReset ? 2 : that.data.page + 1,
      });
    }).catch(function (err) {
      console.warn('[sales-order-list] 加载失败:', err && err.errMsg || err);
      that.setData({ loading: false });
      if (isReset) toast.error('加载失败，请下拉刷新');
    });
  },
});
