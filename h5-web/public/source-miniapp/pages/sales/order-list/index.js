/**
 * 平台订单列表页
 *
 *  - 顶部平台筛选 Tab：全部 / 淘宝 / 抖音 / 京东 / 拼多多 / 希音 等
 *  - 状态筛选：全部 / 待付款 / 待发货 / 已发货 / 已完成 / 已取消 / 已退款
 *  - 搜索框：按订单号/买家名搜索
 *  - 订单列表：平台标签 + 平台单号 + 内部单号 + 买家 + 商品名+数量 + 实付金额 + 状态 + 下单时间
 *  - 分页加载
 *  - 状态Tab显示对应数量
 *
 *  后端 status 为 Integer：0=待付款 1=待发货 2=已发货 3=已完成 4=已取消 5=已退款
 *  后端 platform 筛选兼容短码（TB）和全码（TAOBAO）
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { getPlatformName } = require('../../../utils/platformNames');
const i18n = require('../../../utils/i18n/index');

const NS = 'mp.salesOrderList.';
const { bindPageEvents, unbindPageEvents } = require('../../../utils/pageEventBinder');
const displayHelper = require('../../../utils/displayHelper');

// key 是后端平台短码（保持英文）；label 由 applyLanguage 生成 ——
// 平台名统一走 utils/platformNames.getPlatformName()，避免与列表项显示不一致
const PLATFORM_TABS = [
  { key: '',    labelKey: 'allTab' },
  { key: 'TB' }, { key: 'TM' }, { key: 'DY' }, { key: 'JD' },
  { key: 'PDD' }, { key: 'XHS' }, { key: 'SY' }, { key: 'WC' },
];

/* status 后端为 Integer，这里 key 用数字字符串
 * 顺序符合电商流程：待付款 → 待发货 → 已发货 → 已完成 → 已取消 → 退款中
 */
// ⚠️ 暂未键化（D-608 有意保留）：状态文案来自 utils/displayHelper.SALES_ORDER_STATUS_LABEL，
//    而 displayHelper 是全局工具（十几个状态表、被所有页面使用），需专门一批统一改造，
//    否则 tab 会显示英文而列表项状态仍是中文，两边不一致。
var STATUS_TABS = [
  { key: '',  label: '全部' },
  { key: '0', label: '待付款' },
  { key: '1', label: '待发货' },
  { key: '2', label: '已发货' },
  { key: '3', label: '已完成' },
  { key: '4', label: '已取消' },
  { key: '5', label: '已退款' },
];

// wxml 依赖 order-tag--* CSS 类名，displayHelper 仅提供 CSS 变量颜色值，
// 故 cls 保留本地映射；文案统一走 displayHelper.displaySalesOrderStatusText
var STATUS_CLS_MAP = {
  0: 'order-tag--warning',
  1: 'order-tag--warning',
  2: 'order-tag--info',
  3: 'order-tag--success',
  4: 'order-tag--default',
  5: 'order-tag--warning',
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
    t: {},
    loadError: false,
    statusCounts: {},
  },

  /** 应用语言 */
  applyLanguage(language) {
    const lang = language || i18n.getLanguage();
    this._lang = lang;
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({
      t: {
        scheduled: t('scheduled'),
        platformOrderNo: t('platformOrderNo'),
        internalOrderNo: t('internalOrderNo'),
        loadingMore: t('loadingMore'),
        pullToLoadMore: t('pullToLoadMore'),
        noMore: t('noMore'),
        emptyOrders: t('emptyOrders'),
        emptyHint: t('emptyHint'),
        loadFailed: t('loadFailed'),
        tapRetry: t('tapRetry'),
        searchPlaceholder: t('searchPlaceholder'),
      },
      platformTabs: PLATFORM_TABS.map((it) => ({
        key: it.key,
        label: it.labelKey ? i18n.t(NS + it.labelKey, lang) : getPlatformName(it.key, lang),
      })),
      // 列表里已生成的平台名也要跟着语言重算
      list: (this.data.list || []).map((it) => ({
        ...it, platformName: getPlatformName(it.platform, lang),
      })),
    });
    wx.setNavigationBarTitle({ title: t('navTitle') });
  },

  onLoad: function (options) {
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    if (options && options.platform) {
      var p = decodeURIComponent(options.platform);
      this.setData({ activePlatform: p });
    }
    this._resetAndLoad();
    bindPageEvents(this, () => this._resetAndLoad(), ['ORDER_STATUS_CHANGED']);
  },

  onUnload: function () {
    unbindPageEvents(this);
  },

  onShow: function () {
    // ⚠️ 本页原先有两个 onShow 定义，后者覆盖前者 → applyLanguage 从未执行，
    // 页面所有 {{t.xxx}} 恒为空（用户实测"文字都不见了"）。合并为一处。
    this.applyLanguage(i18n.getLanguage());
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    // 静默刷新数据（从子页面返回时数据可能已过期），仅在已加载过的情况下刷新
    if (this.data.activePlatform !== undefined && !this.data.loading) this._resetAndLoad();
  },

  onPullDownRefresh: function () {
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
    wx.setClipboardData({ data: no, success: function () { toast.success(i18n.t(NS + 'copied', this._lang)); } });
  },

  _resetAndLoad: function () {
    this.setData({ list: [], page: 1, hasMore: true, loadError: false });
    this._loadStatusCounts();
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
        // displayHelper.findStatus 用 `key || ''` 处理空值，数字 0 会被误判为空，故传 String(statusNum)
        var stText = (statusNum >= 0 && statusNum <= 5)
          ? displayHelper.displaySalesOrderStatusText(String(statusNum))
          : i18n.t(NS + 'unknown', i18n.getLanguage());
        var st = { text: stText, cls: STATUS_CLS_MAP[statusNum] || 'order-tag--default' };
        // 商品信息
        var productName = r.productName || r.itemName || '';
        var quantity = r.quantity != null ? r.quantity : '';
        var productText = productName ? (productName + (quantity ? ' x' + quantity : '')) : '';

        return {
          id: r.id || r.orderNo,
          platformOrderNo: r.platformOrderNo || '',
          orderNo: r.orderNo || '',
          platform: code,
          platformName: getPlatformName(code, that._lang),
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
        toast.error(i18n.t(NS + 'refreshFailed', i18n.getLanguage()));
      } else {
        // 加载更多失败时也要给用户反馈，并保留 hasMore 让用户可重试
        toast.info(i18n.t(NS + 'loadMoreFailed', i18n.getLanguage()));
        that.setData({ hasMore: true });
      }
    });
  },

  // 加载各状态Tab的数量（通过 pageSize=1 轻量请求获取 total）
  _loadStatusCounts: function () {
    var that = this;
    var counts = {};
    var platform = this.data.activePlatform;
    var keyword = this.data.keyword;

    // 并行请求各状态的 total
    var promises = STATUS_TABS.map(function (tab) {
      var params = { platform: platform, status: tab.key, page: 1, pageSize: 1 };
      if (keyword) params.keyword = keyword;
      return api.ecommerce.listOrders(params).then(function (res) {
        counts[tab.key] = Number((res && res.total) || 0);
      }).catch(function () {
        counts[tab.key] = 0;
      });
    });

    Promise.all(promises).then(function () {
      that.setData({ statusCounts: counts });
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
