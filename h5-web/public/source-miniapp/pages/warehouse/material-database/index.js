const api = require('../../../utils/api');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { eventBus, Events } = require('../../../utils/eventBus');

const TYPE_OPTIONS = [
  { label: '全部类型', value: '' },
  { label: '面料', value: 'fabric' },
  { label: '里料', value: 'lining' },
  { label: '辅料', value: 'accessory' },
];

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '启用', value: 'enabled' },
  { label: '停用', value: 'disabled' },
];

const TYPE_LABEL_MAP = {
  fabric: '面料',
  lining: '里料',
  accessory: '辅料',
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
    typeOptions: TYPE_OPTIONS,
    statusOptions: STATUS_OPTIONS,
    typeIndex: 0,
    statusIndex: 0,

    selectedItem: null,
    detailVisible: false,
  },

  onLoad: function (options) {
    // D-514：支持 ?keyword=xxx 直接定位到某个物料（从物料中心点卡片进来时用）
    if (options && options.keyword) {
      this.setData({ searchText: String(options.keyword) });
    }
    this.loadList(true);
  },

  onShow: function () {
    this._bindEvents();
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
          _typeLabel: TYPE_LABEL_MAP[item.materialType] || item.materialType || '未分类',
          _typeColor: TYPE_COLOR_MAP[item.materialType] || 'var(--color-text-tertiary)',
          _unitPrice: item.unitPrice != null ? item.unitPrice : '--',
          _createTime: item.createTime ? String(item.createTime).replace('T', ' ').substring(0, 10) : '--',
          _enabled: item.disabled ? false : true,
        };
      });

      const total = Number(res.total || res.data?.total || records.length || 0);
      const newList = reset ? records : that.data.list.concat(records);

      that.setData({
        list: newList,
        total: total,
        page: page + 1,
        hasMore: newList.length < total,
        loading: false,
      });
    }).catch(function (err) {
      console.warn('[material-database] loadList failed:', err);
      that.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
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
      wx.showToast({ title: '暂无联系电话', icon: 'none' });
      return;
    }
    wx.makePhoneCall({
      phoneNumber: phone,
      fail: function () { wx.showToast({ title: '拨号失败', icon: 'none' }); },
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
      pickerTitle: ds.title || '请选择',
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
