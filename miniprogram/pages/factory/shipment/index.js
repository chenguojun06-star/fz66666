var api = require('../../../utils/api');
var { toast } = require('../../../utils/uiHelper');
var { isAdminOrSupervisor } = require('../../../utils/permission');
var { isFactoryOwner } = require('../../../utils/storage');
var { transformOrderData } = require('../../../utils/order/orderTransform');
var { buildProcessNodesWithRates, calcOrderProgress } = require('../../../utils/order/progressNodes');

var STATUS_MAP = {
  pending: { text: '待收货', cls: 'tag-orange' },
  received: { text: '已收货', cls: 'tag-green' },
};

function receiveStatusText(s) { return (STATUS_MAP[s] || {}).text || s || ''; }
function receiveStatusCls(s) { return (STATUS_MAP[s] || {}).cls || 'tag-gray'; }

function enrichForDashboard(order) {
  var completed = Number(order.completedQuantity) || 0;
  var total = Number(order.cuttingQuantity) || Number(order.cuttingQty) || Number(order.orderQuantity) || Number(order.sizeTotal) || 0;
  order.processNodes = buildProcessNodesWithRates(order);
  order.remainQuantity = Math.max(0, total - completed);
  order.calculatedProgress = calcOrderProgress(order);
  order.expanded = false;
  return order;
}

Page({
  data: {
    activeTab: 0,
    isFactory: false,
    isTenantAdmin: false,
    orders: [],
    orderLoading: false,
    orderPage: 1,
    orderHasMore: true,
    keyword: '',
    shipments: [],
    shipmentLoading: false,
    shipmentPage: 1,
    shipmentHasMore: true,
    showShipModal: false,
    currentOrder: null,
    shippableInfo: null,
    shipDetails: [],
    shipForm: { shipMethod: 'SELF_DELIVERY', expressCompany: '', trackingNo: '', remark: '' },
    showDetailModal: false,
    currentShipment: null,
    detailItems: [],
    showReceiveModal: false,
    receiveForm: { receivedDetails: [] },
    currentReceiveShipment: null,
  },

  onLoad: function () {
    var factory = isFactoryOwner();
    var admin = isAdminOrSupervisor();
    this.setData({ isFactory: factory, isTenantAdmin: admin, activeTab: 0 });
  },

  onShow: function () {
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._resetAndLoad();
  },

  onPullDownRefresh: function () {
    var that = this;
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
    this.setData({
      orderPage: 1, orders: [], orderHasMore: true,
      shipmentPage: 1, shipments: [], shipmentHasMore: true,
    });
    return Promise.all([this._loadOrders(), this._loadShipments()]);
  },

  _loadOrders: function () {
    if (this.data.orderLoading) return Promise.resolve();
    var that = this;
    this.setData({ orderLoading: true });
    var params = { page: this.data.orderPage, pageSize: 20, excludeTerminal: 'true' };
    if (this.data.keyword) params.orderNo = this.data.keyword;
    return api.production.listOrders(params).then(function (res) {
      var records = (res && res.records) || [];
      var total = (res && res.total) || 0;
      var enriched = records.map(function (r) {
        return enrichForDashboard(transformOrderData(r));
      });
      that.setData({
        orders: that.data.orders.concat(enriched),
        orderHasMore: that.data.orders.length + enriched.length < total,
        orderPage: that.data.orderPage + 1,
        orderLoading: false,
      });
    }).catch(function (e) {
      that.setData({ orderLoading: false });
      toast('加载失败');
    });
  },

  _loadShipments: function () {
    if (this.data.shipmentLoading) return Promise.resolve();
    var that = this;
    this.setData({ shipmentLoading: true });
    var params = { page: this.data.shipmentPage, pageSize: 20 };
    return api.factoryShipment.list(params).then(function (res) {
      var records = (res && res.records) || [];
      var total = (res && res.total) || 0;
      var enriched = records.map(function (r) {
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

  onCardToggle: function (e) {
    var idx = e.currentTarget.dataset.index;
    var path = 'orders[' + idx + '].expanded';
    this.setData({ [path]: !this.data.orders[idx].expanded });
  },

  onCoverPreview: function (e) {
    var url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  onCopyOrderNo: function (e) {
    var orderNo = e.currentTarget.dataset.orderNo;
    if (!orderNo) return;
    wx.setClipboardData({ data: orderNo, success: function () {
      wx.showToast({ title: '已复制', icon: 'success', duration: 1000 });
    }});
  },

  onGoOrderProcurement: function (e) {
    var idx = e.currentTarget.dataset.index;
    var order = this.data.orders[idx];
    if (!order) return;
    wx.navigateTo({ url: '/pages/procurement/task-detail/index?orderNo=' + encodeURIComponent(order.orderNo || '') + '&styleNo=' + encodeURIComponent(order.styleNo || '') });
  },

  onGoOrderCutting: function (e) {
    var idx = e.currentTarget.dataset.index;
    var order = this.data.orders[idx];
    if (!order) return;
    wx.navigateTo({ url: '/pages/cutting/bundle-detail/index?orderId=' + encodeURIComponent(order.id) + '&orderNo=' + encodeURIComponent(order.orderNo || '') });
  },

  onGoOrderProcessEdit: function (e) {
    var idx = e.currentTarget.dataset.index;
    var order = this.data.orders[idx];
    if (!order) return;
    wx.navigateTo({ url: '/pages/dashboard/process-edit/index?orderId=' + encodeURIComponent(order.id) + '&orderNo=' + encodeURIComponent(order.orderNo || '') });
  },

  onOpenShip: function (e) {
    var idx = e.currentTarget.dataset.index;
    var order = this.data.orders[idx];
    if (!order) return;
    var that = this;
    this.setData({ showShipModal: true, currentOrder: order, shippableInfo: null, shipDetails: [], shipForm: { shipMethod: 'SELF_DELIVERY', expressCompany: '', trackingNo: '', remark: '' } });
    api.factoryShipment.shippable(order.id).then(function (info) {
      var remaining = (info && info.remaining) || 0;
      that.setData({ shippableInfo: info });
      if (remaining <= 0) { toast('该订单已无可发数量'); return; }
      api.factoryShipment.listByOrder(order.id).then(function (shipments) {
        var shippedMap = {};
        (Array.isArray(shipments) ? shipments : []).forEach(function (s) {
          if (s.details) { s.details.forEach(function (d) { var key = (d.color || '') + '|' + (d.sizeName || ''); shippedMap[key] = (shippedMap[key] || 0) + (d.quantity || 0); }); }
        });
        var orderDetails = order.orderDetails || order.details || [];
        var details = [];
        if (Array.isArray(orderDetails) && orderDetails.length > 0) {
          var seen = {};
          orderDetails.forEach(function (d) {
            var color = String(d.color || d.colour || d.colorName || '').trim();
            var size = String(d.size || d.sizeName || d.spec || '').trim();
            var qty = Number(d.quantity || d.qty || 0) || 0;
            var key = color + '|' + size;
            if (!seen[key]) { seen[key] = true; details.push({ color: color, sizeName: size, quantity: 0, ordered: qty, shipped: shippedMap[key] || 0 }); }
          });
        } else {
          details.push({ color: '', sizeName: '', quantity: 0, ordered: 0, shipped: 0 });
        }
        that.setData({ shipDetails: details });
      }).catch(function () {});
    }).catch(function (e) { toast('获取可发信息失败'); });
  },

  onShipDetailQtyInput: function (e) {
    var idx = e.currentTarget.dataset.index;
    var val = parseInt(e.detail.value) || 0;
    var details = this.data.shipDetails;
    details[idx].quantity = Math.max(0, val);
    this.setData({ shipDetails: details });
  },

  onShipMethodChange: function (e) { this.setData({ 'shipForm.shipMethod': e.detail.value }); },
  onShipFieldInput: function (e) { this.setData({ ['shipForm.' + e.currentTarget.dataset.field]: e.detail.value }); },

  onSubmitShip: function () {
    var details = this.data.shipDetails.filter(function (d) { return d.quantity > 0; });
    if (details.length === 0) { toast('请填写发货数量'); return; }
    var totalQty = details.reduce(function (sum, d) { return sum + d.quantity; }, 0);
    var info = this.data.shippableInfo;
    if (info && info.remaining > 0 && totalQty > info.remaining) { toast('超过剩余可发数量(' + info.remaining + ')'); return; }
    var order = this.data.currentOrder;
    if (!order) return;
    var form = this.data.shipForm;
    var payload = {
      orderId: order.id,
      details: details.map(function (d) { return { color: d.color, sizeName: d.sizeName, quantity: d.quantity }; }),
      shipMethod: form.shipMethod, expressCompany: form.expressCompany || '', trackingNo: form.trackingNo || '', remark: form.remark || '',
    };
    var that = this;
    wx.showModal({ title: '确认发货', content: '确认发货 ' + totalQty + ' 件？', success: function (res) {
      if (!res.confirm) return;
      api.factoryShipment.ship(payload).then(function () {
        toast('发货成功');
        that.setData({ showShipModal: false, currentOrder: null, shippableInfo: null, shipDetails: [] });
        that._resetAndLoad();
      }).catch(function (e) { toast('发货失败: ' + (e.message || e)); });
    }});
  },

  onCancelShip: function () { this.setData({ showShipModal: false, currentOrder: null, shippableInfo: null, shipDetails: [] }); },

  onTapShipment: function (e) {
    var idx = e.currentTarget.dataset.index;
    var item = this.data.shipments[idx];
    if (!item) return;
    var that = this;
    api.factoryShipment.getDetails(item.id).then(function (details) {
      that.setData({ currentShipment: item, detailItems: Array.isArray(details) ? details : [], showDetailModal: true });
    }).catch(function () { toast('加载详情失败'); });
  },

  onCloseDetail: function () { this.setData({ showDetailModal: false, currentShipment: null, detailItems: [] }); },

  onOpenReceiveModal: function () {
    var item = this.data.currentShipment;
    if (!item) return;
    var details = this.data.detailItems.map(function (d) {
      return { color: d.color || '', sizeName: d.sizeName || '', quantity: d.quantity || 0, receivedQuantity: d.quantity || 0 };
    });
    this.setData({ showDetailModal: false, showReceiveModal: true, currentReceiveShipment: item, receiveForm: { receivedDetails: details } });
  },

  onReceiveDetailQtyInput: function (e) {
    var idx = e.currentTarget.dataset.index;
    var val = parseInt(e.detail.value) || 0;
    var details = this.data.receiveForm.receivedDetails;
    details[idx].receivedQuantity = Math.max(0, Math.min(val, details[idx].quantity || 0));
    this.setData({ 'receiveForm.receivedDetails': details });
  },

  onSubmitReceive: function () {
    var item = this.data.currentReceiveShipment;
    if (!item) return;
    var details = this.data.receiveForm.receivedDetails;
    var totalReceived = details.reduce(function (s, d) { return s + (d.receivedQuantity || 0); }, 0);
    if (totalReceived <= 0) { toast('请填写收货数量'); return; }
    var payload = {
      receivedQuantity: totalReceived,
      details: details.map(function (d) { return { color: d.color, sizeName: d.sizeName, quantity: d.receivedQuantity }; }),
    };
    var that = this;
    wx.showModal({ title: '确认收货', content: '确认收货 ' + totalReceived + ' 件？', success: function (res) {
      if (!res.confirm) return;
      api.factoryShipment.receive(item.id, payload).then(function () {
        toast('收货确认成功');
        that.setData({ showReceiveModal: false, currentReceiveShipment: null });
        that._resetAndLoad();
      }).catch(function (e) { toast('收货确认失败'); });
    }});
  },

  onCancelReceive: function () { this.setData({ showReceiveModal: false, currentReceiveShipment: null }); },

  onDeleteShipment: function () {
    var item = this.data.currentShipment;
    if (!item || item.receiveStatus !== 'pending') { toast('仅待收货状态可删除'); return; }
    var that = this;
    wx.showModal({ title: '确认删除', content: '确认删除该发货记录？', success: function (res) {
      if (!res.confirm) return;
      api.factoryShipment.remove(item.id).then(function () {
        toast('删除成功');
        that.setData({ showDetailModal: false, currentShipment: null });
        that._resetAndLoad();
      }).catch(function (e) { toast('删除失败'); });
    }});
  },
});
