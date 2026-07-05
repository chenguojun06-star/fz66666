/**
 * 平台订单列表页
 *
 *  - 顶部平台筛选 Tab：全部 / 淘宝 / 抖音 / 京东 / 拼多多 / 希音 等
 *  - 状态筛选：全部 / 待付款 / 待发货 / 已发货 / 已完成 / 已取消
 *  - 搜索框：按订单号/买家名搜索
 *  - 订单列表：平台标签 + 平台单号 + 内部单号 + 买家 + 商品名+数量 + 实付金额 + 状态 + 下单时间
 *  - 分页加载
 *
 *  后端 status 为 Integer：0=待付款 1=待发货 2=已发货 3=已完成 4=已取消 5=退款中
 *  后端 platform 筛选兼容短码（TB）和全码（TAOBAO）
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { PLATFORM_NAMES } = require('../../../utils/platformNames');

const PLATFORM_TABS = [
  { key: '',   label: '全部' },
  { key: 'TB', label: '淘宝' },
  { key: 'TM', label: '天猫' },
  { key: 'DY', label: '抖音' },
  { key: 'JD', label: '京东' },
  { key: 'PDD', label: '拼多多' },
  { key: 'XHS', label: '小红书' },
  { key: 'SY', label: '希音' },
  { key: 'WC', label: '微信小店' },
];

/* status 后端为 Integer，这里 key 用数字字符串
 * 顺序符合电商流程：待付款 → 待发货 → 已发货 → 已完成 → 已取消 → 退款中
 */
var STATUS_TABS = [
  { key: '',  label: '全部' },
  { key: '0', label: '待付款' },
  { key: '1', label: '待发货' },
  { key: '2', label: '已发货' },
  { key: '3', label: '已完成' },
  { key: '4', label: '已取消' },
  { key: '5', label: '退款中' },
];

var STATUS_MAP = {
  0: { text: '待付款', cls: 'order-tag--warning' },
  1: { text: '待发货', cls: 'order-tag--warning' },
  2: { text: '已发货', cls: 'order-tag--info' },
  3: { text: '已完成', cls: 'order-tag--success' },
  4: { text: '已取消', cls: 'order-tag--default' },
  5: { text: '退款中', cls: 'order-tag--warning' },
};

function fmtTime(val) {
  if (!val) return '';
  var s = String(val).replace('T', ' ');
  if (s.length > 16) return s.substring(0, 16);
  return s;
}

function fmtMoney(v) {
  var n = Number(v) || 0;
  return n.toFixed(2);
}

Page({
  data: {
    loading: false,
    platformTabs: PLATFORM_TABS,
    statusTabs: STATUS_TABS,
    activePlatform: '',
    activeStatus: '',
    keyword: '',
    list: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loadingMore: false,
    platformNames: PLATFORM_NAMES,
    loadError: false,
  },

  onLoad: function (options) {
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    if (options && options.platform) {
      var p = decodeURIComponent(options.platform);
      this.setData({ activePlatform: p });
    }
    this._resetAndLoad();
  },

  onShow: function () {
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    // 静默刷新数据（从子页面返回时数据可能已过期），仅在已加载过的情况下刷新
    if (this.data.activePlatform !== undefined && !this.data.loading) this._resetAndLoad();
  },

  onPullDownRefresh: function () {
    var that = this;
    this._resetAndLoad().finally(function () { wx.stopPullDownRefresh(); });
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loadingMore) this._loadMore();
  },

  onPlatformTap: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key === this.data.activePlatform) return;
    this.setData({ activePlatform: key });
    this._resetAndLoad();
  },

  onStatusTap: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key === this.data.activeStatus) return;
    this.setData({ activeStatus: key });
    this._resetAndLoad();
  },

  onSearchInput: function (e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearchConfirm: function () {
    // trim 搜索关键词，避免前后空格导致搜索失败
    var kw = (this.data.keyword || '').trim();
    this.setData({ keyword: kw });
    this._resetAndLoad();
  },

  onClearKeyword: function () {
    this.setData({ keyword: '' });
    this._resetAndLoad();
  },

  onCopyOrderNo: function (e) {
    var no = e.currentTarget.dataset.no;
    if (!no) return;
    wx.setClipboardData({ data: no, success: function () { toast.success('已复制'); } });
  },

  _resetAndLoad: function () {
    this.setData({ list: [], page: 1, hasMore: true, loadError: false });
    return this._loadPage(true);
  },

  onRetry: function () {
    this._resetAndLoad();
  },

  _loadMore: function () {
    this.setData({ loadingMore: true });
    var that = this;
    this._loadPage(false).finally(function () {
      that.setData({ loadingMore: false });
    });
  },

  _loadPage: function (isReset) {
    var that = this;
    if (isReset) this.setData({ loading: true });

    var params = {
      platform: this.data.activePlatform,
      status: this.data.activeStatus,
      page: this.data.page,
      pageSize: this.data.pageSize,
    };
    if (this.data.keyword) params.keyword = this.data.keyword;

    return api.ecommerce.listOrders(params).then(function (res) {
      var data = res || {};
      var records = data.records || data.list || data.items || [];
      if (!Array.isArray(records)) records = [];
      var total = Number(data.total || 0);

      var mapped = records.map(function (r) {
        // platform 字段：后端 EcommerceOrder 仅存 platform（短码 TB/JD/...）
        // 之前的 platformCode/ecPlatform 是无效字段，已清理
        var code = r.platform || '';
        // status 后端为 Integer
        var statusNum = Number(r.status);
        if (isNaN(statusNum)) statusNum = -1;
        var st = STATUS_MAP[statusNum] || { text: '未知', cls: 'order-tag--default' };
        // 商品信息
        var productName = r.productName || r.itemName || '';
        var quantity = r.quantity != null ? r.quantity : '';
        var productText = productName ? (productName + (quantity ? ' x' + quantity : '')) : '';

        return {
          id: r.id || r.orderNo,
          platformOrderNo: r.platformOrderNo || '',
          orderNo: r.orderNo || '',
          platform: code,
          platformName: PLATFORM_NAMES[code] || '未知',
          buyerName: r.buyerNick || r.buyerName || r.receiverName || '-',
          amount: fmtMoney(r.payAmount || r.totalAmount || 0),
          status: st.text,
          statusCls: st.cls,
          orderTime: fmtTime(r.createTime || r.orderTime),
          productText: productText,
          trackingNo: r.trackingNo || '',
          expressCompany: r.expressCompany || '',
          productionOrderNo: r.productionOrderNo || '',
        };
      });

      var newList = isReset ? mapped : that.data.list.concat(mapped);
      // 优先用 pageSize 判断是否还有更多（避免 total=0 时误判）
      var hasMore = mapped.length >= that.data.pageSize && (total === 0 || newList.length < total);
      that.setData({
        list: newList,
        loading: false,
        hasMore: hasMore,
        page: isReset ? 2 : that.data.page + 1,
      });
    }).catch(function (err) {
      console.warn('[sales-order-list] 加载失败:', err && err.errMsg || err);
      that.setData({ loading: false });
      if (isReset) {
        // 标记加载失败，UI 显示"点击重试"而非"暂无订单"
        that.setData({ loadError: true });
        toast.error('刷新失败，请稍后重试');
      } else {
        // 加载更多失败时也要给用户反馈，并保留 hasMore 让用户可重试
        toast.info('加载更多失败，请重试');
        that.setData({ hasMore: true });
      }
    });
  },

  // 点击订单卡片：若有已关联的生产订单则跳转生产订单详情
  onOrderTap: function (e) {
    var idx = e.currentTarget.dataset.idx;
    var item = this.data.list[idx];
    if (!item || !item.productionOrderNo) {
      return; // 未排产订单不跳转
    }
    wx.navigateTo({
      url: '/pages/dashboard/order-detail/index?orderNo=' + encodeURIComponent(item.productionOrderNo),
    });
  },
});
