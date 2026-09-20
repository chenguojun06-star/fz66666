/**
 * 物料入库页（独立页面）
 *
 * 背景：手机端物料侧只有「扫码发料/退回」（pages/warehouse/material/scan，
 * 走 materialRoll.scan 改料卷状态），**没有手工入库**。
 * 而 api.material.freeInbound / batchInbound 早就封装好却从未接入页面。
 *
 * 后端契约（MaterialWarehouseOperationOrchestrator.freeInbound）：
 *   - 必填：materialCode、quantity(>0)
 *   - warehouseLocation 缺省有兜底；sourceType 缺省有兜底
 *     ⚠️ 故本页**不主动传 sourceType** —— 避免取值不在后端白名单而被拒
 *   - 可选：warehouseAreaId / supplierName / unitPrice / remark / purchaseOrderId
 *
 * ⚠️ 数量必须支持小数：物料常按米/公斤计（1.32 米）。
 *    后端 quantity 为 BigDecimal，D-414 专门修过 intValue() 截断（1.32→1 少扣库存）。
 */
const api = require('../../../utils/api');

Page({
  data: {
    materialCode: '',
    materialInfo: null,   // scanQuery 返回
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

  onLoad(options) {
    if (options.materialCode) {
      this.setData({ materialCode: options.materialCode }, function () {
        this.queryMaterial();
      }.bind(this));
    }
    wx.setNavigationBarTitle({ title: '物料入库' });
    this.loadAreas();
  },

  onCodeInput(e) {
    this.setData({ materialCode: e.detail.value });
  },

  onScan() {
    var self = this;
    wx.scanCode({
      success: function (res) {
        var code = (res && res.result) || '';
        if (!code) { wx.showToast({ title: '扫码失败', icon: 'none' }); return; }
        self.setData({ materialCode: code }, function () { self.queryMaterial(); });
      },
      fail: function () {},
    });
  },

  onQuery() {
    if (!this.data.materialCode) {
      wx.showToast({ title: '请输入物料编码', icon: 'none' });
      return;
    }
    this.queryMaterial();
  },

  async queryMaterial() {
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

  async loadAreas() {
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

  onPickArea() {
    var self = this;
    if (!this.data.areaNames.length) {
      wx.showToast({ title: '暂无可选仓库区域', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: this.data.areaNames,
      success: function (r) {
        var opt = self.data.areaOptions[r.tapIndex];
        if (opt) self.setData({ warehouseAreaId: opt.id, warehouseAreaName: opt.name });
      },
      fail: function () {},
    });
  },

  onQtyInput(e) {
    // 允许小数：不做 parseInt
    this.setData({ quantity: e.detail.value });
  },
  onLocationInput(e) { this.setData({ warehouseLocation: e.detail.value }); },
  onSupplierInput(e) { this.setData({ supplierName: e.detail.value }); },
  onPriceInput(e) { this.setData({ unitPrice: e.detail.value }); },
  onRemarkInput(e) { this.setData({ remark: e.detail.value }); },

  async onSubmit() {
    if (this.data.submitting) return;
    var code = String(this.data.materialCode || '').trim();
    if (!code) {
      wx.showToast({ title: '物料编码不能为空', icon: 'none' });
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
      var self = this;
      setTimeout(function () {
        var pages = getCurrentPages();
        var prev = pages[pages.length - 2];
        if (prev && typeof prev.loadData === 'function') prev.loadData();
        wx.navigateBack();
      }, 800);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '入库失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
