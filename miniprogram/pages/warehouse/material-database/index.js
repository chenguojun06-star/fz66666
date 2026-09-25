const api = require('../../../utils/api');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { eventBus, Events } = require('../../../utils/eventBus');
const i18n = require('../../../utils/i18n/index');

// ⚠️ 筛选项的 value 是**后端契约**（后端库里存 fabric/lining/accessory 英文），
//    绝不能跟着语言变；label 由 applyLanguage 按当前语言展开。
const TYPE_OPTIONS = [
  { labelKey: 'mp.warehouse.materialDatabase.allTypes', value: '' },
  { labelKey: 'common.materialFabric', value: 'fabric' },
  { labelKey: 'common.materialLining', value: 'lining' },
  { labelKey: 'common.materialAccessory', value: 'accessory' },
];

// ⚠️ value 同样是后端契约（loadList 里映射成 disabled=0/1）
const STATUS_OPTIONS = [
  { labelKey: 'mp.warehouse.materialDatabase.allStatus', value: '' },
  { labelKey: 'common.enabled', value: 'enabled' },
  { labelKey: 'common.disabled', value: 'disabled' },
];

/** 把「只带 labelKey 的选项」按当前语言展开成 wxml 需要的 {label, value} */
function localizeOptions(options, lang) {
  return options.map(function (o) {
    return { label: i18n.t(o.labelKey, lang), value: o.value };
  });
}

// 物料类型名的键（值仍是后端契约 fabric/lining/accessory）
const TYPE_LABEL_KEYS = {
  fabric: 'common.materialFabric',
  lining: 'common.materialLining',
  accessory: 'common.materialAccessory',
};

const TYPE_COLOR_MAP = {
  fabric: 'var(--color-primary)',
  lining: 'var(--color-warning)',
  accessory: 'var(--color-success)',
};

Page({
  data: {

    // D-533：可搜索选择器状态（原生 picker 没有搜索）

    pickerVisible: false,

    pickerTitle: '',

    pickerOptions: [],

    pickerValue: '',
    loading: true,
    list: [],
    total: 0,

    page: 1,
    pageSize: 20,
    hasMore: true,

    searchText: '',
    typeValue: '',
    statusValue: '',
    // 初始就按当前语言展开，避免首屏闪一下中文（onShow 里还会再刷一次）
    typeOptions: localizeOptions(TYPE_OPTIONS, i18n.getLanguage()),
    statusOptions: localizeOptions(STATUS_OPTIONS, i18n.getLanguage()),
    typeIndex: 0,
    statusIndex: 0,

    /** i18n 文案表（applyLanguage 里填充，wxml 用 {{t.xxx}}） */
    t: {},

    selectedItem: null,
    detailVisible: false,
  },

  onLoad: function (options) {
    // 先按当前语言填好文案表（_lang 也要有值，loadList 里的 _decorateList 依赖它）
    this.applyLanguage(i18n.getLanguage());
    // D-514：支持 ?keyword=xxx 直接定位到某个物料（从物料中心点卡片进来时用）
    if (options && options.keyword) {
      this.setData({ searchText: String(options.keyword) });
    }
    this.loadList(true);
  },

  onShow: function () {
    // 每次回到页面都按当前语言重刷文案（用户可能在「我的」里切了语言）
    this.applyLanguage(i18n.getLanguage());
    this._bindEvents();
  },

  /**
   * 刷新本页全部文案。三处都要更新：
   *   ① t.*（wxml 静态文案）
   *   ② 筛选器 chips 的 label（在 data 数组里，不是 wxml 字面量）
   *   ③ 列表项的带参文案（「颜色：x」「¥x/y」逐条不同，不能放在 t 里）
   */
  applyLanguage: function (language) {
    var lang = language || i18n.getLanguage();
    // 记住当前语言：loadList 里的 _decorateList 要用同一个语言，
    // 否则两处各读一次 storage，中间被切语言就会不一致。
    this._lang = lang;
    // 导航栏标题：json 里的 navigationBarTitleText 只能写死，必须在这里覆盖才会跟着语言变
    wx.setNavigationBarTitle({ title: i18n.t('mp.warehouse.materialDatabase.title', lang) });

    var list = this._decorateList(this.data.list, lang);
    // selectedItem 原先与 list 元素同一个对象引用；重建 list 后要按 id 重新指过去，
    // 否则详情弹窗会停在上一个语言的文案上
    var sel = null;
    if (this.data.selectedItem) {
      var sid = this.data.selectedItem.id;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === sid) { sel = list[i]; break; }
      }
      if (!sel) sel = this._decorateList([this.data.selectedItem], lang)[0];
    }

    this.setData({
      t: {
        searchPlaceholder: i18n.t('mp.warehouse.materialDatabase.searchPlaceholder', lang),
        outbound: i18n.t('common.outbound', lang),
        inbound: i18n.t('common.inbound', lang),
        loading: i18n.t('common.loading', lang),
        noData: i18n.t('mp.warehouse.materialDatabase.noData', lang),
        noDataSub: i18n.t('mp.warehouse.materialDatabase.noDataSub', lang),
        disabled: i18n.t('common.disabled', lang),
        disabledFull: i18n.t('mp.warehouse.materialDatabase.disabledFull', lang),
        loadMore: i18n.t('mp.warehouse.materialDatabase.loadMore', lang),
        noMore: i18n.t('mp.warehouse.materialDatabase.noMore', lang),
        detailTitle: i18n.t('mp.warehouse.materialDatabase.detailTitle', lang),
        basicInfo: i18n.t('mp.warehouse.materialDatabase.basicInfo', lang),
        color: i18n.t('common.color', lang),
        spec: i18n.t('common.spec', lang),
        unit: i18n.t('common.unit', lang),
        price: i18n.t('common.price', lang),
        fabricWidth: i18n.t('mp.warehouse.materialDatabase.fabricWidth', lang),
        fabricWeight: i18n.t('mp.warehouse.materialDatabase.fabricWeight', lang),
        composition: i18n.t('mp.warehouse.materialDatabase.composition', lang),
        relatedStyleNo: i18n.t('mp.warehouse.materialDatabase.relatedStyleNo', lang),
        supplierInfo: i18n.t('mp.warehouse.materialDatabase.supplierInfo', lang),
        supplierName: i18n.t('common.supplierName', lang),
        contactPerson: i18n.t('common.contactPerson', lang),
        contactPhone: i18n.t('common.contactPhone', lang),
        remark: i18n.t('common.remark', lang),
      },
      typeOptions: localizeOptions(TYPE_OPTIONS, lang),
      statusOptions: localizeOptions(STATUS_OPTIONS, lang),
      list: list,
      selectedItem: sel,
    });
    this._refreshTotalText(lang);
  },

  /** 列表项的带参文案（「颜色：x」「¥x/y」「供应商：x」「创建时间：x」逐条不同） */
  _decorateList: function (list, lang) {
    var l = lang || this._lang || i18n.getLanguage();
    return (list || []).map(function (item) {
      var out = Object.assign({}, item);
      out._typeLabel = TYPE_LABEL_KEYS[item.materialType]
        ? i18n.t(TYPE_LABEL_KEYS[item.materialType], l)
        : (item.materialType || i18n.t('common.uncategorized', l));
      out._colorText = i18n.tf('mp.warehouse.materialDatabase.colorText', { value: item.color }, l);
      out._specText = i18n.tf('mp.warehouse.materialDatabase.specText', { value: item.specifications }, l);
      out._priceText = i18n.tf('mp.warehouse.materialDatabase.priceText', {
        price: item._unitPrice,
        unit: item.unit || i18n.t('mp.warehouse.materialDatabase.defaultUnit', l),
      }, l);
      out._supplierText = i18n.tf('mp.warehouse.materialDatabase.supplierText', { value: item.supplierName }, l);
      out._createTimeText = i18n.tf('mp.warehouse.materialDatabase.createTimeText', { value: item._createTime }, l);
      return out;
    });
  },

  /** 「共 N 条物料」——依赖 total，加载/刷新后要单独重算 */
  _refreshTotalText: function (lang) {
    var l = lang || this._lang || i18n.getLanguage();
    this.setData({
      't.totalText': i18n.tf('mp.warehouse.materialDatabase.totalText', { total: this.data.total }, l),
    });
  },

  onHide: function () {
    this._unbindEvents();
  },

  onUnload: function () {
    this._unbindEvents();
  },

  /** D-485：跳物料入库页（手机端此前只有扫码发料/退回，无手工入库入口） */
  onGoInbound: function () {
    wx.navigateTo({ url: '/pages/warehouse/material-inbound/index' });
  },

  /** D-486：跳物料手工出库页（手机端此前无手工出库，只有扫码发料） */
  onGoOutbound: function () {
    wx.navigateTo({ url: '/pages/warehouse/material-outbound/index' });
  },

  _bindEvents: function () {
    this._onDataChanged = function (data) {
      if (data && (data.type === 'warehouse' || data.type === 'materialStock' || data.type === 'material')) {
        this.loadList(true);
      }
    }.bind(this);
    this._onRefreshAll = function () {
      this.loadList(true);
    }.bind(this);
    eventBus.on(Events.DATA_CHANGED, this._onDataChanged);
    eventBus.on(Events.REFRESH_ALL, this._onRefreshAll);
  },

  _unbindEvents: function () {
    if (this._onDataChanged) eventBus.off(Events.DATA_CHANGED, this._onDataChanged);
    if (this._onRefreshAll) eventBus.off(Events.REFRESH_ALL, this._onRefreshAll);
  },

  onPullDownRefresh: function () {
    this.loadList(true).finally(function () { wx.stopPullDownRefresh(); });
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadList(false);
    }
  },

  onSearchInput: function (e) {
    this.setData({ searchText: e.detail.value });
  },

  onSearchConfirm: function () {
    this.loadList(true);
  },

  onSearchClear: function () {
    this.setData({ searchText: '' });
    this.loadList(true);
  },

  onTypeChange: function (e) {
    const idx = Number(e.detail.value);
    this.setData({
      typeIndex: idx,
      typeValue: TYPE_OPTIONS[idx].value,
    });
    this.loadList(true);
  },

  onStatusChange: function (e) {
    const idx = Number(e.detail.value);
    this.setData({
      statusIndex: idx,
      statusValue: STATUS_OPTIONS[idx].value,
    });
    this.loadList(true);
  },

  loadList: function (reset) {
    const that = this;
    const page = reset ? 1 : this.data.page;
    if (reset) {
      this.setData({ loading: true, list: [], page: 1, hasMore: true });
    }

    const params = {
      page: page,
      pageSize: this.data.pageSize,
      keyword: this.data.searchText || '',
      materialType: this.data.typeValue || '',
    };
    if (this.data.statusValue === 'enabled') {
      params.disabled = '0';
    } else if (this.data.statusValue === 'disabled') {
      params.disabled = '1';
    }

    return api.material.listDatabase(params).then(function (res) {
      const records = (res.records || res.data?.records || res || []).map(function (item) {
        return {
          ...item,
          _image: item.image ? getAuthedImageUrl(item.image) : '',
          _typeColor: TYPE_COLOR_MAP[item.materialType] || 'var(--color-text-tertiary)',
          _unitPrice: item.unitPrice != null ? item.unitPrice : '--',
          _createTime: item.createTime ? String(item.createTime).replace('T', ' ').substring(0, 10) : '--',
          _enabled: item.disabled ? false : true,
        };
      });

      const total = Number(res.total || res.data?.total || records.length || 0);
      const newList = reset ? records : that.data.list.concat(records);
      // 统一在最后按当前语言展开带参文案（_decorateList 是幂等的，重复展开不会叠加）
      const decorated = that._decorateList(newList, that._lang);

      that.setData({
        list: decorated,
        total: total,
        page: page + 1,
        hasMore: decorated.length < total,
        loading: false,
      });
      that._refreshTotalText();
    }).catch(function (err) {
      console.warn('[material-database] loadList failed:', err);
      that.setData({ loading: false });
      wx.showToast({ title: i18n.t('common.loadFailed', that._lang), icon: 'none' });
    });
  },

  onItemTap: function (e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find(function (it) { return it.id === id; });
    if (!item) return;
    this.setData({ selectedItem: item, detailVisible: true });
  },

  onCloseDetail: function () {
    this.setData({ detailVisible: false, selectedItem: null });
  },

  onCallSupplier: function () {
    const phone = this.data.selectedItem?.supplierContactPhone;
    if (!phone) {
      wx.showToast({ title: i18n.t('mp.warehouse.materialDatabase.noPhone', this._lang), icon: 'none' });
      return;
    }
    wx.makePhoneCall({
      phoneNumber: phone,
      fail: function () { wx.showToast({ title: i18n.t('mp.warehouse.materialDatabase.callFailed'), icon: 'none' }); },
    });
  },

  preventTouchMove: function () {},

  /* ── D-533：可搜索选择器（原生 picker 没有搜索，选项多时只能一路滚）────────
     由 scripts/codemod-search-picker.py 注入，各页面内容一致。
     选中后回调页面原有的 onXxxChange（e.detail.value 为下标），既有逻辑不变。 */

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
      pickerTitle: ds.title || i18n.t('common.pleaseSelect', this._lang || i18n.getLanguage()),
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
