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
const api = require('../../utils/api');
const { transformOrderData } = require('../../utils/shared/orderTransform');
const { buildProcessNodesWithRates, calcOrderProgress } = require('../../utils/shared/progressNodes');
const { isAdminOrSupervisor } = require('../../utils/permission');
const { isTenantOwner } = require('../../utils/storage');
const { eventBus, Events } = require('../../utils/eventBus');
const { safeNavigate } = require('../../utils/uiHelper');

const app = getApp();

/* 状态过滤映射（值 = 后端 status 字段；
   已延期用 smart-hints 筛选；
   待生产按 status='pending' 精确过滤；
   生产中不单独过滤 status='production'，而是依赖 excludeTerminal='true' 排除终止状态，
   因为活跃状态包含 production/in_progress/cutting/sewing/ironing/packaging/quality_check/warehousing 等） */
const STATUS_FILTERS = [
  { key: 'all',           label: '全部',   value: '' },
  { key: 'pending',       label: '待生产', value: 'pending' },
  { key: 'in_production', label: '生产中', value: '' },
  { key: 'completed',     label: '已完成', value: 'completed' },
  { key: 'overdue',       label: '已延期', value: '' },
];

function buildProcessNodes(order) {
  return buildProcessNodesWithRates(order);
}

/** 为订单注入看板所需的扩展字段 */
function enrichForDashboard(order) {
  const completed = Number(order.completedQuantity) || 0;
  const total = Number(order.cuttingQuantity) || Number(order.cuttingQty) || Number(order.orderQuantity) || Number(order.sizeTotal) || 0;
  order.processNodes = buildProcessNodes(order);
  order.remainQuantity = Math.max(0, total - completed);
  order.calculatedProgress = calcOrderProgress(order);
  order.expanded = false;
  // 对齐PC端显示字段
  order.styleNameDisplay = order.styleName || '';
  order.merchandiserDisplay = order.merchandiser || '';
  order.customerDisplay = order.company || order.customer || order.customerName || '';
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
    /* 状态过滤（统一一条：全部/待生产/生产中/已完成/已延期） */
    statFilters: STATUS_FILTERS,
    activeFilter: 'all',
    statCounts: { all: 0, pending: 0, in_production: 0, overdue: 0, completed: 0 },
    searchKey: '',
    /* 菲号明细展开的订单ID（同一时间只展开一个） */
    expandedOrderId: null,
    /* 订单列表（分页） */
    orders: { list: [], page: 0, pageSize: 15, loading: false, hasMore: true },
  },

  onLoad: function (options) {
    const app = getApp();
    if (app.requireAuth && !app.requireAuth()) return;
    if (!isTenantOwner() && !isAdminOrSupervisor()) {
      toast.error('无权限访问');
      wx.navigateBack({ delta: 1, fail: function () { wx.switchTab({ url: '/pages/home/index' }); } });
      return;
    }
    this._pendingOrderId = (options && options.orderId) ? decodeURIComponent(options.orderId) : '';
    this.setData({ todayStr: this._formatToday() });
    this.refreshCards();
    this.loadOrders(true);
  },

  onShow: function () {
    const app = getApp();
    if (app.requireAuth && !app.requireAuth()) return;
    // 首次加载已在 onLoad 处理，后续从子页面返回时只刷新统计数据，不重载订单列表
    // 避免：展开卡片→点击采购→返回→列表重载→卡片全部收起→「乱跳」体验
    if (this._loaded) {
      this.refreshCards();
    }
    this._loaded = true;
    this._bindWsEvents();
    const that = this;
    setTimeout(function () { that._loadUnreadCount(); }, 200);
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
    const that = this;
    that.setData({ loading: true });

    let apiFailCount = 0;
    const orderStatsFn = api.production && typeof api.production.orderStats === 'function'
      ? api.production.orderStats : null;
    if (!orderStatsFn) {
      const prodKeys = api.production ? Object.keys(api.production).join(',') : 'undefined';
      console.warn('[Dashboard] api.production.orderStats 不可用，跳过订单统计。production keys:', prodKeys);
    }
    return Promise.all([
      api.dashboard.get().catch(function (e) { console.warn('[Dashboard] dash API失败:', e.message || e); apiFailCount++; return {}; }),
      api.dashboard.getTopStats().catch(function (e) { console.warn('[Dashboard] topStats API失败:', e.message || e); apiFailCount++; return {}; }),
      orderStatsFn ? orderStatsFn({}).catch(function (e) { console.warn('[Dashboard] orderStats API失败:', e.message || e); apiFailCount++; return {}; }) : Promise.resolve({}),
    ]).then(function (res) {
      const dash     = res[0] || {};
      const topStats = res[1] || {};
      const stats    = res[2] || {};

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
        toast.error('数据加载失败，请下拉刷新');
      } else if (apiFailCount > 0) {
        toast.info('部分数据加载失败');
      }
    }).catch(function (err) {
      console.error('[Dashboard] refreshCards error:', err);
      that.setData({ loading: false });
    });
  },

  /* ======== 加载订单列表（分页 + 封面图 + 工序明细） ======== */
  loadOrders: function (reset) {
    const that = this;
    const activeKey = this.data.activeFilter;
    let filterVal = '';
    for (let i = 0; i < STATUS_FILTERS.length; i++) {
      if (STATUS_FILTERS[i].key === activeKey) {
        filterVal = STATUS_FILTERS[i].value;
        break;
      }
    }

    // 已延期需要拉取更大范围再做本地过滤
    const isSmartFilter = activeKey === 'overdue';

    return app.loadPagedList(this, 'orders', reset, function (p) {
      const params = { page: p.page, pageSize: isSmartFilter ? 50 : p.pageSize };
      // 选"生产中"时排除终态，选"已完成"时按status查询，默认全部不过滤
      if (activeKey === 'in_production') {
        params.excludeTerminal = 'true';
      }
      if (filterVal) {
        params.status = filterVal;
      }
      const searchKey = that.data.searchKey;
      if (searchKey) params.orderNo = searchKey;
      return api.production.listOrders(params);
    }, function (r) {
      // 防御性捕获：transformOrderData 崩溃时仍能展示原始数据
      try { return enrichForDashboard(transformOrderData(r)); } catch (e) {
        console.warn('[loadOrders] transformOrderData 失败，使用原始数据:', e.message || e);
        return enrichForDashboard(r);
      }
    }).then(function () {
      // 智能筛选：已延期（基于订单 remainDaysClass，与小程序订单交期计算一致）
      if (activeKey === 'overdue') {
        const filtered = (that.data.orders.list || []).filter(function (o) {
          return o.remainDaysClass === 'days-overdue';
        });
        that.setData({ 'orders.list': filtered });
      }
      if (reset) that._refreshStatCounts();
      if (that._pendingOrderId) {
        const pid = that._pendingOrderId;
        that._pendingOrderId = '';
        const list = that.data.orders.list || [];
        for (let i = 0; i < list.length; i++) {
          if (list[i].id === pid) {
            if (!list[i].expanded) {
              that.setData({ ['orders.list[' + i + '].expanded']: true });
            }
            break;
          }
        }
      }
    }).catch(function (e) {
      console.warn('[dashboard] loadOrders失败:', e.message || e);
      toast.error('订单加载失败，请下拉刷新');
    });
  },

  /* ======== 刷新状态计数 ======== */
  _refreshStatCounts: function () {
    const that = this;
    const orderStatsFn2 = api.production && typeof api.production.orderStats === 'function'
      ? api.production.orderStats : null;
    Promise.all([
      orderStatsFn2 ? orderStatsFn2({}).catch(function () { return {}; }) : Promise.resolve({}),
      api.dashboard.get().catch(function () { return {}; }),
      orderStatsFn2 ? orderStatsFn2({ status: 'pending' }).catch(function () { return {}; }) : Promise.resolve({}),
    ]).then(function (res) {
      const stats = res[0] || {};
      const dash  = res[1] || {};
      const pendingStats = res[2] || {};
      const overdueCount = Number(dash.overdueOrderCount) || Number(stats.delayedOrders) || 0;
      that.setData({
        statCounts: {
          all:            (Number(stats.activeOrders) || 0) + (Number(stats.completedOrders) || 0),
          pending:        Number(pendingStats.activeOrders) || 0,
          in_production:  Number(stats.activeOrders) || 0,
          overdue:        overdueCount,
          completed:      Number(stats.completedOrders) || 0,
        },
      });
    }).catch(function () {});
  },

  /* ======== 状态筛选切换 ======== */
  onStatTap: function (e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeFilter) return;
    this.setData({ activeFilter: key });
    this.loadOrders(true);
  },

  /* ======== 展开/收起订单卡片 ======== */
  onCardToggle: function (e) {
    const idx = e.currentTarget.dataset.index;
    const now = Date.now();
    // 200ms 内同一卡片不重复切换，避免双击闪烁
    const last = this._lastToggleTime || {};
    if (last[idx] && now - last[idx] < 200) return;
    last[idx] = now;
    this._lastToggleTime = last;
    const path = 'orders.list[' + idx + '].expanded';
    this.setData({ [path]: !this.data.orders.list[idx].expanded });
  },
  onExpandNoop: function () {
    // 阻止展开区的冒泡，避免误触折叠
  },

  /* ======== 菲号明细展开/收起（同一时间只展开一个订单） ======== */
  toggleExpand: function (e) {
    var id = e.currentTarget.dataset.id;
    var current = this.data.expandedOrderId;
    this.setData({ expandedOrderId: current === id ? null : id });
  },

  /* ======== 封面图预览 ======== */
  onCoverPreview: function (e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  /* ======== 复制订单号 ======== */
  onOpenRemark: function (e) {
    const idx = e.currentTarget.dataset.index;
    const order = this.data.orders.list[idx];
    if (!order) return;
    safeNavigate({ url: '/pages/order/remark/index?targetType=order&targetNo=' + encodeURIComponent(order.orderNo || '') }).catch(() => {});
  },

  onCopyOrderNo: function (e) {
    const orderNo = e.currentTarget.dataset.orderNo;
    if (!orderNo) return;
    wx.setClipboardData({ data: orderNo, success: function () {
      toast.success('已复制');
    }});
  },

  /* ======== 采购 ======== */
  onGoProcurement: function (e) {
    const idx = e.currentTarget.dataset.index;
    const order = this.data.orders.list[idx];
    if (!order) return;
    safeNavigate({ url: '/pages/procurement/task-detail/index?orderNo=' + encodeURIComponent(order.orderNo || '') + '&styleNo=' + encodeURIComponent(order.styleNo || '') }).catch(() => {});
  },

  /* ======== 查看裁剪明细 ======== */
  onViewCuttingBundles: function (e) {
    const orderNo = e.currentTarget.dataset.orderNo;
    if (!orderNo) return;
    safeNavigate({ url: '/pages/cutting/bundle-detail/index?orderNo=' + encodeURIComponent(orderNo) }).catch(() => {});
  },

  /* ======== 转单 ======== */
  onTransferOrder: function (e) {
    const orderId = e.currentTarget.dataset.orderId;
    const orderNo = e.currentTarget.dataset.orderNo;
    if (!orderId && !orderNo) return;
    safeNavigate({ url: '/pages/cutting/bundle-detail/index?orderId=' + encodeURIComponent(orderId || '') + '&orderNo=' + encodeURIComponent(orderNo || '') + '&tab=transfer' }).catch(() => {});
  },

  /* ======== 工序编辑 ======== */
  onEditProcess: function (e) {
    const orderId = e.currentTarget.dataset.orderId;
    const orderNo = e.currentTarget.dataset.orderNo;
    const status = e.currentTarget.dataset.status;
    if (!orderId) return;
    if (status !== 'production') {
      wx.showToast({ title: '仅生产中的订单可编辑工序', icon: 'none' });
      return;
    }
    safeNavigate({ url: '/pages/dashboard/process-edit/index?orderId=' + encodeURIComponent(orderId) + '&orderNo=' + encodeURIComponent(orderNo || '') }).catch(() => {});
  },

  /* ======== 打开订单详情页 ======== */
  onOpenDetail: function (e) {
    const idx = e.currentTarget.dataset.index;
    const order = this.data.orders.list[idx];
    if (!order) return;
    const params = [];
    if (order.id) params.push('orderId=' + encodeURIComponent(order.id));
    if (order.orderNo) params.push('orderNo=' + encodeURIComponent(order.orderNo));
    safeNavigate({ url: '/pages/dashboard/order-detail/index?' + params.join('&') }).catch(function () {});
  },

  /* ======== 搜索：输入（防抖 500ms） ======== */
  onSearchInput: function (e) {
    const that = this;
    const val = (e.detail.value || '').trim();
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

  /* ======== 扫码：调用 wx.scanCode 识别订单二维码 ======== */
  onScanCode: function () {
    const that = this;
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode', 'barCode'],
      success: function (res) {
        const code = (res.result || '').trim();
        if (!code) {
          toast.error('扫码内容为空');
          return;
        }
        // 将扫码结果设为搜索关键词并触发搜索
        that.setData({ searchKey: code });
        that.loadOrders(true);
      },
      fail: function () {
        // 用户取消不提示
      }
    });
  },

  /* ======== 通知数量（小云 AI 助手浮标） ======== */
  _loadUnreadCount: function () {
    return api.notice.unreadCount()
      .then(function (res) {
        const count = Number(res) || 0;
        this.setData({ unreadNoticeCount: count });
      }.bind(this))
      .catch(function (e) { console.warn('[dashboard] _loadUnreadCount失败:', e.message || e); });
  },

  /* ======== 工具方法 ======== */
  _formatToday: function () {
    const d = new Date();
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  },

  _bindWsEvents: function () {
    if (this._wsBound) return;
    this._wsBound = true;
    const that = this;
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
