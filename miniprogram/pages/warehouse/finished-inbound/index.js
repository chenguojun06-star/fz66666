/**
 * 成品入库页（独立页面）
 *
 * 背景：手机端此前**完全没有入库入口**，现场只能回 PC 端操作。
 * 用户要求：不要弹窗，做成页面（弹窗面积小、手机上不好操作）。
 *
 * 后端对齐（FinishedWarehouseOperationOrchestrator）：
 *   - freeInbound 必填：skuCode、quantity(>0)
 *     warehouseLocation 缺省「默认仓」；sourceType 缺省 free_inbound
 *   - VALID_SOURCE_TYPES：external_purchase / free_inbound / transfer_in /
 *                         return_in / other_in / scan_inbound
 *   - batchInbound：{ items, warehouseLocation, warehouseAreaId, sourceType }
 *     内部逐条调 freeInbound，共用同一 batchNo/traceId
 */
const api = require('../../../utils/api');

const SOURCE_TYPES = [
  { key: 'free_inbound', label: '自由入库' },
  { key: 'external_purchase', label: '外购入库' },
  { key: 'transfer_in', label: '调拨入库' },
  { key: 'return_in', label: '退货入库' },
  { key: 'other_in', label: '其他入库' },
];

Page({
  data: {
    // ── 查询条件 ──
    styleNo: '',
    styleName: '',
    queried: false,

    loading: false,
    submitting: false,

    // ── SKU 明细 ──
    skuList: [],
    selected: {},        // { [skuId]: 数量 }
    selectedCount: 0,
    selectedQty: 0,
    allSelected: false,

    // ── 入库来源类型 ──
    typeOptions: SOURCE_TYPES,
    sourceType: 'free_inbound',
    sourceTypeLabel: '自由入库',

    // ── 仓库 ──
    areaOptions: [],
    areaNames: [],
    warehouseAreaId: '',
    warehouseAreaName: '',
    warehouseLocation: '默认仓',

    supplierName: '',
    remark: '',
  },

  onLoad(options) {
    this.setData({
      styleNo: options.styleNo || '',
      styleName: decodeURIComponent(options.styleName || ''),
    });
    wx.setNavigationBarTitle({ title: '成品入库' });
    this.loadAreas();
    if (this.data.styleNo) this.querySkus();
  },

  // ────────── 查询 ──────────

  onStyleNoInput(e) {
    this.setData({ styleNo: e.detail.value });
  },

  onQuery() {
    if (!this.data.styleNo) {
      wx.showToast({ title: '请输入款号', icon: 'none' });
      return;
    }
    this.querySkus();
  },

  /** 扫码识别款号（二维码内容为款号或扫码串，取款号段） */
  onScan() {
    var self = this;
    wx.scanCode({
      success: function (res) {
        var raw = (res && res.result) || '';
        // 扫码串可能是「款号-颜色-尺码-序号」，款号是第一段
        var styleNo = String(raw).split('-')[0];
        if (!styleNo) {
          wx.showToast({ title: '无法识别款号', icon: 'none' });
          return;
        }
        self.setData({ styleNo: styleNo }, function () { self.querySkus(); });
      },
      fail: function () {},
    });
  },

  async querySkus() {
    this.setData({ loading: true });
    try {
      var res = await api.warehouse.listFinishedInventory({
        styleNo: this.data.styleNo,
        page: 1,
        pageSize: 500,
      });
      var records = [];
      if (Array.isArray(res)) records = res;
      else if (res && Array.isArray(res.records)) records = res.records;
      else if (res && Array.isArray(res.list)) records = res.list;
      else if (res && Array.isArray(res.items)) records = res.items;

      var styleName = this.data.styleName;
      var skuList = records.map(function (item, idx) {
        return {
          id: item.id || ('sku_' + idx),
          sku: item.sku || '',
          color: item.color || '-',
          size: item.size || '-',
          availableQty: item.availableQty || 0,
          salesPrice: item.salesPrice || 0,
          // D-513：成本价（PC 端 FreeInboundModal 有单价列，手机端原先没有）
          costPrice: item.costPrice || 0,
        };
      });
      if (!styleName && records.length && records[0].styleName) {
        styleName = records[0].styleName;
      }
      this.setData({
        skuList: skuList,
        styleName: styleName,
        queried: true,
        loading: false,
        selected: {},
      });
      // 直接调用，不用 setData 回调 —— 回调不绑定 this，会导致 _refreshSelection 内 this 丢失
      this._refreshSelection();
    } catch (e) {
      this.setData({ loading: false, queried: true });
      wx.showToast({ title: (e && e.message) || '查询失败', icon: 'none' });
    }
  },

  async loadAreas() {
    try {
      var res = await api.warehouse.listWarehouseAreas('FINISHED');
      var list = Array.isArray(res) ? res : (res && (res.records || res.list || res.items)) || [];
      var options = list.map(function (a) {
        return { id: String(a.id || ''), name: a.areaName || a.name || '-' };
      });
      this.setData({
        areaOptions: options,
        areaNames: options.map(function (o) { return o.name; }),
      });
    } catch (e) {
      console.warn('[入库] 加载仓库区域失败', e);
    }
  },

  // ────────── 类型 / 仓库 ──────────

  onSelectType(e) {
    var key = e.currentTarget.dataset.key;
    var hit = null;
    for (var i = 0; i < SOURCE_TYPES.length; i++) {
      if (SOURCE_TYPES[i].key === key) { hit = SOURCE_TYPES[i]; break; }
    }
    if (!hit) return;
    this.setData({ sourceType: hit.key, sourceTypeLabel: hit.label });
  },

  /**
   * ⚠️ 用 <picker mode="selector"> 而非 wx.showActionSheet ——
   * 后者 itemList 最多 6 项，仓库区域可能超过，会直接失败。
   */
  onAreaChange(e) {
    var opt = this.data.areaOptions[e.detail.value];
    if (opt) this.setData({ warehouseAreaId: opt.id, warehouseAreaName: opt.name });
  },

  onLocationInput(e) {
    this.setData({ warehouseLocation: e.detail.value });
  },
  onSupplierInput(e) {
    this.setData({ supplierName: e.detail.value });
  },
  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  // ────────── SKU 多选 ──────────

  onToggleSku(e) {
    var id = String(e.currentTarget.dataset.id);
    var selected = this.data.selected;
    if (selected[id] != null) delete selected[id];
    else selected[id] = 1;
    this.setData({ selected: selected });
    this._refreshSelection();
  },

  onToggleAll() {
    var selected = {};
    if (!this.data.allSelected) {
      var list = this.data.skuList;
      for (var i = 0; i < list.length; i++) selected[list[i].id] = 1;
    }
    this.setData({ selected: selected });
    this._refreshSelection();
  },

  onQtyMinus(e) {
    var id = String(e.currentTarget.dataset.id);
    var selected = this.data.selected;
    if (selected[id] == null) return;
    if (selected[id] <= 1) delete selected[id];
    else selected[id] = selected[id] - 1;
    this.setData({ selected: selected });
    this._refreshSelection();
  },

  onQtyPlus(e) {
    var id = String(e.currentTarget.dataset.id);
    var selected = this.data.selected;
    selected[id] = (selected[id] || 0) + 1;
    this.setData({ selected: selected });
    this._refreshSelection();
  },

  onQtyInput(e) {
    var id = String(e.currentTarget.dataset.id);
    var val = parseInt(e.detail.value, 10);
    var selected = this.data.selected;
    if (isNaN(val) || val <= 0) delete selected[id];
    else selected[id] = val;
    this.setData({ selected: selected });
    this._refreshSelection();
  },

  // D-513：成本价可改（写回 skuList，提交时带到 items[].unitPrice）
  onPriceInput(e) {
    var id = String(e.currentTarget.dataset.id);
    var list = this.data.skuList;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === id) {
        var v = parseFloat(e.detail.value);
        list[i].costPrice = isNaN(v) || v < 0 ? 0 : v;
        break;
      }
    }
    this.setData({ skuList: list });
  },

  _refreshSelection() {
    var selected = this.data.selected;
    var list = this.data.skuList;
    var count = 0;
    var qty = 0;
    for (var i = 0; i < list.length; i++) {
      var v = selected[list[i].id];
      if (v != null && v > 0) { count++; qty += v; }
    }
    this.setData({
      selectedCount: count,
      selectedQty: qty,
      allSelected: list.length > 0 && count === list.length,
    });
  },

  // ────────── 提交 ──────────

  async onSubmit() {
    if (this.data.submitting) return;
    var selected = this.data.selected;
    var list = this.data.skuList;
      var items = [];
      for (var i = 0; i < list.length; i++) {
        var v = selected[list[i].id];
        if (v != null && v > 0) {
          // ⚠️ 关键：batchInbound 只用 putIfAbsent 合并
          // warehouseLocation / warehouseAreaId / sourceType / batchNo / traceId
          // 这 5 个字段（FinishedWarehouseOperationOrchestrator line 203-207），
          // 其余字段**必须逐条放进 item**，否则会被丢弃。
          items.push({
            skuCode: list[i].sku,
            quantity: v,
            styleNo: this.data.styleNo || '',
            styleName: this.data.styleName || '',
            color: list[i].color,
            size: list[i].size,
            // D-513：成本价。batchInbound 逐条调 freeInbound，后者读 params.unitPrice，
            // 所以放 item 里即可生效（后端无需改动）
            unitPrice: list[i].costPrice || 0,
            supplierName: this.data.supplierName || '',
            remark: this.data.remark || '',
          });
        }
      }
    if (!items.length) {
      wx.showToast({ title: '请至少选择一个规格', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      await api.warehouse.batchInbound({
        items: items,
        sourceType: this.data.sourceType,
        warehouseAreaId: this.data.warehouseAreaId || '',
        warehouseLocation: this.data.warehouseLocation || '默认仓',
        supplierName: this.data.supplierName || '',
        remark: this.data.remark || '',
      });
      wx.showToast({ title: '入库成功', icon: 'success' });
      var self = this;
      setTimeout(function () {
        var pages = getCurrentPages();
        var prev = pages[pages.length - 2];
        if (prev && typeof prev.loadDetail === 'function') prev.loadDetail();
        wx.navigateBack();
      }, 800);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '入库失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
