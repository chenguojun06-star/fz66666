const api = require('../../../utils/api');
const { toast, safeNavigate, quickScan } = require('../../../utils/uiHelper');
const { isAdminOrSupervisor } = require('../../../utils/permission');
const { isFactoryOwner } = require('../../../utils/storage');
const { transformOrderData } = require('../utils/orderTransform');
const { buildProcessNodesWithRates, calcOrderProgress } = require('../utils/progressNodes');

const STATUS_MAP = {
  pending: { text: '待收货', cls: 'tag-orange' },
  received: { text: '已收货', cls: 'tag-green' },
};

function receiveStatusText(s) { return (STATUS_MAP[s] || {}).text || s || ''; }
function receiveStatusCls(s) { return (STATUS_MAP[s] || {}).cls || 'tag-gray'; }

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
  order.expanded = false;
  return order;
}

Page({
  data: {
    activeTab: 0,
    isFactory: false,
    isTenantAdmin: false,
    activeFilter: 'production',
    filterStats: { production: 0, completed: 0, overdue: 0, warning: 0 },
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
      if (this.data.keyword) params.keyword = this.data.keyword;
      if (this.data.selectedFactoryId != null) params.factoryId = this.data.selectedFactoryId;
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
        toast('加载失败');
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
    var filtered;
    if (filter === 'completed') {
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
  onScan: function () {
    quickScan();
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
    if (!orderNo) return;
    wx.setClipboardData({ data: orderNo, success: function () {
      wx.showToast({ title: '已复制', icon: 'success', duration: 1000 });
    }});
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
