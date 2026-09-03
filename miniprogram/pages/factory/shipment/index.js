const api = require('../../../utils/api');
const { toast, safeNavigate, scanInPage } = require('../../../utils/uiHelper');
const { dispatchInlineScanCode } = require('../../scan/handlers/InlineScanDispatcher');
const { isAdminOrSupervisor } = require('../../../utils/permission');
const { getTenantPriceVisible, cacheTenantPriceVisible, applyTenantPriceVisibility, PRICE_FLAG_KEY, applyTimelineStatus, mergeStageMetaIntoNodes, refreshWaitDurations } = require('../../../utils/procTimeline');
const { isFactoryOwner, getUserInfo } = require('../../../utils/storage');
const { transformOrderData } = require('../utils/orderTransform');
const { buildProcessNodesWithRates, calcOrderProgress } = require('../utils/progressNodes');
const displayHelper = require('../../../utils/displayHelper');

/**
 * displayHelper 颜色常量 → 小程序 tag-* 颜色类映射
 * （displayHelper 返回 CSS 变量，模板用 tag-* 类）
 */
const COLOR_TO_TAG_CLASS = {
  [displayHelper.STATUS_COLOR_DEFAULT]: 'tag-gray',
  [displayHelper.STATUS_COLOR_SUCCESS]: 'tag-green',
  [displayHelper.STATUS_COLOR_PROCESSING]: 'tag-blue',
  [displayHelper.STATUS_COLOR_WARNING]: 'tag-orange',
  [displayHelper.STATUS_COLOR_ERROR]: 'tag-red',
  [displayHelper.STATUS_COLOR_BLUE]: 'tag-blue',
  [displayHelper.STATUS_COLOR_CYAN]: 'tag-cyan',
  [displayHelper.STATUS_COLOR_ORANGE]: 'tag-orange',
  [displayHelper.STATUS_COLOR_VOLCANO]: 'tag-red',
  [displayHelper.STATUS_COLOR_PURPLE]: 'tag-purple',
  [displayHelper.STATUS_COLOR_GEEKBLUE]: 'tag-geekblue',
};

function receiveStatusText(s) {
  if (!s) return '';
  return displayHelper.displayFactoryShipmentStatusText(s);
}

function receiveStatusCls(s) {
  if (!s) return 'tag-gray';
  const color = displayHelper.displayFactoryShipmentStatusColor(s);
  return COLOR_TO_TAG_CLASS[color] || 'tag-gray';
}

function enrichForDashboard(order) {
  const completed = Number(order.completedQuantity) || 0;
  const total = Number(order.cuttingQuantity) || Number(order.cuttingQty) || Number(order.orderQuantity) || Number(order.sizeTotal) || 0;
  order.processNodes = applyTimelineStatus(buildProcessNodesWithRates(order));
  order.processNodes.forEach(function (n) {
    n.percentWidth = Math.min(100, Math.max(0, n.percent >= 0 ? n.percent : 0));
  });
  order.remainQuantity = Math.max(0, total - completed);
  order.calculatedProgress = calcOrderProgress(order);
  order.progressWidth = Math.min(100, Math.max(0, order.calculatedProgress || 0));
  // D-229：对齐生产管理 dashboard —— 默认全部收起，由用户点击展开
  // 原 D-211 让单菲/无菲直接展开，导致页面进来所有单菲卡片都是展开的，视觉上很乱
  order.expanded = false;
  return order;
}

Page({
  data: {
    activeTab: 0,
    isFactory: false,
    isTenantAdmin: false,
    activeFilter: 'all',
    filterStats: { all: 0, production: 0, completed: 0, overdue: 0, warning: 0 },
    orders: [],
    orderLoading: false,
    orderPage: 1,
    orderHasMore: true,
    keyword: '',
    shipments: [],
    shipmentLoading: false,
    shipmentPage: 1,
    shipmentHasMore: true,
    factoryStats: [],
    selectedFactoryId: null,
    /* D-285：时间恒显示不受开关控制；单价仅受租户级全局开关控制（入口在「权限配置」页） */
    priceVisible: true,
  },

  onLoad: function () {
    const factory = isFactoryOwner();
    const admin = isAdminOrSupervisor();
    const userInfo = getUserInfo();
    this.setData({ isFactory: factory, isTenantAdmin: admin, activeTab: 0, priceVisible: getTenantPriceVisible() });
    this.loadTenantPriceFlag();
    // 工厂账号必须绑定 factoryId，否则后端无法做数据隔离，可能看到全租户数据
    if (factory && !(userInfo && userInfo.factoryId)) {
      toast.info('当前工厂账号未绑定工厂，请联系管理员处理');
    }
  },

  /**
   * 选择工厂筛选
   */
  onSelectFactory: function (e) {
    const id = e.currentTarget.dataset.id;
    const newId = this.data.selectedFactoryId === id ? null : id;
    this.setData({ selectedFactoryId: newId }, () => {
      this._resetAndLoad();
    });
  },

  /**
   * 从已加载订单计算工厂统计
   */
  _loadFactoryStats: function () {
      var orders = this._allLoadedOrders || this.data.orders || [];
    var statsMap = {};
    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      var fid = o.factoryId || o.outsourceFactoryId || 0;
      var fname = o.factoryName || o.outsourceFactoryName || '未知工厂';
      if (!statsMap[fid]) {
        statsMap[fid] = {
          factoryId: fid,
          factoryName: fname,
          orderCount: 0,
          totalQuantity: 0,
          styleCount: 0,
          inProgress: 0,
          completed: 0,
          overdue: 0,
          warning: 0,
          _styles: {},
        };
      }
      var s = statsMap[fid];
      s.orderCount++;
      s.totalQuantity += Number(o.cuttingQuantity || o.cuttingQty || o.totalQuantity || o.orderQuantity || 0);
      if (o.styleNo) s._styles[o.styleNo] = true;
      if (o.isClosed) {
        s.completed++;
      } else if (o.remainDaysClass === 'days-overdue') {
        s.overdue++;
      } else if (o.remainDaysClass === 'days-warn' || o.remainDaysClass === 'days-urgent') {
        s.warning++;
      } else {
        s.inProgress++;
      }
    }

    var stats = Object.keys(statsMap).map(function (key) {
      var s = statsMap[key];
      s.styleCount = Object.keys(s._styles).length;
      delete s._styles;
      return s;
    });
    stats.sort(function (a, b) { return b.orderCount - a.orderCount; });
    this.setData({ factoryStats: stats });
  },

  onShow: function () {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._resetAndLoad();
    this._startWaitTicker();
    // D-285：从「权限配置」页切完单价开关返回时重新拉取，保证立即生效
    this.loadTenantPriceFlag();
  },

  onHide: function () {
    this._stopWaitTicker();
  },

  onUnload: function () {
    this._stopWaitTicker();
  },

  onPullDownRefresh: function () {
    this._resetAndLoad().finally(function () { wx.stopPullDownRefresh(); });
  },

  /* ======== D-284：等待计时器（"等待 X"随时间走动，每分钟重算一次文案，不重拉接口） ======== */
  _startWaitTicker: function () {
    if (this._waitTimer) return;
    const that = this;
    this._waitTimer = setInterval(function () {
      that._refreshWaitTexts();
    }, 60000);
  },

  _stopWaitTicker: function () {
    if (this._waitTimer) {
      clearInterval(this._waitTimer);
      this._waitTimer = null;
    }
  },

  _refreshWaitTexts: function () {
    const list = this.data.orders || [];
    if (!list.length) return;
    const updates = {};
    let changed = false;
    list.forEach(function (order, idx) {
      if (!order.processNodes || !order.processNodes.length) return;
      const snapshot = order.processNodes.map(function (n) { return (n && n.gapText) || ''; }).join('|');
      refreshWaitDurations(order.processNodes);
      const next = order.processNodes.map(function (n) { return (n && n.gapText) || ''; }).join('|');
      if (snapshot !== next) {
        updates['orders[' + idx + '].processNodes'] = order.processNodes;
        changed = true;
      }
    });
    if (changed) this.setData(updates);
  },

  onReachBottom: function () {
    if (this.data.activeTab === 0 && this.data.orderHasMore && !this.data.orderLoading) {
      this._loadOrders();
    } else if (this.data.activeTab === 1 && this.data.shipmentHasMore && !this.data.shipmentLoading) {
      this._loadShipments();
    }
  },

  switchTab: function (e) {
    this.setData({ activeTab: Number(e.currentTarget.dataset.tab) });
  },

  _resetAndLoad: function () {
      const that = this;
      this._allLoadedOrders = [];
      this.setData({
      orderPage: 1, orders: [], orderHasMore: true,
      shipmentPage: 1, shipments: [], shipmentHasMore: true,
    });
    return Promise.all([this._loadOrders(), this._loadShipments()]).then(function () {
      that._loadFactoryStats();
    });
  },

  _loadOrders: function () {
      if (this.data.orderLoading) return Promise.resolve();
      const that = this;
      this.setData({ orderLoading: true });
      const params = { page: this.data.orderPage, pageSize: 20 };
      // D-235：外发工厂要能看到本厂全部状态的订单（生产中 / 已完成 / 已关单 /
      // 已报废 / 已取消）。后端 buildQueryWrapper 默认会排除 status='scrapped'，
      // 这里显式声明包含，避免报废单在列表里凭空消失。
      params.includeScrapped = 'true';
      // 与 PC 端外发工厂页保持一致，只查外发订单
      params.factoryType = 'EXTERNAL';
      if (this.data.keyword) params.keyword = this.data.keyword;
      // 工厂账号显式带上 factoryId，与后端 UserContext 形成双重校验，防止上下文异常时看到其他工厂数据
      const userInfo = getUserInfo();
      const currentFactoryId = userInfo && userInfo.factoryId ? String(userInfo.factoryId) : '';
      if (currentFactoryId) {
        params.factoryId = currentFactoryId;
      } else if (this.data.selectedFactoryId != null && this.data.selectedFactoryId !== 0) {
        // 未知工厂(factoryId=0)不传后端(后端无factory_id=0记录)，改由前端筛选 factoryId 为空的订单
        params.factoryId = this.data.selectedFactoryId;
      }
      return api.production.listOrders(params).then(function (res) {
        const records = (res && res.records) || [];
        const total = (res && res.total) || 0;
        const enriched = records.map(function (r) {
          return enrichForDashboard(transformOrderData(r));
        });
        that._allLoadedOrders = (that._allLoadedOrders || []).concat(enriched);
        that._computeFilterStats();
        that._applyFilter();
        that._loadFactoryStats();
        that.setData({
          orderHasMore: that._allLoadedOrders.length < total,
          orderPage: that.data.orderPage + 1,
          orderLoading: false,
        });
      }).catch(function (_e) {
        that.setData({ orderLoading: false });
        toast.error('加载失败'); // D-235：toast 是对象，不能用 toast(...) 直接调用
      });
  },

  onFilterTap: function (e) {
    var filter = e.currentTarget.dataset.filter;
    if (this.data.activeFilter === filter) return;
    var that = this;
    this.setData({ activeFilter: filter }, function () {
      that._applyFilter();
    });
  },

  _applyFilter: function () {
    var all = this._allLoadedOrders || [];
    var filter = this.data.activeFilter;
    var factoryId = this.data.selectedFactoryId;
    // 未知工厂(factoryId=0)：前端筛选 factoryId 为空的订单（后端不识别 factoryId=0）
    if (factoryId === 0) {
      all = all.filter(function (o) {
        return !o.factoryId && !o.outsourceFactoryId;
      });
    }
    var filtered;
    if (filter === 'all') {
      filtered = all;
    } else if (filter === 'completed') {
      filtered = all.filter(function (o) { return o.isClosed; });
    } else if (filter === 'overdue') {
      filtered = all.filter(function (o) { return o.remainDaysClass === 'days-overdue'; });
    } else if (filter === 'warning') {
      filtered = all.filter(function (o) { return o.remainDaysClass === 'days-warn' || o.remainDaysClass === 'days-urgent'; });
    } else {
      filtered = all.filter(function (o) { return !o.isClosed; });
    }
    this.setData({ orders: filtered });
  },

  _computeFilterStats: function () {
    var all = this._allLoadedOrders || [];
    var production = 0, completed = 0, overdue = 0, warning = 0;
    all.forEach(function (o) {
      if (o.isClosed) { completed++; } else { production++; }
      if (o.remainDaysClass === 'days-overdue') overdue++;
      if (o.remainDaysClass === 'days-warn' || o.remainDaysClass === 'days-urgent') warning++;
    });
    this.setData({
      filterStats: {
        all: all.length,
        production: production,
        completed: completed,
        overdue: overdue,
        warning: warning
      }
    });
  },

  _loadShipments: function () {
    if (this.data.shipmentLoading) return Promise.resolve();
    const that = this;
    this.setData({ shipmentLoading: true });
    const params = { page: this.data.shipmentPage, pageSize: 20 };
    return api.factoryShipment.list(params).then(function (res) {
      const records = (res && res.records) || [];
      const total = (res && res.total) || 0;
      const enriched = records.map(function (r) {
        r.statusText = receiveStatusText(r.receiveStatus);
        r.statusCls = receiveStatusCls(r.receiveStatus);
        return r;
      });
      that.setData({
        shipments: that.data.shipments.concat(enriched),
        shipmentHasMore: that.data.shipments.length + records.length < total,
        shipmentPage: that.data.shipmentPage + 1,
        shipmentLoading: false,
      });
    }).catch(function () { that.setData({ shipmentLoading: false }); });
  },

  onKeywordInput: function (e) { this.setData({ keyword: e.detail.value }); },
  onKeywordSearch: function () { this._resetAndLoad(); },
  /**
   * 扫码按钮：D-262 页内扫码一步直达工序领取/报工页。
   * 不再跳扫码主页（switchTab 丢参数需二次扫码），也不再跳工序编辑页（D-234 锁死领取/报工）
   */
  onScan: function () {
    scanInPage(function (parsed, raw) {
      if (!parsed) return; // 用户取消
      if (!parsed.success) {
        toast(parsed.message || ('无法识别：' + raw));
        return;
      }
      dispatchInlineScanCode(raw);
    });
  },

  onCardToggle: function (e) {
    const idx = e.currentTarget.dataset.index;
    const path = 'orders[' + idx + '].expanded';
    const nextExpanded = !this.data.orders[idx].expanded;
    this.setData({ [path]: nextExpanded });
    // D-285：时间恒显示，展开即懒加载该订单的阶段时间（每单只拉一次）
    if (nextExpanded) {
      this.loadStageMeta(idx);
    }
  },

  /* ======== D-283：租户级「工序单价显示」总开关（入口已移至「权限配置」页，本页只读生效） ======== */
  loadTenantPriceFlag: function () {
    api.system.getSmartFeatureFlags().then((flags) => {
      const raw = flags && flags[PRICE_FLAG_KEY];
      const visible = raw === undefined || raw === null ? true : !!raw;
      cacheTenantPriceVisible(visible);
      if (visible !== this.data.priceVisible) {
        this.setData({ priceVisible: visible });
        this.applyPriceVisibilityToLoadedOrders();
      }
    }).catch(() => { /* 拉取失败沿用本地缓存，不阻断页面 */ });
  },

  applyPriceVisibilityToLoadedOrders: function () {
    const visible = this.data.priceVisible;
    const updates = {};
    this.data.orders.forEach((order, idx) => {
      if (order.processNodes && order.processNodes.length) {
        applyTenantPriceVisibility(order.processNodes, visible);
        updates['orders[' + idx + '].processNodes'] = order.processNodes;
      }
    });
    if (Object.keys(updates).length) this.setData(updates);
  },

  /* 懒加载订单阶段时间（flow 接口的 stages 含 processName/startTime/completeTime） */
  loadStageMeta: function (idx) {
    const order = this.data.orders[idx];
    if (!order || order._stageMetaLoading || order._stageMetaLoaded) return;
    const orderId = order.id;
    if (!orderId) return;
    order._stageMetaLoading = true;
    api.production.getOrderFlow(orderId).then((res) => {
      const data = res || {};
      const stages = Array.isArray(data.stages) ? data.stages : (data.stages && Array.isArray(data.stages.records)) ? data.stages.records : [];
      const path = 'orders[' + idx + '].processNodes';
      const merged = mergeStageMetaIntoNodes(order.processNodes, stages);
      // D-283：合并后按租户级单价开关过滤（隐藏时不渲染 priceText）
      applyTenantPriceVisibility(merged, this.data.priceVisible);
      order._stageMetaLoaded = true;
      order._stageMetaLoading = false;
      this.setData({ [path]: merged });
    }).catch((err) => {
      order._stageMetaLoading = false;
      console.warn('[shipment] 阶段时间加载失败:', (err && err.message) || err);
    });
  },

  onCoverPreview: function (e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  onOpenRemark: function (e) {
    const idx = e.currentTarget.dataset.index;
    const order = this.data.orders[idx];
    if (!order) return;
    safeNavigate({ url: '/pages/order/remark/index?targetType=order&targetNo=' + encodeURIComponent(order.orderNo || '') }).catch(() => {});
  },

  onCopyOrderNo: function (e) {
    const orderNo = e.currentTarget.dataset.orderNo;
    if (!orderNo) { wx.showToast({ title: '订单号缺失', icon: 'none' }); return; }
    // D-211：补 fail 提示——此前静默失败时用户以为按钮坏了
    wx.setClipboardData({
      data: orderNo,
      success: function () {
        wx.showToast({ title: '已复制', icon: 'success', duration: 1000 });
      },
      fail: function (err) {
        console.error('[copy] setClipboardData fail', err);
        wx.showToast({ title: '复制失败：' + ((err && err.errMsg) || '未知错误'), icon: 'none', duration: 2500 });
      },
    });
  },

  onGoOrderDetail: function (e) {
    const idx = e.currentTarget.dataset.index;
    const order = this.data.orders[idx];
    if (!order) return;
    safeNavigate({ url: '/pages/dashboard/order-detail/index?orderId=' + encodeURIComponent(order.id) + '&orderNo=' + encodeURIComponent(order.orderNo || '') }).catch(() => {});
  },

  onGoOrderProcurement: function (e) {
    const idx = e.currentTarget.dataset.index;
    const order = this.data.orders[idx];
    if (!order) return;
    safeNavigate({ url: '/pages/procurement/task-detail/index?orderNo=' + encodeURIComponent(order.orderNo || '') + '&styleNo=' + encodeURIComponent(order.styleNo || '') }).catch(() => {});
  },

  onGoOrderCutting: function (e) {
    const idx = e.currentTarget.dataset.index;
    const order = this.data.orders[idx];
    if (!order) return;
    safeNavigate({ url: '/pages/cutting/bundle-detail/index?orderId=' + encodeURIComponent(order.id) + '&orderNo=' + encodeURIComponent(order.orderNo || '') }).catch(() => {});
  },

  onGoOrderProcessEdit: function (e) {
    const idx = e.currentTarget.dataset.index;
    const order = this.data.orders[idx];
    if (!order) return;
    safeNavigate({ url: '/pages/dashboard/process-edit/index?orderId=' + encodeURIComponent(order.id) + '&orderNo=' + encodeURIComponent(order.orderNo || '') }).catch(() => {});
  },

  onOpenShip: function (e) {
    const idx = e.currentTarget.dataset.index;
    const order = this.data.orders[idx];
    if (!order) return;
    // 把 order 数据存到全局缓存供详情页读取
    const app = getApp();
    app._pendingShipOrder = order;
    wx.navigateTo({ url: '/pages/factory/shipment-detail/index?orderId=' + encodeURIComponent(order.id) + '&orderNo=' + encodeURIComponent(order.orderNo || '') });
  },

  onViewShipment: function (e) {
    const idx = e.currentTarget.dataset.index;
    const order = this.data.orders[idx];
    if (!order) return;
    const app = getApp();
    app._pendingShipOrder = order;
    wx.navigateTo({ url: '/pages/factory/shipment-detail/index?orderId=' + encodeURIComponent(order.id) + '&orderNo=' + encodeURIComponent(order.orderNo || '') + '&tab=records' });
  },

  onTapShipment: function (e) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.shipments[idx];
    if (!item || !item.orderId) return;
    wx.navigateTo({ url: '/pages/factory/shipment-detail/index?orderId=' + encodeURIComponent(item.orderId) + '&orderNo=' + encodeURIComponent(item.orderNo || '') + '&tab=records' });
  },
});
