/**
 * 物料入库表单（通用组件）
 *
 * 为什么要抽成组件（D-514）：
 *   同一张表单有两个消费方 —— ① 独立页 pages/warehouse/material-inbound
 *   ② 物料中心 pages/warehouse/material-center 的「入库」tab（内联）。
 *   抽成组件后两边共用一份逻辑，避免"重复造轮子"（用户明确要求过不要重复造）。
 *
 * 后端契约（MaterialWarehouseOperationOrchestrator.freeInbound）：
 *   - 必填：materialCode、quantity(>0)
 *   - warehouseLocation 缺省有兜底；sourceType 缺省有兜底
 *     ⚠️ 故本组件**不主动传 sourceType** —— 避免取值不在后端白名单而被拒
 *   - 可选：warehouseAreaId / supplierName / unitPrice / remark / purchaseOrderId
 *
 * ⚠️ 数量必须支持小数：物料常按米/公斤计（1.32 米）。
 *    后端 quantity 为 BigDecimal，D-414 专门修过 intValue() 截断（1.32→1 少扣库存）。
 *
 * 事件：
 *   bind:success  → 提交成功，detail = { materialCode, quantity }
 *                   （跳转/刷新由父级决定：独立页 navigateBack，tab 内刷新列表）
 */
const api = require('../../utils/api');

Component({
  options: {
    // 允许父级通过 class 覆盖样式（与项目其它组件一致）
    addGlobalClass: true,
  },

  properties: {
    /** 预填物料编码（从物料库存 / 物料中心卡片点「入库」时携带） */
    materialCode: {
      type: String,
      value: '',
      observer: function (val) {
        // attached 之前 observer 会先触发一次，交给 attached 统一处理，避免重复查询
        if (!this._attached) return;
        this._applyCode(val);
      },
    },
    /** 是否显示扫码按钮 */
    showScan: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    materialCode: '',
    materialInfo: null,
    queried: false,
    loading: false,
    submitting: false,

    quantity: '',
    unit: '',

    areaOptions: [],
    areaNames: [],
    warehouseAreaId: '',
    warehouseAreaName: '',
    warehouseLocation: '',

    supplierName: '',
    unitPrice: '',
    remark: '',
  },

  lifetimes: {
    attached: function () {
      this._lastCode = '';
      this.loadAreas();
      var code = this.properties.materialCode;
      if (code) this._applyCode(code);
      this._attached = true;
    },
  },

  methods: {
    /** 统一入口：设置编码并查询（带去重，避免同一编码重复请求） */
    _applyCode: function (code) {
      if (!code || code === this._lastCode) return;
      this._lastCode = code;
      this.setData({ materialCode: code }, function () {
        this.queryMaterial();
      }.bind(this));
    },

    onCodeInput: function (e) {
      this.setData({ materialCode: e.detail.value });
    },

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
        // res 可能直接是对象，也可能包一层
        var info = res && res.data ? res.data : res;
        this.setData({
          materialInfo: info || null,
          unit: (info && (info.unit || info.materialUnit)) || '',
          queried: true,
          loading: false,
        });
      } catch (e) {
        this.setData({ queried: true, loading: false, materialInfo: null });
        wx.showToast({ title: (e && e.message) || '查询失败', icon: 'none' });
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
        console.warn('[物料入库] 加载仓库区域失败', e);
      }
    },

    /**
     * ⚠️ 用 <picker mode="selector"> 而非 wx.showActionSheet ——
     * 后者 itemList 最多 6 项，仓库区域可能超过，会直接失败。
     */
    onAreaChange: function (e) {
      var opt = this.data.areaOptions[e.detail.value];
      if (opt) this.setData({ warehouseAreaId: opt.id, warehouseAreaName: opt.name });
    },

    onQtyInput: function (e) {
      // 允许小数：不做 parseInt
      this.setData({ quantity: e.detail.value });
    },

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

    onLocationInput: function (e) { this.setData({ warehouseLocation: e.detail.value }); },
    onSupplierInput: function (e) { this.setData({ supplierName: e.detail.value }); },
    onPriceInput: function (e) { this.setData({ unitPrice: e.detail.value }); },
    onRemarkInput: function (e) { this.setData({ remark: e.detail.value }); },

    onSubmit: async function () {
      if (this.data.submitting) return;
      var code = String(this.data.materialCode || '').trim();
      if (!code) {
        wx.showToast({ title: '物料编码不能为空', icon: 'none' });
        return;
      }
      // D-499：没有库存记录时后端会抛「物料库存记录不存在」（除非传 autoCreateStock=true
      // 并补 materialName/color/size）。这里直接拦住，避免用户填完才报错。
      if (!this.data.materialInfo) {
        wx.showToast({ title: '请先查询到物料库存记录', icon: 'none' });
        return;
      }
      // ⚠️ 用 parseFloat 而非 parseInt：物料数量支持小数（如 1.32 米）
      var qty = parseFloat(this.data.quantity);
      if (isNaN(qty) || qty <= 0) {
        wx.showToast({ title: '入库数量必须大于0', icon: 'none' });
        return;
      }

      this.setData({ submitting: true });
      try {
        await api.material.freeInbound({
          materialCode: code,
          quantity: qty,
          warehouseLocation: this.data.warehouseLocation || '',
          warehouseAreaId: this.data.warehouseAreaId || '',
          supplierName: this.data.supplierName || '',
          unitPrice: this.data.unitPrice || '',
          remark: this.data.remark || '',
        });
        wx.showToast({ title: '入库成功', icon: 'success' });
        // 交给父级决定后续（独立页返回上一页；tab 内刷新库存列表）
        this.triggerEvent('success', { materialCode: code, quantity: qty });
        this.setData({ submitting: false });
      } catch (e) {
        wx.showToast({ title: (e && e.message) || '入库失败', icon: 'none' });
        this.setData({ submitting: false });
      }
    },
  },
});
