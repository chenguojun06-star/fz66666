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
const { decodeParam } = require('../../../utils/urlParams');
const i18n = require('../../../utils/i18n/index');

/**
 * 与后端 FinishedOutstockHelper.VALID_OUTSTOCK_TYPES 对齐（去掉扫码类型，扫码走单独入口）
 *
 * ⚠️ key 是**后端契约**，绝不能跟着语言变；needsCustomer 也是后端规则
 *    （REQUIRES_CUSTOMER_TYPES）。label 由 applyLanguage 按当前语言展开。
 */
const OUTSTOCK_TYPES = [
  { key: 'shipment', labelKey: 'mp.warehouse.finishedOutbound.typeShipment', needsCustomer: true },
  { key: 'transfer_out', labelKey: 'mp.warehouse.finishedOutbound.typeTransferOut', needsCustomer: false },
  { key: 'damage_out', labelKey: 'mp.warehouse.finishedOutbound.typeDamageOut', needsCustomer: false },
  { key: 'sample_out', labelKey: 'mp.warehouse.finishedOutbound.typeSampleOut', needsCustomer: false },
  { key: 'other_out', labelKey: 'mp.warehouse.finishedOutbound.typeOtherOut', needsCustomer: false },
];

/** 把「只带 labelKey 的选项」按当前语言展开成 wxml 需要的 {key, label} */
function localizeTypeOptions(lang) {
  return OUTSTOCK_TYPES.map(function (o) {
    return { key: o.key, label: i18n.t(o.labelKey, lang) };
  });
}

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
    // 初始就按当前语言展开，避免首屏闪一下空白（onShow 里还会再刷一次）
    typeOptions: localizeTypeOptions(i18n.getLanguage()),
    outstockType: 'shipment',
    outstockTypeLabel: '',
    needsCustomer: true,

    /** i18n 文案表（applyLanguage 里填充，wxml 用 {{t.xxx}}） */
    t: {},

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
    // D-517：可搜索选择器
    pickerVisible: false, pickerKey: '', pickerTitle: '', pickerOptions: [], pickerValue: '',
    // D-513：收货地址（PC 端 CustomerInfoSection 有，手机端原先缺失）
    shippingAddress: '',
    // D-513：联系电话（PC 端 CustomerInfoSection 也有，手机端原先缺失）
    customerPhone: '',

    // D-513：物流信息（后端 FinishedOutstockHelper 支持）
    expressCompany: '',
    trackingNo: '',
    // 注：不做 directShip 开关。后端该字段语义是「质检直发」（不落成品库存、跳过库存
    // 扣减、仅限销售出库），误触会造成幽灵出库单。PC 端也只走 URL 入口。参见 WXML 注释。

    remark: '',
  },

  onLoad(options) {
    this.setData({
      styleNo: decodeParam(options.styleNo),
      orderNo: decodeParam(options.orderNo),
      styleName: decodeURIComponent(options.styleName || ''),
      styleImage: decodeURIComponent(options.styleImage || ''),
      factoryName: decodeURIComponent(options.factoryName || ''),
    });
    // 导航栏标题改在 applyLanguage 里设（json 里那个是写死的，不会跟着语言变）
    this.loadSkus();
    this.loadAreas();
    this.loadCustomers();
  },

  onShow() {
    // 每次回到页面都按当前语言重刷文案（用户可能在「我的」里切了语言）
    this.applyLanguage(i18n.getLanguage());
  },

  /**
   * 刷新本页全部文案。三处都要更新：
   *   ① t.*（wxml 静态文案）
   *   ② 出库类型 chips 的 label（在 data 数组里，不是 wxml 字面量）
   *   ③ SKU 行的「可用 N 件 · 库位」与顶部「款号/订单/工厂」（带参，逐条或逐页不同）
   */
  applyLanguage(language) {
    var lang = language || i18n.getLanguage();
    // 记住当前语言：loadSkus 里的 _decorateSkus 要用同一个语言，
    // 否则两处各读一次 storage，中间被切语言就会不一致。
    this._lang = lang;
    // 导航栏标题：json 里的 navigationBarTitleText 只能写死，必须在这里覆盖才会跟着语言变
    wx.setNavigationBarTitle({ title: i18n.t('mp.warehouse.finishedOutbound.title', lang) });
    var current = null;
    for (var i = 0; i < OUTSTOCK_TYPES.length; i++) {
      if (OUTSTOCK_TYPES[i].key === this.data.outstockType) { current = OUTSTOCK_TYPES[i]; break; }
    }
    this.setData({
      t: {
        noImage: i18n.t('mp.warehouse.finishedOutbound.noImage', lang),
        styleNoText: i18n.tf('mp.warehouse.finishedOutbound.styleNoText', { no: this.data.styleNo || '—' }, lang),
        orderNoText: i18n.tf('mp.warehouse.finishedOutbound.orderNoText', { no: this.data.orderNo || '' }, lang),
        factoryText: i18n.tf('mp.warehouse.finishedOutbound.factoryText', { name: this.data.factoryName || '' }, lang),
        outboundType: i18n.t('mp.warehouse.finishedOutbound.outboundType', lang),
        warehouseArea: i18n.t('common.warehouseArea', lang),
        pleaseSelect: i18n.t('common.pleaseSelect', lang),
        customer: i18n.t('mp.warehouse.finishedOutbound.customer', lang),
        requiredCustomer: i18n.t('mp.warehouse.finishedOutbound.requiredCustomer', lang),
        shippingAddress: i18n.t('mp.warehouse.finishedOutbound.shippingAddress', lang),
        autoFillEditable: i18n.t('mp.warehouse.finishedOutbound.autoFillEditable', lang),
        contactPhone: i18n.t('mp.warehouse.finishedOutbound.contactPhone', lang),
        expressCompany: i18n.t('mp.warehouse.finishedOutbound.expressCompany', lang),
        expressPlaceholder: i18n.t('mp.warehouse.finishedOutbound.expressPlaceholder', lang),
        trackingNo: i18n.t('mp.warehouse.finishedOutbound.trackingNo', lang),
        optional: i18n.t('common.optional', lang),
        selectDetail: i18n.t('mp.warehouse.finishedOutbound.selectDetail', lang),
        fillAllQty: i18n.t('mp.warehouse.finishedOutbound.fillAllQty', lang),
        selectAll: i18n.t('common.selectAll', lang),
        loading: i18n.t('common.loading', lang),
        noStockData: i18n.t('mp.warehouse.finishedOutbound.noStockData', lang),
        price: i18n.t('common.price', lang),
        yuan: i18n.t('common.yuan', lang),
        remark: i18n.t('common.remark', lang),
        remarkPlaceholder: i18n.t('mp.warehouse.finishedOutbound.remarkPlaceholder', lang),
        submitting: i18n.t('common.submitting', lang),
        confirmOutbound: i18n.t('mp.warehouse.finishedOutbound.confirmOutbound', lang),
      },
      typeOptions: localizeTypeOptions(lang),
      outstockTypeLabel: current ? i18n.t(current.labelKey, lang) : '',
      skuList: this._decorateSkus(this.data.skuList, lang),
    });
    this._refreshSummaryTexts(lang);
  },

  /** SKU 行的带参文案（「可用 N 件 · 库位」逐条不同 → 不能放在 t 里） */
  _decorateSkus(list, lang) {
    var l = lang || this._lang || i18n.getLanguage();
    return (list || []).map(function (it) {
      return Object.assign({}, it, {
        availableText: i18n.tf('mp.warehouse.finishedOutbound.availableQtyText', {
          qty: it.availableQty || 0,
          loc: it.warehouseLocation || '-',
        }, l),
      });
    });
  },

  /** 底部提交栏的带参文案（已选 N 项 / 合计 N 件） */
  _refreshSummaryTexts(lang) {
    var l = lang || this._lang || i18n.getLanguage();
    this.setData({
      't.selectedItemsText': i18n.tf('common.selectedItems', { count: this.data.selectedCount }, l),
      't.totalQtyText': i18n.tf('common.totalQty', { count: this.data.selectedQty }, l),
    });
  },

  // ────────── 数据加载 ──────────

  async loadSkus() {
    if (!this.data.styleNo) {
      this.setData({ loading: false });
      wx.showToast({ title: i18n.t('mp.warehouse.finishedOutbound.missingStyleNo'), icon: 'none' });
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
      this.setData({ skuList: this._decorateSkus(skuList), loading: false });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.message) || i18n.t('common.loadFailed'), icon: 'none' });
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
          // D-513：保留客户地址，选客户时自动带出收货地址
          address: c.address || c.shippingAddress || c.companyAddress || '',
          // D-513：保留客户电话（t_customer.contact_phone），选客户时自动带出
          phone: c.contactPhone || c.phone || c.contact_phone || c.mobile || '',
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
      outstockTypeLabel: i18n.t(hit.labelKey, this._lang || i18n.getLanguage()),
      needsCustomer: hit.needsCustomer,
      // 切到不需要客户的类型时清掉已选客户，避免提交脏数据
      customerId: hit.needsCustomer ? this.data.customerId : '',
      customerName: hit.needsCustomer ? this.data.customerName : '',
    });
  },

  // ────────── 仓库区域 / 客户选择 ──────────

  /* ═══ D-517：可搜索选择器（仓库区域 / 客户） ═══
     原生 <picker> 没有搜索框，客户几十上百个时只能一路滚。 */
  _openPickerByKey(e) {
    var key = (e.currentTarget.dataset && e.currentTarget.dataset.key) || '';
    var map = {
      area: { title: i18n.t('common.selectWarehouseArea'), options: this.data.areaOptions, current: this.data.warehouseAreaId },
      customer: { title: i18n.t('mp.warehouse.finishedOutbound.selectCustomer'), options: this.data.customerOptions, current: this.data.customerId },
    };
    var cfg = map[key];
    if (!cfg) return;
    this.setData({
      pickerKey: key,
      pickerTitle: cfg.title,
      pickerValue: cfg.current || '',
      pickerOptions: (cfg.options || []).map(function (o) {
        return { label: o.name || '', value: String(o.id || ''), address: o.address || '' };
      }).filter(function (o) { return o.label && o.value; }),
      pickerVisible: true,
    });
  },

  _onPickerSelectByKey(e) {
    var key = this.data.pickerKey;
    var d = (e && e.detail) || {};
    if (key === 'area') {
      this.setData({ warehouseAreaId: d.value || '', warehouseAreaName: d.label || '' });
    } else if (key === 'customer') {
      // 选客户自动带出收货地址（用户仍可手改）
      this.setData({
        customerId: d.value || '',
        customerName: d.label || '',
        shippingAddress: (d.item && d.item.address) || this.data.shippingAddress || '',
      });
    }
  },

  onAreaChange(e) {
    var opt = this.data.areaOptions[e.detail.value];
    if (opt) this.setData({ warehouseAreaId: opt.id, warehouseAreaName: opt.name });
  },

  onCustomerChange(e) {
    var opt = this.data.customerOptions[e.detail.value];
    if (!opt) return;
    // 选客户自动带出收货地址 + 联系电话（用户仍可手改）
    this.setData({
      customerId: opt.id,
      customerName: opt.name,
      shippingAddress: opt.address || this.data.shippingAddress || '',
      customerPhone: opt.phone || this.data.customerPhone || '',
    });
  },

  onPhoneInput(e) {
    this.setData({ customerPhone: e.detail.value });
  },

  onExpressInput(e) {
    this.setData({ expressCompany: e.detail.value });
  },

  onTrackingInput(e) {
    this.setData({ trackingNo: e.detail.value });
  },


  onAddressInput(e) {
    this.setData({ shippingAddress: e.detail.value });
  },

  // D-513：单价可改（写回 skuList，提交时带到 items[].salesPrice）
  onPriceInput(e) {
    var id = String(e.currentTarget.dataset.id);
    var list = this.data.skuList;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === id) {
        var v = parseFloat(e.detail.value);
        list[i].salesPrice = isNaN(v) || v < 0 ? 0 : v;
        break;
      }
    }
    this.setData({ skuList: list });
  },

  /**
   * D-513：一键全部数量 —— 把所有有库存的规格按可用库存填满
   * （原先要逐个点开再加减，手机上很费劲）
   */
  onFillAllQty() {
    var list = this.data.skuList;
    var selected = {};
    var total = 0;
    var count = 0;
    for (var i = 0; i < list.length; i++) {
      var qty = list[i].availableQty || 0;
      if (qty > 0) {
        selected[list[i].id] = qty;
        total += qty;
        count += 1;
      }
    }
    if (!count) {
      wx.showToast({ title: i18n.t('mp.warehouse.finishedOutbound.noAvailableStock'), icon: 'none' });
      return;
    }
    this.setData({ selected: selected });
    this._refreshSelection();
    wx.showToast({
      title: i18n.tf('mp.warehouse.finishedOutbound.filledSummary', { count: count, qty: total }),
      icon: 'none',
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
        wx.showToast({ title: i18n.t('mp.warehouse.finishedOutbound.skuNoStock'), icon: 'none' });
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
      wx.showToast({ title: i18n.t('mp.warehouse.finishedOutbound.exceedStock'), icon: 'none' });
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
        wx.showToast({ title: i18n.tf('mp.warehouse.finishedOutbound.maxQty', { qty: max }), icon: 'none' });
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
    // 底部「已选 N 项 / 合计 N 件」是带参文案，选中数一变就得重算
    this._refreshSummaryTexts();
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
        // D-513：带上单价（后端 FinishedOutstockHelper 读 item.salesPrice）
        items.push({
          sku: list[i].sku,
          quantity: v,
          salesPrice: list[i].salesPrice || 0,
        });
      }
    }
    if (!items.length) {
      wx.showToast({ title: i18n.t('common.selectSkuFirst'), icon: 'none' });
      return;
    }
    if (this.data.needsCustomer && !this.data.customerName) {
      wx.showToast({ title: i18n.t('mp.warehouse.finishedOutbound.needCustomer'), icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      await api.warehouse.outbound({
        items: items,
        orderNo: this.data.orderNo || '',
        outstockType: this.data.outstockType,
        warehouseAreaId: this.data.warehouseAreaId || '',
        customerId: this.data.customerId || '',
        customerName: this.data.customerName || '',
        // D-513：收货地址（后端 FinishedOutstockHelper 读 params.shippingAddress）
        shippingAddress: this.data.shippingAddress || '',
        // D-513：联系电话 / 物流信息（后端均支持，手机端原先没传）
        customerPhone: this.data.customerPhone || '',
        expressCompany: this.data.expressCompany || '',
        trackingNo: this.data.trackingNo || '',
        remark: this.data.remark || '',
      });
      wx.showToast({ title: i18n.t('mp.warehouse.finishedOutbound.outboundSuccess'), icon: 'success' });
      var self = this;
      setTimeout(function () {
        // 回上一页并让它刷新（详情页 onShow 会重新加载）
        var pages = getCurrentPages();
        var prev = pages[pages.length - 2];
        if (prev && typeof prev.loadDetail === 'function') prev.loadDetail();
        wx.navigateBack();
      }, 800);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || i18n.t('mp.warehouse.finishedOutbound.outboundFailed'), icon: 'none' });
      this.setData({ submitting: false });
    }
  },
  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */
  openPicker: function (e) {
    var ds = e.currentTarget.dataset || {};
    if (!ds.handler && typeof this._openPickerByKey === 'function') {
      return this._openPickerByKey(e);
    }
    var arr = this.data[ds.names] || [];
    var rangeKey = ds.rangeKey || '';
    var opts = [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      var label;
      if (rangeKey) {
        label = it ? it[rangeKey] : '';
      } else if (it && typeof it === 'object') {
        label = it.label != null ? it.label : (it.name != null ? it.name : '');
      } else {
        label = it;
      }
      label = String(label == null ? '' : label);
      if (!label) continue;
      opts.push({ label: label, value: String(i) });
    }
    this._pickerHandler = ds.handler || '';
    this.setData({
      pickerTitle: ds.title || i18n.t('common.pleaseSelect'),
      pickerOptions: opts,
      pickerValue: '',
      pickerVisible: true,
    });
  },

  onPickerSelect: function (e) {
    var handler = this._pickerHandler;
    if (handler && typeof this[handler] === 'function') {
      this[handler]({ detail: { value: Number(e.detail.value) } });
      return;
    }
    if (typeof this._onPickerSelectByKey === 'function') {
      return this._onPickerSelectByKey(e);
    }
  },

  onPickerClose: function () {
    this.setData({ pickerVisible: false });
  },

});
