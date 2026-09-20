/**
 * 成品出库页（独立页面，非弹窗）
 *
 * 背景：原先的出库交互是「库存详情页」里的一个小弹窗 ——
 *   ① 只能对单行触发（点哪行出哪行），无法批量
 *   ② 没有出库类型 / 仓库区域 / 客户 的选择，导致后端必填字段缺失
 *      （后端 FinishedOutstockHelper：类型默认 shipment，而 shipment 必须带 customerName，
 *        前端没传 → 每次都该报「销售/赠品/扫码出库必须选择客户」）
 *   ③ 弹窗面积小，手机上键盘一弹就挤，不好操作
 * 故改为独立页面：全屏可滚动，选择区更大，支持多选 + 全选。
 *
 * 入口：库存详情页「出库」按钮 → wx.navigateTo 传 styleNo / orderNo / styleName 等
 */
const api = require('../../../utils/api');

/** 与后端 FinishedOutstockHelper.VALID_OUTSTOCK_TYPES 对齐（去掉扫码类型，扫码走单独入口） */
const OUTSTOCK_TYPES = [
  { key: 'shipment', label: '销售出货', needsCustomer: true },
  { key: 'transfer_out', label: '调拨出库', needsCustomer: false },
  { key: 'damage_out', label: '报废出库', needsCustomer: false },
  { key: 'sample_out', label: '样衣出库', needsCustomer: false },
  { key: 'other_out', label: '其他出库', needsCustomer: false },
];

Page({
  data: {
    // ── 基础信息（从上一页传入）──
    styleNo: '',
    orderNo: '',
    styleName: '',
    styleImage: '',
    factoryName: '',

    loading: true,
    submitting: false,

    // ── SKU 明细 ──
    skuList: [],
    /** 已选：{ [skuId]: 数量 } */
    selected: {},
    selectedCount: 0,
    selectedQty: 0,
    allSelected: false,

    // ── 出库类型 ──
    typeOptions: OUTSTOCK_TYPES,
    outstockType: 'shipment',
    outstockTypeLabel: '销售出货',
    needsCustomer: true,

    // ── 仓库区域 ──
    areaOptions: [],
    areaNames: [],
    warehouseAreaId: '',
    warehouseAreaName: '',

    // ── 客户 ──
    customerOptions: [],
    customerNames: [],
    customerId: '',
    customerName: '',

    remark: '',
  },

  onLoad(options) {
    this.setData({
      styleNo: options.styleNo || '',
      orderNo: options.orderNo || '',
      styleName: decodeURIComponent(options.styleName || ''),
      styleImage: decodeURIComponent(options.styleImage || ''),
      factoryName: decodeURIComponent(options.factoryName || ''),
    });
    wx.setNavigationBarTitle({ title: '成品出库' });
    this.loadSkus();
    this.loadAreas();
    this.loadCustomers();
  },

  // ────────── 数据加载 ──────────

  async loadSkus() {
    if (!this.data.styleNo) {
      this.setData({ loading: false });
      wx.showToast({ title: '缺少款号', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      var res = await api.warehouse.listFinishedInventory({
        styleNo: this.data.styleNo,
        orderNo: this.data.orderNo,
        page: 1,
        pageSize: 500,
      });
      var records = [];
      if (Array.isArray(res)) records = res;
      else if (res && Array.isArray(res.records)) records = res.records;
      else if (res && Array.isArray(res.list)) records = res.list;
      else if (res && Array.isArray(res.items)) records = res.items;

      var skuList = records.map(function (item, idx) {
        return {
          id: item.id || ('sku_' + idx),
          sku: item.sku || '',
          color: item.color || '-',
          size: item.size || '-',
          availableQty: item.availableQty || 0,
          warehouseLocation: item.warehouseLocation || '-',
          salesPrice: item.salesPrice || 0,
        };
      });
      this.setData({ skuList: skuList, loading: false });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
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
      // 仓库区域是选填，失败不阻塞
      console.warn('[出库] 加载仓库区域失败', e);
    }
  },

  async loadCustomers() {
    try {
      var res = await api.crm.listActiveCustomers();
      var list = Array.isArray(res) ? res : (res && (res.records || res.list || res.items)) || [];
      var options = list.map(function (c) {
        return {
          id: String(c.id || ''),
          name: c.companyName || c.customerName || c.name || '-',
        };
      });
      this.setData({
        customerOptions: options,
        customerNames: options.map(function (o) { return o.name; }),
      });
    } catch (e) {
      console.warn('[出库] 加载客户失败', e);
    }
  },

  // ────────── 出库类型 ──────────

  onSelectType(e) {
    var key = e.currentTarget.dataset.key;
    var hit = null;
    for (var i = 0; i < OUTSTOCK_TYPES.length; i++) {
      if (OUTSTOCK_TYPES[i].key === key) { hit = OUTSTOCK_TYPES[i]; break; }
    }
    if (!hit) return;
    this.setData({
      outstockType: hit.key,
      outstockTypeLabel: hit.label,
      needsCustomer: hit.needsCustomer,
      // 切到不需要客户的类型时清掉已选客户，避免提交脏数据
      customerId: hit.needsCustomer ? this.data.customerId : '',
      customerName: hit.needsCustomer ? this.data.customerName : '',
    });
  },

  // ────────── 仓库区域 / 客户选择 ──────────

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

  onPickCustomer() {
    var self = this;
    if (!this.data.customerNames.length) {
      wx.showToast({ title: '暂无可选客户', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: this.data.customerNames,
      success: function (r) {
        var opt = self.data.customerOptions[r.tapIndex];
        if (opt) self.setData({ customerId: opt.id, customerName: opt.name });
      },
      fail: function () {},
    });
  },

  // ────────── SKU 多选 ──────────

  onToggleSku(e) {
    var id = String(e.currentTarget.dataset.id);
    var selected = this.data.selected;
    if (selected[id] != null) {
      delete selected[id];
    } else {
      // 默认带 1 件；若可用库存不足 1 件则不允许选
      var sku = this._findSku(id);
      if (!sku || sku.availableQty <= 0) {
        wx.showToast({ title: '该规格无可用库存', icon: 'none' });
        return;
      }
      selected[id] = 1;
    }
    this.setData({ selected: selected });
    this._refreshSelection();
  },

  onToggleAll() {
    var selected = {};
    if (!this.data.allSelected) {
      var list = this.data.skuList;
      for (var i = 0; i < list.length; i++) {
        if (list[i].availableQty > 0) selected[list[i].id] = 1;
      }
    }
    this.setData({ selected: selected });
    this._refreshSelection();
  },

  onQtyMinus(e) {
    var id = String(e.currentTarget.dataset.id);
    var selected = this.data.selected;
    if (selected[id] == null) return;
    if (selected[id] <= 1) {
      delete selected[id];
    } else {
      selected[id] = selected[id] - 1;
    }
    this.setData({ selected: selected });
    this._refreshSelection();
  },

  onQtyPlus(e) {
    var id = String(e.currentTarget.dataset.id);
    var selected = this.data.selected;
    var sku = this._findSku(id);
    var max = sku ? sku.availableQty : 0;
    var next = (selected[id] || 0) + 1;
    if (next > max) {
      wx.showToast({ title: '超出可用库存', icon: 'none' });
      return;
    }
    selected[id] = next;
    this.setData({ selected: selected });
    this._refreshSelection();
  },

  onQtyInput(e) {
    var id = String(e.currentTarget.dataset.id);
    var sku = this._findSku(id);
    var max = sku ? sku.availableQty : 0;
    var val = parseInt(e.detail.value, 10);
    var selected = this.data.selected;
    if (isNaN(val) || val <= 0) {
      delete selected[id];
    } else {
      if (val > max) {
        val = max;
        wx.showToast({ title: '最多 ' + max + ' 件', icon: 'none' });
      }
      selected[id] = val;
    }
    this.setData({ selected: selected });
    this._refreshSelection();
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  _findSku(id) {
    var list = this.data.skuList;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(id)) return list[i];
    }
    return null;
  },

  /** 重算「已选项数 / 合计件数 / 是否全选」—— 选中态派生值统一在这里维护 */
  _refreshSelection() {
    var selected = this.data.selected;
    var list = this.data.skuList;
    var count = 0;
    var qty = 0;
    var selectable = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].availableQty > 0) selectable++;
      var v = selected[list[i].id];
      if (v != null && v > 0) {
        count++;
        qty += v;
      }
    }
    this.setData({
      selectedCount: count,
      selectedQty: qty,
      allSelected: selectable > 0 && count === selectable,
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
        items.push({ sku: list[i].sku, quantity: v });
      }
    }
    if (!items.length) {
      wx.showToast({ title: '请至少选择一个规格', icon: 'none' });
      return;
    }
    if (this.data.needsCustomer && !this.data.customerName) {
      wx.showToast({ title: '该出库类型必须选择客户', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      await api.warehouse.outbound({
        items: items,
        orderNo: this.data.orderNo || '',
        outstockType: this.data.outstockType,
        warehouseAreaId: this.data.warehouseAreaId || '',
        customerName: this.data.customerName || '',
        remark: this.data.remark || '',
      });
      wx.showToast({ title: '出库成功', icon: 'success' });
      var self = this;
      setTimeout(function () {
        // 回上一页并让它刷新（详情页 onShow 会重新加载）
        var pages = getCurrentPages();
        var prev = pages[pages.length - 2];
        if (prev && typeof prev.loadDetail === 'function') prev.loadDetail();
        wx.navigateBack();
      }, 800);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '出库失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
