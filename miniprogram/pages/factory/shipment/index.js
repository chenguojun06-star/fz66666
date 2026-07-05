const api = require('../../../utils/api');
const { toast, safeNavigate } = require('../../../utils/uiHelper');
const { isAdminOrSupervisor } = require('../../../utils/permission');
const { isFactoryOwner } = require('../../../utils/storage');
const { transformOrderData } = require('../utils/orderTransform');
const { buildProcessNodesWithRates, calcOrderProgress } = require('../utils/progressNodes');

const STATUS_MAP = {
  pending: { text: '待收货', cls: 'tag-warning' },
  received: { text: '已收货', cls: 'tag-success' },
};

function receiveStatusText(s) { return s ? ((STATUS_MAP[s] || {}).text || '未知') : ''; }
function receiveStatusCls(s) { return (STATUS_MAP[s] || {}).cls || 'tag-default'; }

function enrichForDashboard(order) {
  const completed = Number(order.completedQuantity) || 0;
  const total = Number(order.cuttingQuantity) || Number(order.cuttingQty) || Number(order.orderQuantity) || Number(order.sizeTotal) || 0;
  order.processNodes = buildProcessNodesWithRates(order);
  order.remainQuantity = Math.max(0, total - completed);
  order.calculatedProgress = calcOrderProgress(order);
  order.expanded = false;
  return order;
}

/* 状态过滤映射（值 = 后端 status 字段；已延期/临近交期用 smart-hints 筛选） */
const STATUS_FILTERS = [
  { key: 'in_production', label: '生产中', value: '' },
  { key: 'completed',     label: '已完成', value: 'completed' },
];

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
    /* 外发工厂汇总统计（对齐 PC 端 FactorySidebar 7-Tag） */
    factoryStats: [],
    factoryStatsTotal: { orderCount: 0, totalQuantity: 0, inProgressCount: 0, completedCount: 0, styleCount: 0, overdueCount: 0, warningCount: 0 },
    selectedFactoryId: '',
    factoryStatsLoading: false,
    /* 状态过滤（与 dashboard 页面对齐） */
    statFilters: STATUS_FILTERS,
    activeFilter: 'in_production',
    statCounts: { in_production: 0, completed: 0 },
    /* 智能提示标签（已延期/临近交期） */
    smartHints: [
      { key: 'overdue', label: '已延期', count: 0, tone: 'danger' },
      { key: 'warning', label: '临近交期', count: 0, tone: 'warning' },
    ],
    hasSmartHints: false,
    smartFilter: '',
  },

  onLoad: function () {
    const factory = isFactoryOwner();
    const admin = isAdminOrSupervisor();
    this.setData({ isFactory: factory, isTenantAdmin: admin, activeTab: 0 });
  },

  onShow: function () {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._resetAndLoad();
  },

  onPullDownRefresh: function () {
    const that = this;
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
    return Promise.all([this._loadOrders(true), this._loadShipments(), this._loadFactoryStats()]);
  },

  /* ======== 外发工厂汇总统计（对齐 PC 端 FactorySidebar 7-Tag） ======== */
  _loadFactoryStats: function () {
    // 工厂账号不加载全局工厂统计
    if (this.data.isFactory) return Promise.resolve();
    const that = this;
    this.setData({ factoryStatsLoading: true });
    return api.production.getExternalFactoryStats().then(function (res) {
      const list = (res && res.data) || res || [];
      const arr = Array.isArray(list) ? list : [];
      // 计算全部工厂汇总
      const total = arr.reduce(function (acc, s) {
        acc.orderCount += Number(s.orderCount) || 0;
        acc.totalQuantity += Number(s.totalQuantity) || 0;
        acc.inProgressCount += Number(s.inProgressCount) || 0;
        acc.completedCount += Number(s.completedCount) || 0;
        acc.styleCount += Number(s.styleCount) || 0;
        acc.overdueCount += Number(s.overdueCount) || 0;
        acc.warningCount += Number(s.warningCount) || 0;
        return acc;
      }, { orderCount: 0, totalQuantity: 0, inProgressCount: 0, completedCount: 0, styleCount: 0, overdueCount: 0, warningCount: 0 });
      that.setData({ factoryStats: arr, factoryStatsTotal: total, factoryStatsLoading: false });
    }).catch(function () {
      that.setData({ factoryStatsLoading: false });
    });
  },

  /* 点击工厂汇总卡片切换筛选 */
  onFactoryStatTap: function (e) {
    const factoryId = e.currentTarget.dataset.factoryId || '';
    const next = this.data.selectedFactoryId === factoryId ? '' : factoryId;
    this.setData({ selectedFactoryId: next });
    this._resetAndLoadOrders();
  },

  _resetAndLoadOrders: function () {
    this.setData({ orderPage: 1, orders: [], orderHasMore: true });
    return this._loadOrders();
  },

  _loadOrders: function (reset) {
    if (this.data.orderLoading && !reset) return Promise.resolve();
    const that = this;
    const page = reset ? 1 : this.data.orderPage;
    const activeKey = this.data.activeFilter;
    const smartFilter = this.data.smartFilter;
    let filterVal = '';
    for (let i = 0; i < STATUS_FILTERS.length; i++) {
      if (STATUS_FILTERS[i].key === activeKey) {
        filterVal = STATUS_FILTERS[i].value;
        break;
      }
    }

    this.setData({ orderLoading: true });
    const params = { page: page, pageSize: smartFilter ? 50 : 20, excludeTerminal: 'true' };
    if (filterVal) params.status = filterVal;
    if (this.data.keyword) params.orderNo = this.data.keyword;
    if (this.data.selectedFactoryId) params.factoryId = this.data.selectedFactoryId;
    return api.production.listOrders(params).then(function (res) {
      const records = (res && res.records) || [];
      const total = (res && res.total) || 0;
      let enriched = records.map(function (r) {
        return enrichForDashboard(transformOrderData(r));
      });
      // smart-filter：已延期/临近交期
      if (smartFilter === 'overdue') {
        enriched = enriched.filter(function (o) { return o.remainDaysClass === 'days-overdue'; });
      } else if (smartFilter === 'warning') {
        enriched = enriched.filter(function (o) { return o.remainDaysClass === 'days-warn' || o.remainDaysClass === 'days-urgent'; });
      }
      const newOrders = reset ? enriched : that.data.orders.concat(enriched);
      that.setData({
        orders: newOrders,
        orderHasMore: newOrders.length < total,
        orderPage: page + 1,
        orderLoading: false,
      });
      if (reset) that._refreshStatCounts();
    }).catch(function (e) {
      that.setData({ orderLoading: false });
      toast('加载失败');
    });
  },

  /* 刷新状态计数和 smart-hints 计数 */
  _refreshStatCounts: function () {
    const that = this;
    const params = {};
    if (that.data.selectedFactoryId) params.factoryId = that.data.selectedFactoryId;
    return api.production.orderStats(params).then(function (stats) {
      const s = stats || {};
      const active = Number(s.activeOrders) || 0;
      const completed = Number(s.completedOrders) || 0;
      const overdueCount = Number(s.overdueOrders) || Number(s.delayedOrders) || 0;
      const warningCount = Number(s.warningOrders) || 0;
      that.setData({
        statCounts: { in_production: active, completed: completed },
        smartHints: [
          { key: 'overdue', label: '已延期', count: overdueCount, tone: 'danger' },
          { key: 'warning', label: '临近交期', count: warningCount, tone: 'warning' },
        ],
        hasSmartHints: overdueCount > 0 || warningCount > 0,
      });
    }).catch(function () {});
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

  /* ===== 状态筛选按钮切换 ===== */
  onStatTap: function (e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeFilter) return;
    this.setData({ activeFilter: key });
    this._loadOrders(true);
  },

  /* ===== smart-hints 小标签点击 ===== */
  onSmartHintTap: function (e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const next = this.data.smartFilter === key ? '' : key;
    this.setData({ smartFilter: next });
    this._loadOrders(true);
  },
  onClearSmartFilter: function () {
    if (!this.data.smartFilter) return;
    this.setData({ smartFilter: '' });
    this._loadOrders(true);
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
      toast.success('已复制');
    }});
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

  onOpenDetail: function (e) {
    const idx = e.currentTarget.dataset.index;
    const order = this.data.orders[idx];
    if (!order) return;
    const params = [];
    if (order.id) params.push('orderId=' + encodeURIComponent(order.id));
    if (order.orderNo) params.push('orderNo=' + encodeURIComponent(order.orderNo));
    safeNavigate({ url: '/pages/dashboard/order-detail/index?' + params.join('&') }).catch(function () {});
  },

  onOpenShip: function (e) {
    const idx = e.currentTarget.dataset.index;
    const order = this.data.orders[idx];
    if (!order) return;
    const that = this;
    this.setData({ showShipModal: true, currentOrder: order, shippableInfo: null, shipDetails: [], shipForm: { shipMethod: 'SELF_DELIVERY', expressCompany: '', trackingNo: '', remark: '' } });
    api.factoryShipment.shippable(order.id).then(function (info) {
      const remaining = (info && info.remaining) || 0;
      that.setData({ shippableInfo: info });
      if (remaining <= 0) { toast('该订单已无可发数量'); return; }
      api.factoryShipment.listByOrder(order.id).then(function (shipments) {
        const shippedMap = {};
        (Array.isArray(shipments) ? shipments : []).forEach(function (s) {
          if (s.details) { s.details.forEach(function (d) { const key = (d.color || '') + '|' + (d.sizeName || ''); shippedMap[key] = (shippedMap[key] || 0) + (d.quantity || 0); }); }
        });
        const orderDetails = order.orderDetails || order.details || [];
        const details = [];
        if (Array.isArray(orderDetails) && orderDetails.length > 0) {
          const seen = {};
          orderDetails.forEach(function (d) {
            const color = String(d.color || d.colour || d.colorName || '').trim();
            const size = String(d.size || d.sizeName || d.spec || '').trim();
            const qty = Number(d.quantity || d.qty || 0) || 0;
            const key = color + '|' + size;
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
    const idx = e.currentTarget.dataset.index;
    const val = parseInt(e.detail.value) || 0;
    const details = this.data.shipDetails;
    details[idx].quantity = Math.max(0, val);
    this.setData({ shipDetails: details });
  },

  onShipMethodChange: function (e) { this.setData({ 'shipForm.shipMethod': e.detail.value }); },
  onShipFieldInput: function (e) { this.setData({ ['shipForm.' + e.currentTarget.dataset.field]: e.detail.value }); },

  onSubmitShip: function () {
    const details = this.data.shipDetails.filter(function (d) { return d.quantity > 0; });
    if (details.length === 0) { toast('请填写发货数量'); return; }
    const totalQty = details.reduce(function (sum, d) { return sum + d.quantity; }, 0);
    const info = this.data.shippableInfo;
    if (info && info.remaining > 0 && totalQty > info.remaining) { toast('超过剩余可发数量(' + info.remaining + ')'); return; }
    const order = this.data.currentOrder;
    if (!order) return;
    const form = this.data.shipForm;
    const payload = {
      orderId: order.id,
      details: details.map(function (d) { return { color: d.color, sizeName: d.sizeName, quantity: d.quantity }; }),
      shipMethod: form.shipMethod, expressCompany: form.expressCompany || '', trackingNo: form.trackingNo || '', remark: form.remark || '',
    };
    const that = this;
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
    const idx = e.currentTarget.dataset.index;
    const item = this.data.shipments[idx];
    if (!item) return;
    const that = this;
    api.factoryShipment.getDetails(item.id).then(function (details) {
      that.setData({ currentShipment: item, detailItems: Array.isArray(details) ? details : [], showDetailModal: true });
    }).catch(function () { toast('加载详情失败'); });
  },

  onCloseDetail: function () { this.setData({ showDetailModal: false, currentShipment: null, detailItems: [] }); },

  onOpenReceiveModal: function () {
    const item = this.data.currentShipment;
    if (!item) return;
    const details = this.data.detailItems.map(function (d) {
      return { color: d.color || '', sizeName: d.sizeName || '', quantity: d.quantity || 0, receivedQuantity: d.quantity || 0 };
    });
    this.setData({ showDetailModal: false, showReceiveModal: true, currentReceiveShipment: item, receiveForm: { receivedDetails: details } });
  },

  onReceiveDetailQtyInput: function (e) {
    const idx = e.currentTarget.dataset.index;
    const val = parseInt(e.detail.value) || 0;
    const details = this.data.receiveForm.receivedDetails;
    details[idx].receivedQuantity = Math.max(0, Math.min(val, details[idx].quantity || 0));
    this.setData({ 'receiveForm.receivedDetails': details });
  },

  onSubmitReceive: function () {
    const item = this.data.currentReceiveShipment;
    if (!item) return;
    const details = this.data.receiveForm.receivedDetails;
    const totalReceived = details.reduce(function (s, d) { return s + (d.receivedQuantity || 0); }, 0);
    if (totalReceived <= 0) { toast('请填写收货数量'); return; }
    const payload = {
      receivedQuantity: totalReceived,
      details: details.map(function (d) { return { color: d.color, sizeName: d.sizeName, quantity: d.receivedQuantity }; }),
    };
    const that = this;
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
    const item = this.data.currentShipment;
    if (!item || item.receiveStatus !== 'pending') { toast('仅待收货状态可删除'); return; }
    const that = this;
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
