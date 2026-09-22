/**
 * 物料出库表单（通用组件）
 *
 * 为什么要抽成组件（D-514）：
 *   同一张表单有两个消费方 —— ① 独立页 pages/warehouse/material-outbound
 *   ② 物料中心 pages/warehouse/material-center 的「出库」tab（内联）。
 *   抽成组件后两边共用一份逻辑，避免"重复造轮子"。
 *
 * 后端契约（MaterialStockOrchestrator.manualOutbound）—— 7 个必填：
 *   stockId / quantity(>0) / receiverName(领取人) / orderNo(关联订单) /
 *   styleNo(关联款号) / factoryName(关联工厂) / usageType(用料场景)
 * 可选：reason / pickupType / factoryId / factoryType / warehouseAreaId
 *
 * ⚠️ 数量用 parseFloat：物料按米/公斤计，后端 BigDecimal（D-414 修过 1.32→1 截断）
 *
 * 事件：
 *   bind:success → 提交成功，detail = { materialCode, quantity }
 */
const api = require('../../utils/api');

/**
 * ⚠️ key 必须用**后端存储约定值**，不能用 PC 端列表的筛选值。
 * 后端 MaterialInboundOrchestrator.resolveUsageType 生成的是 STOCK / SAMPLE / BULK；
 * PC 端 MaterialTable 提交的也是 "BULK"。
 * 而 PC 端 MaterialPicking 下拉里的 production / sample **只是列表筛选值**，不是存储值
 * —— 我最初照抄了筛选值，导致出库记录的 usageType 与既有数据对不上（报表按值过滤会漏）。
 */
const USAGE_TYPES = [
  { key: 'BULK', label: '生产领料' },
  { key: 'SAMPLE', label: '样品领料' },
  { key: 'STOCK', label: '备货领料' },
];

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    /** 预填物料编码（从物料库存 / 物料中心卡片点「出库」时携带） */
    materialCode: {
      type: String,
      value: '',
      observer: function (val) {
        if (!this._attached) return;
        this._applyCode(val);
      },
    },
    showScan: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    materialCode: '',
    materialInfo: null,
    stockId: '',
    queried: false,
    loading: false,
    submitting: false,

    quantity: '',
    unit: '',

    // 关联订单 / 款号
    orderOptions: [],
    orderNames: [],
    orderNo: '',
    styleNo: '',

    // 关联工厂
    factoryOptions: [],
    factoryNames: [],
    factoryId: '',
    factoryName: '',

    // 领料人
    receiverOptions: [],
    receiverNames: [],
    receiverId: '',
    receiverName: '',

    usageType: 'BULK',
    usageTypeLabel: '生产领料',
    typeOptions: USAGE_TYPES,

    areaOptions: [],
    areaNames: [],
    warehouseAreaId: '',
    warehouseAreaName: '',

    reason: '',
  },

  lifetimes: {
    attached: function () {
      this._lastCode = '';
      this.loadOrders();
      this.loadFactories();
      this.loadReceivers();
      this.loadAreas();
      var code = this.properties.materialCode;
      if (code) this._applyCode(code);
      this._attached = true;
    },
  },

  methods: {
    /** 统一入口：设置编码并查询（带去重） */
    _applyCode: function (code) {
      if (!code || code === this._lastCode) return;
      this._lastCode = code;
      this.setData({ materialCode: code }, function () {
        this.queryMaterial();
      }.bind(this));
    },

    // ────────── 物料查询 ──────────

    onCodeInput: function (e) { this.setData({ materialCode: e.detail.value }); },

    onScan: function () {
      var self = this;
      wx.scanCode({
        success: function (res) {
          var code = (res && res.result) || '';
          if (!code) { wx.showToast({ title: '扫码失败', icon: 'none' }); return; }
          self._lastCode = '';
          self._applyCode(code);
        },
        fail: function () {},
      });
    },

    onQuery: function () {
      if (!this.data.materialCode) {
        wx.showToast({ title: '请输入物料编码', icon: 'none' });
        return;
      }
      this.queryMaterial();
    },

    queryMaterial: async function () {
      this.setData({ loading: true });
      try {
        var res = await api.material.scanQuery(this.data.materialCode);
        var info = res && res.data ? res.data : res;
        if (!info || info.found === false) {
          this.setData({ queried: true, loading: false, materialInfo: null, stockId: '' });
          wx.showToast({ title: (info && info.message) || '物料不存在', icon: 'none' });
          return;
        }
        this.setData({
          materialInfo: info,
          stockId: String(info.stockId || ''),
          unit: info.unit || '',
          queried: true,
          loading: false,
        });
      } catch (e) {
        this.setData({ queried: true, loading: false, materialInfo: null, stockId: '' });
        wx.showToast({ title: (e && e.message) || '查询失败', icon: 'none' });
      }
    },

    // ────────── 下拉数据 ──────────

    loadOrders: async function () {
      try {
        var res = await api.production.listOrders({ page: 1, pageSize: 100 });
        var list = Array.isArray(res) ? res : (res && (res.records || res.list || res.items)) || [];
        var options = list.map(function (o) {
          return {
            orderNo: String(o.orderNo || o.order_no || ''),
            styleNo: String(o.styleNo || o.style_no || ''),
            name: String(o.orderNo || o.order_no || '-'),
          };
        }).filter(function (o) { return !!o.orderNo; });
        this.setData({
          orderOptions: options,
          orderNames: options.map(function (o) { return o.name; }),
        });
      } catch (e) {
        console.warn('[物料出库] 加载订单失败', e);
      }
    },

    loadFactories: async function () {
      try {
        var res = await api.factory.list({ page: 1, pageSize: 100 });
        var list = Array.isArray(res) ? res : (res && (res.records || res.list || res.items)) || [];
        var options = list.map(function (f) {
          return {
            id: String(f.id || ''),
            name: f.factoryName || f.name || '-',
            type: (f.factoryType || f.type || 'INTERNAL').toUpperCase(),
          };
        }).filter(function (f) { return !!f.name && f.name !== '-'; });
        this.setData({
          factoryOptions: options,
          factoryNames: options.map(function (o) { return o.name; }),
        });
      } catch (e) {
        console.warn('[物料出库] 加载工厂失败', e);
      }
    },

    loadReceivers: async function () {
      try {
        var res = await api.system.listUsers({ page: 1, pageSize: 100 });
        var list = Array.isArray(res) ? res : (res && (res.records || res.list || res.items)) || [];
        var options = list.map(function (u) {
          return {
            id: String(u.id || u.userId || ''),
            name: u.realName || u.name || u.username || u.nickname || '-',
          };
        }).filter(function (u) { return !!u.name && u.name !== '-'; });
        this.setData({
          receiverOptions: options,
          receiverNames: options.map(function (o) { return o.name; }),
        });
      } catch (e) {
        console.warn('[物料出库] 加载领料人失败', e);
      }
    },

    loadAreas: async function () {
      try {
        var res = await api.warehouse.listWarehouseAreas('MATERIAL');
        var list = Array.isArray(res) ? res : (res && (res.records || res.list || res.items)) || [];
        var options = list.map(function (a) {
          return { id: String(a.id || ''), name: a.areaName || a.name || '-' };
        });
        this.setData({
          areaOptions: options,
          areaNames: options.map(function (o) { return o.name; }),
        });
      } catch (e) {
        console.warn('[物料出库] 加载仓库区域失败', e);
      }
    },

    // ────────── 各项选择 ──────────

    /**
     * ⚠️ 统一用 <picker mode="selector"> 而非 wx.showActionSheet：
     * 后者 itemList **最多 6 项**，而订单/工厂/领料人可能上百条，必然失败。
     * picker 的 bindchange 回传 e.detail.value 为下标。
     */
    onOrderChange: function (e) {
      var o = this.data.orderOptions[e.detail.value];
      if (o) this.setData({ orderNo: o.orderNo, styleNo: o.styleNo || this.data.styleNo });
    },

    onFactoryChange: function (e) {
      var f = this.data.factoryOptions[e.detail.value];
      if (f) this.setData({ factoryId: f.id, factoryName: f.name, factoryType: f.type });
    },

    onReceiverChange: function (e) {
      var u = this.data.receiverOptions[e.detail.value];
      if (u) this.setData({ receiverId: u.id, receiverName: u.name });
    },

    onAreaChange: function (e) {
      var a = this.data.areaOptions[e.detail.value];
      if (a) this.setData({ warehouseAreaId: a.id, warehouseAreaName: a.name });
    },

    onSelectUsage: function (e) {
      var key = e.currentTarget.dataset.key;
      for (var i = 0; i < USAGE_TYPES.length; i++) {
        if (USAGE_TYPES[i].key === key) {
          this.setData({ usageType: key, usageTypeLabel: USAGE_TYPES[i].label });
          return;
        }
      }
    },

    onQtyInput: function (e) { this.setData({ quantity: e.detail.value }); },

    // D-513：手机端步进器（避免小屏手动输入数字）
    onQtyMinus: function () {
      var q = parseFloat(this.data.quantity) || 0;
      var next = +(q - 1).toFixed(2);
      this.setData({ quantity: next > 0 ? String(next) : '' });
    },

    onQtyPlus: function () {
      var q = parseFloat(this.data.quantity) || 0;
      this.setData({ quantity: String(+(q + 1).toFixed(2)) });
    },

    onReasonInput: function (e) { this.setData({ reason: e.detail.value }); },

    // ────────── 提交 ──────────

    onSubmit: async function () {
      if (this.data.submitting) return;
      var d = this.data;
      // 逐项按后端必填校验，给出明确提示（避免只报一个笼统错误）
      if (!d.stockId) { wx.showToast({ title: '请先查询物料', icon: 'none' }); return; }
      var qty = parseFloat(d.quantity);
      if (isNaN(qty) || qty <= 0) { wx.showToast({ title: '出库数量必须大于0', icon: 'none' }); return; }
      if (!d.receiverName) { wx.showToast({ title: '请选择领料人', icon: 'none' }); return; }
      if (!d.orderNo) { wx.showToast({ title: '请选择关联订单', icon: 'none' }); return; }
      if (!d.styleNo) { wx.showToast({ title: '缺少关联款号', icon: 'none' }); return; }
      if (!d.factoryName) { wx.showToast({ title: '请选择关联工厂', icon: 'none' }); return; }
      if (!d.usageType) { wx.showToast({ title: '请选择用料场景', icon: 'none' }); return; }

      this.setData({ submitting: true });
      try {
        await api.material.manualOutbound({
          stockId: d.stockId,
          quantity: qty,
          receiverId: d.receiverId,
          receiverName: d.receiverName,
          orderNo: d.orderNo,
          styleNo: d.styleNo,
          factoryId: d.factoryId,
          factoryName: d.factoryName,
          factoryType: d.factoryType || 'INTERNAL',
          usageType: d.usageType,
          warehouseAreaId: d.warehouseAreaId,
          reason: d.reason,
        });
        wx.showToast({ title: '出库成功', icon: 'success' });
        this.triggerEvent('success', { materialCode: d.materialCode, quantity: qty });
        this.setData({ submitting: false });
      } catch (e) {
        wx.showToast({ title: (e && e.message) || '出库失败', icon: 'none' });
        this.setData({ submitting: false });
      }
    },
  },
});
