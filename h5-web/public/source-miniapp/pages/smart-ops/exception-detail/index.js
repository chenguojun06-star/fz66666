/**
 * 生产异常报告处理页（D-417 手机端独立处理页）
 *
 * 补齐「异常报告手机端只能看、无法处理」的缺口。
 * 配套后端：
 *   GET  /api/production/exception/list          列表
 *   POST /api/production/exception/{id}/handle   处理（resolve 已解决 / reopen 重新打开）
 *
 * 状态：PENDING=待处理 → RESOLVED=已解决（可 reopen 回退）
 * 权限：仅主管及以上可处理（后端 UserContext.isSupervisorOrAbove 校验，前端同步只对该角色显示按钮）
 * 内外部：工厂账号由后端按「本工厂订单」过滤，只能看到自己厂的异常，不在此页拦截。
 */
const i18n = require('../../../utils/i18n/index');

const NS = 'mp.smartOpsException.';

const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { hasFeaturePermission } = require('../../../utils/permission');

// code → 语言包键名（状态码保持英文，显示文案由 applyLanguage 生成）
var STATUS_KEYS = { PENDING: 'statusPending', RESOLVED: 'statusResolved' };
var STATUS_CLS = { PENDING: 'tag-orange', RESOLVED: 'tag-green' };
function buildStatusMap(lang) {
  var m = {};
  Object.keys(STATUS_KEYS).forEach(function (k) {
    m[k] = { text: i18n.t(NS + STATUS_KEYS[k], lang), cls: STATUS_CLS[k] };
  });
  return m;
}

// 异常类型（与后端 mapExceptionType 对齐）
var TYPE_KEYS = {
  MATERIAL_SHORTAGE: 'typeMaterialShortage',
  MACHINE_FAULT: 'typeMachineFault',
  NEED_HELP: 'typeNeedHelp',
};

function statusText(s, lang) {
  var k = String(s || '').toUpperCase();
  return STATUS_KEYS[k] ? i18n.t(NS + STATUS_KEYS[k], lang) : (s || '—');
}
function statusCls(s) {
  var k = String(s || '').toUpperCase();
  return STATUS_CLS[k] || 'tag-gray';
}

Page({
  data: {

    // D-533：可搜索选择器状态（原生 picker 没有搜索）

    pickerVisible: false,

    pickerTitle: '',

    pickerOptions: [],

    pickerValue: '',
    list: [],
    loading: false,
    page: 1,
    pageSize: 20,
    hasMore: true,
    keyword: '',
    statusFilter: '',
    canOperate: false,
    showActionSheet: false,
    current: null,
    currentCanResolve: false,
    currentCanReopen: false,
    STATUS_MAP: {},
    t: {},
    // value 是后端状态码（英文），label 由 applyLanguage 生成
    STATUS_OPTIONS: [],
  },

  /** 应用语言 */
  applyLanguage(language) {
    const lang = language || i18n.getLanguage();
    this._lang = lang;
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({
      t: {
        searchPlaceholder: t('searchPlaceholder'),
        emptyReports: t('emptyReports'),
        tapHandle: t('tapHandle'),
        loadingMore: t('loadingMore'),
        noMore: t('noMore'),
        resolveBtn: t('resolveBtn'),
        reopenBtn: t('reopenBtn'),
        supervisorOnly: t('supervisorOnly'),
        handlePrefix: t('handlePrefix'),
        reportPrefix: t('reportPrefix'),
        cancel: i18n.t('common.cancel', lang),
        allStatus: i18n.t('mp.smartOpsException.allStatus', lang),
      },
      // 状态映射与筛选选项必须整体重建
      STATUS_MAP: buildStatusMap(lang),
      STATUS_OPTIONS: [
        { value: '', label: t('allStatus') },
        { value: 'PENDING', label: t('statusPending') },
        { value: 'RESOLVED', label: t('statusResolved') },
      ],
      // 列表里已生成的状态/类型文案跟着语言重算
      list: (this.data.list || []).map((it) => {
        const tk = TYPE_KEYS[String(it.exceptionType || '').toUpperCase()];
        return {
          ...it,
          statusText: statusText(it.status, lang),
          typeText: tk ? i18n.t(NS + tk, lang) : (it.exceptionType || t('unknownException')),
        };
      }),
    });
    wx.setNavigationBarTitle({ title: t('navTitle') });
  },

  onShow() {
    this.applyLanguage(i18n.getLanguage());
  },

  onLoad: function (options) {
    var opts = options || {};
    this.setData({
      canOperate: hasFeaturePermission('handle_exception'),
      statusFilter: opts.status || '',
      keyword: opts.keyword ? decodeURIComponent(opts.keyword) : '',
    });
  },

  onShow: function () {
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._resetAndLoad();
  },

  onPullDownRefresh: function () {
    this._resetAndLoad().finally(function () { wx.stopPullDownRefresh(); });
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) this._loadData();
  },

  _resetAndLoad: function () {
    this.setData({ page: 1, list: [], hasMore: true });
    return this._loadData();
  },

  _loadData: function () {
    if (this.data.loading) return Promise.resolve();
    var that = this;
    this.setData({ loading: true });
    var params = { page: this.data.page, pageSize: this.data.pageSize };
    if (this.data.statusFilter) params.status = this.data.statusFilter;
    if (this.data.keyword) params.keyword = this.data.keyword;

    return api.production.listExceptions(params).then(function (res) {
      var records = (res && res.records) || [];
      var total = (res && res.total) || 0;
      var enriched = records.map(function (r) {
        var st = String(r.status || 'PENDING').toUpperCase();
        r.statusText = statusText(st);
        r.statusCls = statusCls(st);
        var tk = TYPE_KEYS[String(r.exceptionType || '').toUpperCase()];
        r.typeText = tk ? i18n.t(NS + tk, that._lang) : (r.exceptionType || i18n.t(NS + 'unknownException', that._lang));
        r.isPending = st === 'PENDING';
        r.createTimeText = r.createTime ? String(r.createTime).replace('T', ' ').slice(0, 16) : '';
        r.handleTimeText = r.handleTime ? String(r.handleTime).replace('T', ' ').slice(0, 16) : '';
        return r;
      });
      that.setData({
        list: that.data.list.concat(enriched),
        hasMore: that.data.list.length + records.length < total,
        page: that.data.page + 1,
        loading: false,
      });
    }).catch(function (e) {
      that.setData({ loading: false });
      toast(i18n.tf(NS + 'loadFailedFmt', { msg: e.errMsg || e.message || e }));
    });
  },

  onKeywordInput: function (e) {
    this.setData({ keyword: e.detail.value });
  },

  onKeywordSearch: function () {
    this._resetAndLoad();
  },

  onStatusFilterChange: function (e) {
    var idx = Number(e.detail.value);
    // 状态选项已改由 applyLanguage 按语言重建（data.STATUS_OPTIONS），value 仍是后端状态码
    this.setData({ statusFilter: this.data.STATUS_OPTIONS[idx].value });
    this._resetAndLoad();
  },

  onTapItem: function (e) {
    var idx = e.currentTarget.dataset.index;
    var item = this.data.list[idx];
    if (!item) return;
    this.setData({
      current: item,
      showActionSheet: true,
      currentCanResolve: !!(this.data.canOperate && item.isPending),
      currentCanReopen: !!(this.data.canOperate && !item.isPending),
    });
  },

  /**
   * 标记已解决（需填处理说明）
   */
  onActionResolve: function () {
    var item = this.data.current;
    if (!item) return;
    var that = this;
    wx.showModal({
      title: i18n.t(NS + 'resolveBtn'),
      content: '',
      editable: true,
      placeholderText: i18n.t(NS + 'handleNotePlaceholder'),
      success: function (res) {
        if (!res.confirm) return;
        var note = (res.content || '').trim();
        if (!note) { toast(i18n.t(NS + 'handleNoteRequired')); return; }
        that._submit(item.id, 'resolve', note, i18n.t(NS + 'resolvedToast'));
      },
    });
  },

  /**
   * 重新打开（误点恢复）
   */
  onActionReopen: function () {
    var item = this.data.current;
    if (!item) return;
    var that = this;
    wx.showModal({
      title: i18n.t(NS + 'reopenBtn'),
      content: i18n.t(NS + 'reopenConfirm'),
      success: function (res) {
        if (!res.confirm) return;
        that._submit(item.id, 'reopen', '', i18n.t(NS + 'reopenedToast'));
      },
    });
  },

  _submit: function (id, action, note, okText) {
    var that = this;
    wx.showLoading({ title: i18n.t(NS + 'handling'), mask: true });
    api.production.handleException(id, action, note).then(function () {
      wx.hideLoading();
      toast(okText);
      that.setData({ showActionSheet: false, current: null });
      that._resetAndLoad();
    }).catch(function (e) {
      wx.hideLoading();
      toast(i18n.tf(NS + 'opFailedFmt', { msg: e.errMsg || e.message || e }));
    });
  },

  onCloseActionSheet: function () {
    this.setData({ showActionSheet: false, current: null });
  },

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
