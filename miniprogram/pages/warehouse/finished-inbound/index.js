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
const { decodeParam } = require('../../../utils/urlParams');
const i18n = require('../../../utils/i18n/index');

// ⚠️ key 是**后端契约**（FinishedWarehouseOperationOrchestrator.VALID_SOURCE_TYPES），
//    绝不能跟着语言变；label 由 applyLanguage 按当前语言展开。
const SOURCE_TYPES = [
  { key: 'free_inbound', labelKey: 'mp.warehouse.finishedInbound.typeFreeInbound' },
  { key: 'external_purchase', labelKey: 'mp.warehouse.finishedInbound.typeExternalPurchase' },
  { key: 'transfer_in', labelKey: 'mp.warehouse.finishedInbound.typeTransferIn' },
  { key: 'return_in', labelKey: 'mp.warehouse.finishedInbound.typeReturnIn' },
  { key: 'other_in', labelKey: 'mp.warehouse.finishedInbound.typeOtherIn' },
];

/** 把「只带 labelKey 的选项」按当前语言展开成 wxml 需要的 {key, label} */
function localizeTypeOptions(lang) {
  return SOURCE_TYPES.map(function (o) {
    return { key: o.key, label: i18n.t(o.labelKey, lang) };
  });
}

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
    // 初始就按当前语言展开，避免首屏闪一下空白（onShow 里还会再刷一次）
    typeOptions: localizeTypeOptions(i18n.getLanguage()),
    sourceType: 'free_inbound',
    sourceTypeLabel: '',

    /** i18n 文案表（applyLanguage 里填充，wxml 用 {{t.xxx}}） */
    t: {},

    // ── 仓库 ──
    areaOptions: [],
    areaNames: [],
    warehouseAreaId: '',
    warehouseAreaName: '',
    // ⚠️ '默认仓' 是**数据值**不是文案：后端与 DB 的 warehouse_location 默认值就是它
    //    （FinishedWarehouseOperationOrchestrator:91 / 迁移脚本 DEFAULT '默认仓'）。
    //    翻译了会写进数据库、导致按库位查不到数据，所以这里保持原样。
    warehouseLocation: '默认仓',
    // D-517：可搜索选择器
    pickerVisible: false, pickerKey: '', pickerTitle: '', pickerOptions: [], pickerValue: '',

    supplierName: '',
    remark: '',
  },

  onLoad(options) {
    this.setData({
      styleNo: decodeParam(options.styleNo),
      styleName: decodeURIComponent(options.styleName || ''),
    });
    // 导航栏标题改在 applyLanguage 里设（json 里那个是写死的，不会跟着语言变）
    this.loadAreas();
    if (this.data.styleNo) this.querySkus();
  },

  onShow() {
    // 每次回到页面都按当前语言重刷文案（用户可能在「我的」里切了语言）
    this.applyLanguage(i18n.getLanguage());
  },

  /**
   * 刷新本页全部文案。三处都要更新：
   *   ① t.*（wxml 静态文案）
   *   ② 入库类型 chips 的 label（在 data 数组里，不是 wxml 字面量）
   *   ③ SKU 行的「现有库存 N 件」（逐条不同，不能放在 t 里）
   */
  applyLanguage(language) {
    var lang = language || i18n.getLanguage();
    // 记住当前语言：querySkus 里的 _decorateSkus 要用同一个语言，
    // 否则两处各读一次 storage，中间被切语言就会不一致。
    this._lang = lang;
    // 导航栏标题：json 里的 navigationBarTitleText 只能写死，必须在这里覆盖才会跟着语言变
    wx.setNavigationBarTitle({ title: i18n.t('mp.warehouse.finishedInbound.title', lang) });
    var current = null;
    for (var i = 0; i < SOURCE_TYPES.length; i++) {
      if (SOURCE_TYPES[i].key === this.data.sourceType) { current = SOURCE_TYPES[i]; break; }
    }
    this.setData({
      t: {
        styleNoLabel: i18n.t('common.styleNo', lang),
        inputStyleNo: i18n.t('mp.warehouse.finishedInbound.inputStyleNo', lang),
        scan: i18n.t('common.scan', lang),
        query: i18n.t('common.query', lang),
        inboundType: i18n.t('mp.warehouse.finishedInbound.inboundType', lang),
        warehouseArea: i18n.t('common.warehouseArea', lang),
        pleaseSelect: i18n.t('common.pleaseSelect', lang),
        location: i18n.t('common.location', lang),
        supplier: i18n.t('common.supplier', lang),
        optional: i18n.t('common.optional', lang),
        inboundDetail: i18n.t('mp.warehouse.finishedInbound.inboundDetail', lang),
        selectAll: i18n.t('common.selectAll', lang),
        loading: i18n.t('common.loading', lang),
        noSkuData: i18n.t('mp.warehouse.finishedInbound.noSkuData', lang),
        costPrice: i18n.t('common.costPrice', lang),
        yuan: i18n.t('common.yuan', lang),
        remark: i18n.t('common.remark', lang),
        submitting: i18n.t('common.submitting', lang),
        confirmInbound: i18n.t('mp.warehouse.finishedInbound.confirmInbound', lang),
      },
      typeOptions: localizeTypeOptions(lang),
      sourceTypeLabel: current ? i18n.t(current.labelKey, lang) : '',
      skuList: this._decorateSkus(this.data.skuList, lang),
    });
    this._refreshSummaryTexts(lang);
  },

  /** SKU 行的带参文案（「现有库存 N 件」逐条不同 → 不能放在 t 里） */
  _decorateSkus(list, lang) {
    var l = lang || this._lang || i18n.getLanguage();
    return (list || []).map(function (it) {
      return Object.assign({}, it, {
        existingStockText: i18n.tf('mp.warehouse.finishedInbound.existingStock', {
          qty: it.availableQty || 0,
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

  // ────────── 查询 ──────────

  onStyleNoInput(e) {
    this.setData({ styleNo: e.detail.value });
  },

  onQuery() {
    if (!this.data.styleNo) {
      wx.showToast({ title: i18n.t('mp.warehouse.finishedInbound.styleNoRequired'), icon: 'none' });
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
          wx.showToast({ title: i18n.t('mp.warehouse.finishedInbound.styleNoNotFound'), icon: 'none' });
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
        skuList: this._decorateSkus(skuList),
        styleName: styleName,
        queried: true,
        loading: false,
        selected: {},
      });
      // 直接调用，不用 setData 回调 —— 回调不绑定 this，会导致 _refreshSelection 内 this 丢失
      this._refreshSelection();
    } catch (e) {
      this.setData({ loading: false, queried: true });
      wx.showToast({ title: (e && e.message) || i18n.t('mp.warehouse.finishedInbound.queryFailed'), icon: 'none' });
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
    this.setData({
      sourceType: hit.key,
      sourceTypeLabel: i18n.t(hit.labelKey, this._lang || i18n.getLanguage()),
    });
  },

  /**
   * ⚠️ 用 <picker mode="selector"> 而非 wx.showActionSheet ——
   * 后者 itemList 最多 6 项，仓库区域可能超过，会直接失败。
   */
  onAreaChange(e) {
    var opt = this.data.areaOptions[e.detail.value];
    if (opt) this.setData({ warehouseAreaId: opt.id, warehouseAreaName: opt.name });
  },

  /* ═══ D-517：仓库区域改可搜索选择器（原生 picker 无搜索） ═══ */
  _openPickerByKey(e) {
    var key = (e.currentTarget.dataset && e.currentTarget.dataset.key) || '';
    if (key !== 'area') return;
    this.setData({
      pickerKey: key,
      pickerTitle: i18n.t('common.selectWarehouseArea', this._lang || i18n.getLanguage()),
      pickerValue: this.data.warehouseAreaId || '',
      pickerOptions: (this.data.areaOptions || []).map(function (o) {
        return { label: o.name || '', value: String(o.id || '') };
      }).filter(function (o) { return o.label && o.value; }),
      pickerVisible: true,
    });
  },

  _onPickerSelectByKey(e) {
    var d = (e && e.detail) || {};
    if (this.data.pickerKey === 'area') {
      this.setData({ warehouseAreaId: d.value || '', warehouseAreaName: d.label || '' });
    }
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
      wx.showToast({ title: i18n.t('common.selectSkuFirst'), icon: 'none' });
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
      wx.showToast({ title: i18n.t('mp.warehouse.finishedInbound.inboundSuccess'), icon: 'success' });
      var self = this;
      setTimeout(function () {
        var pages = getCurrentPages();
        var prev = pages[pages.length - 2];
        if (prev && typeof prev.loadDetail === 'function') prev.loadDetail();
        wx.navigateBack();
      }, 800);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || i18n.t('mp.warehouse.finishedInbound.inboundFailed'), icon: 'none' });
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
