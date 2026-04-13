/**
 * 进度看板 — 老板/管理者移动端生产关键指标总览
 *
 * 顶部：4 张摘要卡片（样衣/生产/入库/出库）
 * 中部：状态过滤条（全部/生产中/入库/已完成）
 * 底部：完整订单列表（带封面图、工序进度明细、颜色尺码矩阵，可展开收起）
 *
 * 数据来源：
 *   dashboard.get()         → overdueOrderCount / todayScanCount / sampleDevelopmentCount
 *   dashboard.getTopStats() → warehousingInbound/outbound .day/.week
 *   production.listOrders   → 订单列表 + 状态计数
 */
var api = require('../../utils/api');
var { transformOrderData } = require('../work/utils/orderTransform');
var { resolveNodesFromOrder, clampPercent, buildProcessNodesWithRates } = require('../work/utils/progressNodes');
var { isAdminOrSupervisor } = require('../../utils/permission');
var { isTenantOwner } = require('../../utils/storage');

var app = getApp();

/* 状态过滤映射（值 = 后端 status 字段；overdue 为客户端筛选） */
var STATUS_FILTERS = [
  { key: 'all',           label: '全部',   value: '' },
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
    // 进度看板仅限租户老板/管理员/主管/跟单，普通工厂工人无权访问
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
    if (this._loaded) {
      this.refreshCards();
      this.loadOrders(true);
    }
    this._loaded = true;
    this._loadUnreadCount();
  },

  onPullDownRefresh: function () {
    var that = this;
    Promise.all([this.refreshCards(), this.loadOrders(true)]).then(function () {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    this.loadOrders(false);
  },

  /* ======== 刷新摘要卡片（4 个并发请求） ======== */
  refreshCards: function () {
    var that = this;
    that.setData({ loading: true });

    return Promise.all([
      api.dashboard.get().catch(function () { return {}; }),
      api.dashboard.getTopStats().catch(function () { return {}; }),
      api.production.listOrders({ deleteFlag: 0, status: 'production', page: 1, pageSize: 50 }).catch(function () { return {}; }),
      api.production.listOrders({ deleteFlag: 0, status: 'completed',  page: 1, pageSize: 1 }).catch(function () { return {}; }),
    ]).then(function (res) {
      var dash     = res[0] || {};
      var topStats = res[1] || {};
      var prodRes  = res[2] || {};
      var compRes  = res[3] || {};

      var prodRecords = (prodRes && prodRes.records) || [];
      var totalPieces = 0;
      for (var i = 0; i < prodRecords.length; i++) {
        totalPieces += Number(prodRecords[i].orderQuantity) || 0;
      }

      that.setData({
        loading: false,
        todayScanCount: Number(dash.todayScanCount) || 0,
        cards: {
          sample: {
            developing: Number(dash.sampleDevelopmentCount) || 0,
            completed:  compRes.total || 0,
          },
          production: {
            total:   prodRes.total || 0,
            overdue: Number(dash.overdueOrderCount) || 0,
            pieces:  totalPieces,
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
      // 延期订单加大 pageSize 弥补客户端过滤损失
      var params = { deleteFlag: 0, page: p.page, pageSize: isOverdue ? 50 : p.pageSize };
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
      // 延期筛选：客户端根据交期过滤
      if (isOverdue) {
        var filtered = (that.data.orders.list || []).filter(function (o) {
          return o.remainDaysClass === 'days-overdue';
        });
        that.setData({ 'orders.list': filtered });
      }
      if (reset) that._refreshStatCounts();
    });
  },

  /* ======== 刷新状态计数 ======== */
  _refreshStatCounts: function () {
    var that = this;
    Promise.all([
      api.production.listOrders({ deleteFlag: 0, page: 1, pageSize: 1 }).catch(function () { return {}; }),
      api.production.listOrders({ deleteFlag: 0, status: 'production', page: 1, pageSize: 1 }).catch(function () { return {}; }),
      api.production.listOrders({ deleteFlag: 0, status: 'completed', page: 1, pageSize: 1 }).catch(function () { return {}; }),
      api.dashboard.get().catch(function () { return {}; }),
    ]).then(function (res) {
      that.setData({
        statCounts: {
          all:            (res[0] && res[0].total) || 0,
          in_production:  (res[1] && res[1].total) || 0,
          completed:      (res[2] && res[2].total) || 0,
          overdue:        Number((res[3] && res[3].overdueOrderCount) || 0),
        },
      });
    });
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

  /* ======== 复制订单号 ======== */
  onCopyOrderNo: function (e) {
    var orderNo = e.currentTarget.dataset.orderNo;
    if (!orderNo) return;
    wx.setClipboardData({ data: orderNo, success: function () {
      wx.showToast({ title: '已复制', icon: 'success', duration: 1000 });
    }});
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
        var count = (res && res.data != null) ? Number(res.data) : (Number(res) || 0);
        this.setData({ unreadNoticeCount: count });
      }.bind(this))
      .catch(function (e) { console.warn('[dashboard] _loadUnreadCount失败:', e.message || e); });
  },

  /* ======== 工具方法 ======== */
  _formatToday: function () {
    var d = new Date();
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  },
});
