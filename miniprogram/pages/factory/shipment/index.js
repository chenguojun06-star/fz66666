const api = require('../../../utils/api');
const { toast, safeNavigate, scanInPage } = require('../../../utils/uiHelper');
const { isAdminOrSupervisor } = require('../../../utils/permission');
const { isFactoryOwner } = require('../../../utils/storage');
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
  return displayHelper.displayPurchaseStatusText(s);
}

function receiveStatusCls(s) {
  if (!s) return 'tag-gray';
  const color = displayHelper.displayPurchaseStatusColor(s);
  return COLOR_TO_TAG_CLASS[color] || 'tag-gray';
}

function enrichForDashboard(order) {
  const completed = Number(order.completedQuantity) || 0;
  const total = Number(order.cuttingQuantity) || Number(order.cuttingQty) || Number(order.orderQuantity) || Number(order.sizeTotal) || 0;
  order.processNodes = buildProcessNodesWithRates(order);
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
  },

  onLoad: function () {
    const factory = isFactoryOwner();
    const admin = isAdminOrSupervisor();
    this.setData({ isFactory: factory, isTenantAdmin: admin, activeTab: 0 });
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
  },

  onPullDownRefresh: function () {
    this._resetAndLoad().finally(function () { wx.stopPullDownRefresh(); });
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
      if (this.data.keyword) params.keyword = this.data.keyword;
      // 未知工厂(factoryId=0)不传后端(后端无factory_id=0记录)，改由前端筛选 factoryId 为空的订单
      if (this.data.selectedFactoryId != null && this.data.selectedFactoryId !== 0) params.factoryId = this.data.selectedFactoryId;
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
   * 扫码按钮：D-234 直接跳转订单工序领取页
   */
  onScan: function () {
    const that = this;
    scanInPage(function (parsed, raw) {
      if (!parsed) return; // 用户取消
      if (!parsed.success || !parsed.data) {
        toast.error('无法识别：' + (raw || ''));
        return;
      }
      const orderNo = parsed.data.orderNo;
      const styleNo = parsed.data.styleNo;
      const orders = that.data.orders || [];
      const matched = orders.find(function (o) {
        return (orderNo && o.orderNo === orderNo) || (styleNo && o.styleNo === styleNo);
      });
      if (matched && matched.id) {
        safeNavigate({
          url: '/pages/dashboard/process-edit/index?orderId=' + encodeURIComponent(matched.id) + '&orderNo=' + encodeURIComponent(matched.orderNo || '')
        }).catch(function () {});
      } else if (orderNo || styleNo) {
        safeNavigate({
          url: '/pages/dashboard/process-edit/index?orderNo=' + encodeURIComponent(orderNo || styleNo || '')
        }).catch(function () {});
      } else {
        toast.error('未识别到订单号');
      }
    });
  },

  onCardToggle: function (e) {
    const idx = e.currentTarget.dataset.index;
    const path = 'orders[' + idx + '].expanded';
    this.setData({ [path]: !this.data.orders[idx].expanded });
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
