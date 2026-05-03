/**
 * 进度看板 — 老板/管理者移动端生产关键指标总览
 *
 * 顶部：4 张摘要卡片（样衣/生产/入库/出库）
 * 中部：状态过滤条（全部/生产中/入库/已完成）
 * 底部：完整订单列表（带封面图、工序进度明细、颜色尺码矩阵，可展开收起）
 *
 * 数据来源：
 *   dashboard.get()            → overdueOrderCount / todayScanCount / sampleDevelopmentCount
 *   dashboard.getTopStats()    → warehousingInbound/outbound .day/.week
 *   production.orderStats()    → 订单统计（与H5进度看板一致）
 *   production.listOrders      → 订单列表 + 状态计数
 */
var api = require('../../utils/api');
var { transformOrderData } = require('../work/utils/orderTransform');
var { buildProcessNodesWithRates, calcOrderProgress } = require('../work/utils/progressNodes');
var { isAdminOrSupervisor } = require('../../utils/permission');
var { isTenantOwner } = require('../../utils/storage');
var { eventBus, Events } = require('../../utils/eventBus');

var app = getApp();

/* 状态过滤映射（值 = 后端 status 字段；overdue 为客户端筛选） */
var STATUS_FILTERS = [
  { key: 'all',           label: '进行中', value: '' },
  { key: 'in_production', label: '生产中', value: 'production' },
  { key: 'completed',     label: '已完成', value: 'completed' },
  { key: 'overdue',       label: '延期',   value: '' },
];

function buildProcessNodes(order) {
  return buildProcessNodesWithRates(order);
}

/** 为订单注入看板所需的扩展字段 */
function enrichForDashboard(order) {
  var completed = Number(order.completedQuantity) || 0;
  var total = Number(order.cuttingQuantity) || Number(order.cuttingQty) || Number(order.orderQuantity) || Number(order.sizeTotal) || 0;
  order.processNodes = buildProcessNodes(order);
  order.remainQuantity = Math.max(0, total - completed);
  order.calculatedProgress = calcOrderProgress(order);
  order.expanded = false;
  return order;
}

Page({
  data: {
    loading: true,
    todayStr: '',
    /* 4 张摘要卡片 */
    cards: {
      sample:     { developing: 0, completed: 0 },
      production: { total: 0, overdue: 0, pieces: 0 },
      inbound:    { today: 0, week: 0 },
      outbound:   { today: 0, week: 0 },
    },
    todayScanCount: 0,
    unreadNoticeCount: 0,
    /* 状态过滤 */
    statFilters: STATUS_FILTERS,
    activeFilter: 'all',
    statCounts: { all: 0, in_production: 0, completed: 0, overdue: 0 },
    searchKey: '',
    /* 订单列表（分页） */
    orders: { list: [], page: 0, pageSize: 15, loading: false, hasMore: true },
  },

  onLoad: function () {
    var app = getApp();
    if (app.requireAuth && !app.requireAuth()) return;
    if (!isTenantOwner() && !isAdminOrSupervisor()) {
      wx.showToast({ title: '无权限访问', icon: 'none', duration: 1500 });
      wx.navigateBack({ delta: 1, fail: function () { wx.switchTab({ url: '/pages/home/index' }); } });
      return;
    }
    this.setData({ todayStr: this._formatToday() });
    this.refreshCards();
    this.loadOrders(true);
  },

  onShow: function () {
    var app = getApp();
    if (app.requireAuth && !app.requireAuth()) return;
    if (this._loaded) {
      this.refreshCards();
      this.loadOrders(true);
    }
    this._loaded = true;
    this._loadUnreadCount();
    this._bindWsEvents();
  },

  onPullDownRefresh: function () {
    Promise.all([this.refreshCards(), this.loadOrders(true)]).then(function () {
      wx.stopPullDownRefresh();
    }).catch(function (e) { console.warn('[dashboard] 下拉刷新失败:', e.message || e); wx.stopPullDownRefresh(); });
  },

  onReachBottom: function () {
    this.loadOrders(false);
  },

  onHide: function () {
    clearTimeout(this._searchTimer);
    this._searchTimer = null;
    this._unbindWsEvents();
  },

  onUnload: function () {
    clearTimeout(this._searchTimer);
    this._searchTimer = null;
    this._unbindWsEvents();
  },

  /* ======== 刷新摘要卡片（3 个并发请求，与H5进度看板一致） ======== */
  refreshCards: function () {
    var that = this;
    that.setData({ loading: true });

    var apiFailCount = 0;
    var orderStatsFn = api.production && typeof api.production.orderStats === 'function'
      ? api.production.orderStats : null;
    if (!orderStatsFn) {
      var prodKeys = api.production ? Object.keys(api.production).join(',') : 'undefined';
      console.warn('[Dashboard] api.production.orderStats 不可用，跳过订单统计。production keys:', prodKeys);
    }
    return Promise.all([
      api.dashboard.get().catch(function (e) { console.warn('[Dashboard] dash API失败:', e.message || e); apiFailCount++; return {}; }),
      api.dashboard.getTopStats().catch(function (e) { console.warn('[Dashboard] topStats API失败:', e.message || e); apiFailCount++; return {}; }),
      orderStatsFn ? orderStatsFn({}).catch(function (e) { console.warn('[Dashboard] orderStats API失败:', e.message || e); apiFailCount++; return {}; }) : Promise.resolve({}),
    ]).then(function (res) {
      var dash     = res[0] || {};
      var topStats = res[1] || {};
      var stats    = res[2] || {};

      that.setData({
        loading: false,
        todayScanCount: Number(dash.todayScanCount) || 0,
        cards: {
          sample: {
            developing: Number(dash.sampleDevelopmentCount) || 0,
            completed:  Number(stats.completedOrders) || 0,
          },
          production: {
            total:   Number(stats.activeOrders) || 0,
            overdue: Number(dash.overdueOrderCount) || Number(stats.delayedOrders) || 0,
            pieces:  Number(stats.activeQuantity) || 0,
          },
          inbound: {
            today: (topStats.warehousingInbound && topStats.warehousingInbound.day) || 0,
            week:  (topStats.warehousingInbound && topStats.warehousingInbound.week) || 0,
          },
          outbound: {
            today: (topStats.warehousingOutbound && topStats.warehousingOutbound.day) || 0,
            week:  (topStats.warehousingOutbound && topStats.warehousingOutbound.week) || 0,
          },
        },
      });
      if (apiFailCount >= 3) {
        wx.showToast({ title: '数据加载失败，请下拉刷新', icon: 'none', duration: 2500 });
      } else if (apiFailCount > 0) {
        wx.showToast({ title: '部分数据加载失败', icon: 'none', duration: 2000 });
      }
    }).catch(function (err) {
      console.error('[Dashboard] refreshCards error:', err);
      that.setData({ loading: false });
    });
  },

  /* ======== 加载订单列表（分页 + 封面图 + 工序明细） ======== */
  loadOrders: function (reset) {
    var that = this;
    var activeKey = this.data.activeFilter;
    var isOverdue = activeKey === 'overdue';
    var filterVal = '';
    if (!isOverdue) {
      for (var i = 0; i < STATUS_FILTERS.length; i++) {
        if (STATUS_FILTERS[i].key === activeKey) {
          filterVal = STATUS_FILTERS[i].value;
          break;
        }
      }
    }

    return app.loadPagedList(this, 'orders', reset, function (p) {
      var params = { page: p.page, pageSize: isOverdue ? 50 : p.pageSize, excludeTerminal: 'true' };
      if (isOverdue) {
        params.status = 'production';
      } else if (filterVal) {
        params.status = filterVal;
      }
      var searchKey = that.data.searchKey;
      if (searchKey) params.orderNo = searchKey;
      return api.production.listOrders(params);
    }, function (r) {
      return enrichForDashboard(transformOrderData(r));
    }).then(function () {
      if (isOverdue) {
        var filtered = (that.data.orders.list || []).filter(function (o) {
          return o.remainDaysClass === 'days-overdue';
        });
        that.setData({ 'orders.list': filtered });
      }
      if (reset) that._refreshStatCounts();
    }).catch(function (e) { console.warn('[dashboard] loadOrders失败:', e.message || e); });
  },

  /* ======== 刷新状态计数 ======== */
  _refreshStatCounts: function () {
    var that = this;
    var orderStatsFn2 = api.production && typeof api.production.orderStats === 'function'
      ? api.production.orderStats : null;
    Promise.all([
      orderStatsFn2 ? orderStatsFn2({}).catch(function () { return {}; }) : Promise.resolve({}),
      api.dashboard.get().catch(function () { return {}; }),
    ]).then(function (res) {
      var stats = res[0] || {};
      var dash  = res[1] || {};
      that.setData({
        statCounts: {
          all:            Number(stats.totalOrders) || 0,
          in_production:  Number(stats.activeOrders) || 0,
          completed:      Number(stats.completedOrders) || 0,
          overdue:        Number(dash.overdueOrderCount) || Number(stats.delayedOrders) || 0,
        },
      });
    }).catch(function () {});
  },

  /* ======== 状态筛选切换 ======== */
  onStatTap: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key === this.data.activeFilter) return;
    this.setData({ activeFilter: key });
    this.loadOrders(true);
  },

  /* ======== 展开/收起订单卡片 ======== */
  onCardToggle: function (e) {
    var idx = e.currentTarget.dataset.index;
    var path = 'orders.list[' + idx + '].expanded';
    this.setData({ [path]: !this.data.orders.list[idx].expanded });
  },

  /* ======== 封面图预览 ======== */
  onCoverPreview: function (e) {
    var url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  /* ======== 复制订单号 ======== */
  onCopyOrderNo: function (e) {
    var orderNo = e.currentTarget.dataset.orderNo;
    if (!orderNo) return;
    wx.setClipboardData({ data: orderNo, success: function () {
      wx.showToast({ title: '已复制', icon: 'success', duration: 1000 });
    }});
  },

  /* ======== 查看裁剪明细 ======== */
  onViewCuttingBundles: function (e) {
    var orderNo = e.currentTarget.dataset.orderNo;
    if (!orderNo) return;
    wx.navigateTo({ url: '/pages/cutting/bundle-detail/index?orderNo=' + encodeURIComponent(orderNo) });
  },

  /* ======== 转单 ======== */
  onTransferOrder: function (e) {
    var orderId = e.currentTarget.dataset.orderId;
    var orderNo = e.currentTarget.dataset.orderNo;
    if (!orderId && !orderNo) return;
    wx.navigateTo({ url: '/pages/cutting/bundle-detail/index?orderId=' + encodeURIComponent(orderId || '') + '&orderNo=' + encodeURIComponent(orderNo || '') + '&tab=transfer' });
  },

  /* ======== 工序编辑 ======== */
  onEditProcess: function (e) {
    var orderId = e.currentTarget.dataset.orderId;
    var orderNo = e.currentTarget.dataset.orderNo;
    var status = e.currentTarget.dataset.status;
    if (!orderId) return;
    if (status !== 'production') {
      wx.showToast({ title: '仅生产中的订单可编辑工序', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/dashboard/process-edit/index?orderId=' + encodeURIComponent(orderId) + '&orderNo=' + encodeURIComponent(orderNo || '') });
  },

  /* ======== 搜索：输入（防抖 500ms） ======== */
  onSearchInput: function (e) {
    var that = this;
    var val = (e.detail.value || '').trim();
    that.setData({ searchKey: val });
    clearTimeout(that._searchTimer);
    that._searchTimer = setTimeout(function () {
      that.loadOrders(true);
    }, 500);
  },

  /* ======== 搜索：清除 ======== */
  onSearchClear: function () {
    this.setData({ searchKey: '' });
    this.loadOrders(true);
  },

  /* ======== 通知数量（小云 AI 助手浮标） ======== */
  _loadUnreadCount: function () {
    return api.notice.unreadCount()
      .then(function (res) {
        var count = Number(res) || 0;
        this.setData({ unreadNoticeCount: count });
      }.bind(this))
      .catch(function (e) { console.warn('[dashboard] _loadUnreadCount失败:', e.message || e); });
  },

  /* ======== 工具方法 ======== */
  _formatToday: function () {
    var d = new Date();
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  },

  _bindWsEvents: function () {
    if (this._wsBound) return;
    this._wsBound = true;
    var that = this;
    this._onDataChanged = function () { that.refreshCards(); that.loadOrders(true); };
    this._onOrderProgress = function () { that.refreshCards(); that.loadOrders(true); };
    this._onOrderStatus = function () { that.refreshCards(); that.loadOrders(true); };
    this._onWarehouseIn = function () { that.refreshCards(); that.loadOrders(true); };
    this._onScanSuccess = function () { that.loadOrders(true); };
    this._onScanUndo = function () { that.loadOrders(true); };
    this._onRefreshAll = function () { that.refreshCards(); that.loadOrders(true); that._loadUnreadCount(); };
    eventBus.on(Events.DATA_CHANGED, this._onDataChanged);
    eventBus.on(Events.ORDER_PROGRESS_CHANGED, this._onOrderProgress);
    eventBus.on(Events.ORDER_STATUS_CHANGED, this._onOrderStatus);
    eventBus.on(Events.WAREHOUSE_IN, this._onWarehouseIn);
    eventBus.on(Events.SCAN_SUCCESS, this._onScanSuccess);
    eventBus.on(Events.SCAN_UNDO, this._onScanUndo);
    eventBus.on(Events.REFRESH_ALL, this._onRefreshAll);
  },

  _unbindWsEvents: function () {
    if (!this._wsBound) return;
    this._wsBound = false;
    if (this._onDataChanged) eventBus.off(Events.DATA_CHANGED, this._onDataChanged);
    if (this._onOrderProgress) eventBus.off(Events.ORDER_PROGRESS_CHANGED, this._onOrderProgress);
    if (this._onOrderStatus) eventBus.off(Events.ORDER_STATUS_CHANGED, this._onOrderStatus);
    if (this._onWarehouseIn) eventBus.off(Events.WAREHOUSE_IN, this._onWarehouseIn);
    if (this._onScanSuccess) eventBus.off(Events.SCAN_SUCCESS, this._onScanSuccess);
    if (this._onScanUndo) eventBus.off(Events.SCAN_UNDO, this._onScanUndo);
    if (this._onRefreshAll) eventBus.off(Events.REFRESH_ALL, this._onRefreshAll);
  },
});
