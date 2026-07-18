/**
 * 发货管理详情页（独立页面，替代原弹窗）
 * 关键修复：发货明细使用 order.colorGroups 的 sizeMap 展开，
 * 不再依赖列表接口不返回的 order.orderDetails 字段
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { isAdminOrSupervisor } = require('../../../utils/permission');
const { isFactoryOwner } = require('../../../utils/storage');
const { eventBus, Events } = require('../../../utils/eventBus');

var STATUS_MAP = {
  pending: { text: '待收货', cls: 'tag-orange' },
  received: { text: '已收货', cls: 'tag-green' },
};

function receiveStatusText(s) { return (STATUS_MAP[s] || {}).text || s || ''; }
function receiveStatusCls(s) { return (STATUS_MAP[s] || {}).cls || 'tag-gray'; }

Page({
  data: {
    orderId: '',
    orderNo: '',
    order: null,
    isFactory: false,
    isTenantAdmin: false,
    activeTab: 0,
    loading: false,
    // 发货 Tab
    shippableInfo: null,
    shipDetails: [],
    shipForm: { shipMethod: 'SELF_DELIVERY', expressCompany: '', trackingNo: '', remark: '' },
    submitting: false,
    // 发货记录 Tab
    shipmentRecords: [],
    recordsLoading: false,
    expandedRecordId: '',
    // 收货确认 Tab
    pendingShipments: [],
    receiveForms: {},
  },

  onLoad: function (options) {
    var factory = isFactoryOwner();
    var admin = isAdminOrSupervisor();
    var tab = 0;
    if (options && options.tab === 'records') tab = 1;
    else if (options && options.tab === 'receive') tab = 2;
    this.setData({
      orderId: (options && options.orderId) || '',
      orderNo: (options && options.orderNo) || '',
      isFactory: factory,
      isTenantAdmin: admin,
      activeTab: tab,
    });
    this._loadOrderAndInit();
    // 订阅数据变更，发货/收货后刷新
    this._unsubscribe = eventBus.on(Events.DATA_CHANGED, this._onDataChanged.bind(this));
  },

  onUnload: function () {
    if (typeof this._unsubscribe === 'function') this._unsubscribe();
  },

  _onDataChanged: function (data) {
    if (!data || !data.type) return;
    if (data.type === 'factoryShipment') {
      this._loadShippableInfo();
      this._loadShipmentRecords();
    }
  },

  /**
   * 加载订单数据并初始化发货明细
   * 优先从全局缓存 app._pendingShipOrder 读取（由列表页跳转前写入）
   * 缓存缺失时回退到接口按 orderNo 查询
   */
  _loadOrderAndInit: function () {
    var that = this;
    var app = getApp();
    var order = app && app._pendingShipOrder ? app._pendingShipOrder : null;
    if (order) {
      that._initWithOrder(order);
      // 用完即清，避免缓存脏数据
      app._pendingShipOrder = null;
    } else {
      that.setData({ loading: true });
      api.production.listOrders({ orderNo: that.data.orderNo, page: 1, pageSize: 1 }).then(function (res) {
        var records = (res && res.records) || [];
        if (records.length > 0) {
          that._initWithOrder(records[0]);
        } else {
          that.setData({ loading: false });
          toast.error('订单不存在');
        }
      }).catch(function () {
        that.setData({ loading: false });
        toast.error('加载订单失败');
      });
    }
  },

  _initWithOrder: function (rawOrder) {
    var order = rawOrder || {};
    var that = this;
    this.setData({ order: order, loading: false });
    // 用 colorGroups 的 sizeMap 展开成颜色×尺码明细行
    this._buildShipDetails(order, []);
    this._loadShippableInfo();
    this._loadShipmentRecords();
  },

  /**
   * ★ 核心修复：用 order.colorGroups 的 sizeMap 展开发货明细
   * 不依赖 order.orderDetails（列表接口不返回）
   * @param {Object} order - 订单数据
   * @param {Array} shipments - 已有发货记录，用于计算每行已发数量
   */
  _buildShipDetails: function (order, shipments) {
    var colorGroups = order && Array.isArray(order.colorGroups) ? order.colorGroups : [];
    var details = [];
    if (colorGroups.length > 0) {
      colorGroups.forEach(function (g) {
        var sizeMap = (g && g.sizeMap) || {};
        Object.keys(sizeMap).forEach(function (size) {
          details.push({
            color: g.color || '',
            sizeName: size,
            quantity: 0,
            ordered: sizeMap[size] || 0,
            shipped: 0,
          });
        });
      });
    }
    // 计算每行已发数量（从已有发货记录汇总）
    var shippedMap = {};
    (Array.isArray(shipments) ? shipments : []).forEach(function (s) {
      var ds = s && s.details ? s.details : [];
      ds.forEach(function (d) {
        var key = (d.color || '') + '|' + (d.sizeName || '');
        shippedMap[key] = (shippedMap[key] || 0) + (d.quantity || 0);
      });
    });
    details.forEach(function (d) {
      var key = (d.color || '') + '|' + (d.sizeName || '');
      d.shipped = shippedMap[key] || 0;
    });
    this.setData({ shipDetails: details });
  },

  _loadShippableInfo: function () {
    var that = this;
    var orderId = this.data.orderId || (this.data.order && this.data.order.id);
    if (!orderId) return;
    api.factoryShipment.shippable(orderId).then(function (info) {
      that.setData({ shippableInfo: info });
    }).catch(function () {});
  },

  _loadShipmentRecords: function () {
    var that = this;
    var orderId = this.data.orderId || (this.data.order && this.data.order.id);
    if (!orderId) return;
    this.setData({ recordsLoading: true });
    api.factoryShipment.listByOrder(orderId).then(function (shipments) {
      var list = Array.isArray(shipments) ? shipments : [];
      var enriched = list.map(function (s) {
        var copy = Object.assign({}, s);
        copy.statusText = receiveStatusText(s.receiveStatus);
        copy.statusCls = receiveStatusCls(s.receiveStatus);
        copy.totalQuantity = s.totalQuantity || (s.details || []).reduce(function (sum, d) { return sum + (d.quantity || 0); }, 0);
        return copy;
      });
      // 重新计算发货明细的已发数
      if (that.data.order) that._buildShipDetails(that.data.order, list);
      // 收货确认 Tab：待收货列表
      var pending = enriched.filter(function (s) { return s.receiveStatus === 'pending'; });
      var receiveForms = {};
      pending.forEach(function (s) {
        receiveForms[s.id] = (s.details || []).map(function (d) {
          return { color: d.color || '', sizeName: d.sizeName || '', quantity: d.quantity || 0, receivedQuantity: d.quantity || 0 };
        });
      });
      that.setData({ shipmentRecords: enriched, pendingShipments: pending, receiveForms: receiveForms, recordsLoading: false });
    }).catch(function () {
      that.setData({ recordsLoading: false });
    });
  },

  onSwitchTab: function (e) {
    this.setData({ activeTab: Number(e.currentTarget.dataset.tab) });
  },

  onCoverPreview: function (e) {
    var url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  // ===== 发货 Tab =====
  onShipDetailQtyInput: function (e) {
    var idx = e.currentTarget.dataset.index;
    var val = parseInt(e.detail.value, 10) || 0;
    var details = this.data.shipDetails;
    if (!details[idx]) return;
    details[idx].quantity = Math.max(0, val);
    this.setData({ shipDetails: details });
  },

  onShipMethodChange: function (e) {
    this.setData({ 'shipForm.shipMethod': e.detail.value });
  },

  onShipFieldInput: function (e) {
    this.setData({ ['shipForm.' + e.currentTarget.dataset.field]: e.detail.value });
  },

  onSubmitShip: function () {
    if (this.data.submitting) return;
    var details = this.data.shipDetails.filter(function (d) { return d.quantity > 0; });
    if (details.length === 0) { toast.error('请填写发货数量'); return; }
    var totalQty = details.reduce(function (sum, d) { return sum + d.quantity; }, 0);
    var info = this.data.shippableInfo;
    if (info && info.remaining > 0 && totalQty > info.remaining) {
      toast.error('超过剩余可发数量(' + info.remaining + ')');
      return;
    }
    var order = this.data.order;
    if (!order) return;
    var form = this.data.shipForm;
    var payload = {
      orderId: order.id,
      details: details.map(function (d) { return { color: d.color, sizeName: d.sizeName, quantity: d.quantity }; }),
      shipMethod: form.shipMethod,
      expressCompany: form.expressCompany || '',
      trackingNo: form.trackingNo || '',
      remark: form.remark || '',
    };
    var that = this;
    wx.showModal({
      title: '确认发货',
      content: '确认发货 ' + totalQty + ' 件？',
      success: function (res) {
        if (!res.confirm) return;
        that.setData({ submitting: true });
        api.factoryShipment.ship(payload).then(function () {
          toast.success('发货成功');
          eventBus.emit(Events.DATA_CHANGED, { type: 'factoryShipment' });
          that.setData({
            submitting: false,
            shipForm: { shipMethod: 'SELF_DELIVERY', expressCompany: '', trackingNo: '', remark: '' },
          });
          that._loadShippableInfo();
          that._loadShipmentRecords();
        }).catch(function (e) {
          that.setData({ submitting: false });
          toast.error('发货失败: ' + (e.message || e));
        });
      },
    });
  },

  // ===== 发货记录 Tab =====
  onToggleRecord: function (e) {
    var id = e.currentTarget.dataset.id;
    this.setData({ expandedRecordId: this.data.expandedRecordId === id ? '' : id });
  },

  onDeleteShipment: function (e) {
    var id = e.currentTarget.dataset.id;
    var item = this.data.shipmentRecords.filter(function (s) { return String(s.id) === String(id); })[0];
    if (!item || item.receiveStatus !== 'pending') { toast.error('仅待收货状态可删除'); return; }
    var that = this;
    wx.showModal({
      title: '确认删除',
      content: '确认删除该发货记录？',
      success: function (res) {
        if (!res.confirm) return;
        api.factoryShipment.remove(id).then(function () {
          toast.success('删除成功');
          eventBus.emit(Events.DATA_CHANGED, { type: 'factoryShipment' });
          that._loadShippableInfo();
          that._loadShipmentRecords();
        }).catch(function () { toast.error('删除失败'); });
      },
    });
  },

  onGoReceiveTab: function (e) {
    var id = e.currentTarget.dataset.id;
    this.setData({ activeTab: 2, expandedRecordId: id });
  },

  // ===== 收货确认 Tab =====
  onReceiveDetailQtyInput: function (e) {
    var shipmentId = e.currentTarget.dataset.sid;
    var idx = e.currentTarget.dataset.index;
    var val = parseInt(e.detail.value, 10) || 0;
    var forms = this.data.receiveForms;
    var rows = forms[shipmentId];
    if (!rows || !rows[idx]) return;
    rows[idx].receivedQuantity = Math.max(0, Math.min(val, rows[idx].quantity || 0));
    this.setData({ receiveForms: forms });
  },

  onSubmitReceive: function (e) {
    var shipmentId = e.currentTarget.dataset.id;
    var rows = this.data.receiveForms[shipmentId] || [];
    var totalReceived = rows.reduce(function (s, d) { return s + (d.receivedQuantity || 0); }, 0);
    if (totalReceived <= 0) { toast.error('请填写收货数量'); return; }
    var payload = {
      receivedQuantity: totalReceived,
      details: rows.map(function (d) { return { color: d.color, sizeName: d.sizeName, quantity: d.receivedQuantity }; }),
    };
    var that = this;
    wx.showModal({
      title: '确认收货',
      content: '确认收货 ' + totalReceived + ' 件？',
      success: function (res) {
        if (!res.confirm) return;
        api.factoryShipment.receive(shipmentId, payload).then(function () {
          toast.success('收货确认成功');
          eventBus.emit(Events.DATA_CHANGED, { type: 'factoryShipment' });
          that._loadShippableInfo();
          that._loadShipmentRecords();
        }).catch(function (err) {
          toast.error('收货确认失败: ' + (err && err.message ? err.message : ''));
        });
      },
    });
  },
});
