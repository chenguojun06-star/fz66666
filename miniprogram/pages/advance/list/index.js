const i18n = require('../../../utils/i18n/index');
const NS = 'mp.advance.';
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { isAdminOrSupervisor, hasFeaturePermission } = require('../../../utils/permission');
const displayHelper = require('../../../utils/displayHelper');

// wxml 通过 STATUS_MAP[statusFilter].text / DEDUCT_MAP[repayFilter].text 显示筛选器选中项文案，
// 故保留 {text, cls} 结构；文案走 displayHelper，cls（tag-* 类名）保留本地映射以兼容 wxml
var STATUS_CLS_MAP = { pending: 'tag-orange', approved: 'tag-green', rejected: 'tag-red' };
var DEDUCT_CLS_MAP = { unrepaid: 'tag-red', partial: 'tag-orange', repaid: 'tag-green' };

var STATUS_MAP = {
  pending: { text: displayHelper.ADVANCE_STATUS_LABEL.pending, cls: STATUS_CLS_MAP.pending },
  approved: { text: displayHelper.ADVANCE_STATUS_LABEL.approved, cls: STATUS_CLS_MAP.approved },
  rejected: { text: displayHelper.ADVANCE_STATUS_LABEL.rejected, cls: STATUS_CLS_MAP.rejected },
};

var DEDUCT_MAP = {
  unrepaid: { text: displayHelper.ADVANCE_DEDUCT_LABEL.unrepaid, cls: DEDUCT_CLS_MAP.unrepaid },
  partial:  { text: displayHelper.ADVANCE_DEDUCT_LABEL.partial, cls: DEDUCT_CLS_MAP.partial },
  repaid:   { text: displayHelper.ADVANCE_DEDUCT_LABEL.repaid, cls: DEDUCT_CLS_MAP.repaid },
};

function statusText(s) { if (!s) return ''; return displayHelper.displayAdvanceStatusText(s); }
function statusCls(s) { return STATUS_CLS_MAP[s] || 'tag-gray'; }
function deductText(s) { if (!s) return ''; return displayHelper.displayAdvanceDeductStatusText(s); }
function deductCls(s) { return DEDUCT_CLS_MAP[s] || 'tag-gray'; }

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
    statusFilter: '',
    repayFilter: '',
    keyword: '',
    showCreateModal: false,
    showActionSheet: false,
    currentAdvance: null,
    createForm: { employeeName: '', amount: '', reason: '', orderNo: '' },
    canApprove: false,
    STATUS_MAP: STATUS_MAP,
    DEDUCT_MAP: DEDUCT_MAP,
    STATUS_OPTIONS: [
      { value: '', label: '全部状态' },
      { value: 'pending', label: displayHelper.ADVANCE_STATUS_LABEL.pending },
      { value: 'approved', label: displayHelper.ADVANCE_STATUS_LABEL.approved },
      { value: 'rejected', label: displayHelper.ADVANCE_STATUS_LABEL.rejected },
    ],
    REPAY_OPTIONS: [
      { value: '', label: '全部扣款' },
      { value: 'unrepaid', label: displayHelper.ADVANCE_DEDUCT_LABEL.unrepaid },
      { value: 'partial', label: displayHelper.ADVANCE_DEDUCT_LABEL.partial },
      { value: 'repaid', label: displayHelper.ADVANCE_DEDUCT_LABEL.repaid },
    ],
  },

  _STATUS_OPTIONS: [
    { value: '', label: '全部状态' },
    { value: 'pending', label: displayHelper.ADVANCE_STATUS_LABEL.pending },
    { value: 'approved', label: displayHelper.ADVANCE_STATUS_LABEL.approved },
    { value: 'rejected', label: displayHelper.ADVANCE_STATUS_LABEL.rejected },
  ],
  _REPAY_OPTIONS: [
    { value: '', label: '全部扣款' },
    { value: 'unrepaid', label: displayHelper.ADVANCE_DEDUCT_LABEL.unrepaid },
    { value: 'partial', label: displayHelper.ADVANCE_DEDUCT_LABEL.partial },
    { value: 'repaid', label: displayHelper.ADVANCE_DEDUCT_LABEL.repaid },
  ],

  /** 静态文案按语言写入；状态/扣款映射与筛选选项按语言重建 */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    var statusMap = {};
    Object.keys(STATUS_MAP).forEach(function (k) {
      statusMap[k] = { text: i18n.t(NS + 'adv' + k.charAt(0).toUpperCase() + k.slice(1), lang), cls: STATUS_MAP[k].cls };
    });
    var deductMap = {};
    Object.keys(DEDUCT_MAP).forEach(function (k) {
      var keyMap = { unrepaid: 'deductUnrepaid', partial: 'deductPartial', repaid: 'deductRepaid' };
      deductMap[k] = { text: i18n.t(NS + keyMap[k], lang), cls: DEDUCT_MAP[k].cls };
    });
    var statusOpts = [{ value: '', label: i18n.t(NS + 'filterAllStatus', lang) }].concat(
      ['pending', 'approved', 'rejected'].map(function (k) {
        return { value: k, label: statusMap[k].text };
      })
    );
    var repayOpts = [{ value: '', label: i18n.t(NS + 'filterAllDeduct', lang) }].concat(
      ['unrepaid', 'partial', 'repaid'].map(function (k) {
        return { value: k, label: deductMap[k].text };
      })
    );
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        navTitle: i18n.t(NS + 'navTitle', lang),
        tapToAudit: i18n.t(NS + 'tapToAudit', lang),
        approvePassW: i18n.t(NS + 'approvePassW', lang),
        rejectBtn: i18n.t(NS + 'rejectBtn', lang),
        applyBtn: i18n.t(NS + 'applyBtn', lang),
        employeeLabel: i18n.t(NS + 'employeeLabel', lang),
        amountLabel: i18n.t(NS + 'amountLabel', lang),
        reasonLabel: i18n.t(NS + 'reasonLabel', lang),
        orderNoLabel: i18n.t(NS + 'orderNoLabel', lang),
        submitBtn: i18n.t(NS + 'submitBtn', lang),
        cancelBtn: i18n.t(NS + 'cancelBtn', lang),
        searchEmpPh: i18n.t(NS + 'searchEmpPh', lang),
        noRecords: i18n.t(NS + 'noRecords', lang),
        remainingW: i18n.t(NS + 'remainingW', lang),
        noMoreW: i18n.t(NS + 'noMoreW', lang),
        opTitle: i18n.t(NS + 'opTitle', lang),
        empNamePh: i18n.t(NS + 'empNamePh', lang),
        amountPh: i18n.t(NS + 'amountPh', lang),
        reasonPh: i18n.t(NS + 'reasonPh', lang),
        optionalPh: i18n.t(NS + 'optionalPh', lang),
        filterAllStatus: i18n.t(NS + 'filterAllStatus', lang),
        filterAllDeduct: i18n.t(NS + 'filterAllDeduct', lang),
      },
      STATUS_MAP: statusMap,
      DEDUCT_MAP: deductMap,
      STATUS_OPTIONS: statusOpts,
      REPAY_OPTIONS: repayOpts,
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onLoad: function () {
    this.applyLanguage(i18n.getLanguage());
    this.setData({ canApprove: isAdminOrSupervisor() });
  },

  onShow: function () {
    const app = getApp();
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
    const that = this;
    this.setData({ loading: true });
    const params = {
      page: this.data.page,
      pageSize: this.data.pageSize,
    };
    if (this.data.statusFilter) params.status = this.data.statusFilter;
    if (this.data.repayFilter) params.repaymentStatus = this.data.repayFilter;
    if (this.data.keyword) params.employeeName = this.data.keyword;

    return api.employeeAdvance.list(params).then(function (res) {
      const records = (res && res.records) || [];
      const total = (res && res.total) || 0;
      const enriched = records.map(function (r) {
        r.statusText = statusText(r.status);
        r.statusCls = statusCls(r.status);
        r.repayText = deductText(r.repaymentStatus);
        r.repayCls = deductCls(r.repaymentStatus);
        r.amountStr = r.amount != null ? Number(r.amount).toFixed(2) : '0.00';
        r.remainingStr = r.remainingAmount != null ? Number(r.remainingAmount).toFixed(2) : '0.00';
        r.repaymentStr = r.repaymentAmount != null ? Number(r.repaymentAmount).toFixed(2) : '0.00';
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
      toast(i18n.t(NS + 'loadFailPrefix', this._lang) + (e.message || e));
    });
  },

  onStatusFilterChange: function (e) {
    const idx = Number(e.detail.value);
    this.setData({ statusFilter: this._STATUS_OPTIONS[idx].value });
    this._resetAndLoad();
  },

  onRepayFilterChange: function (e) {
    const idx = Number(e.detail.value);
    this.setData({ repayFilter: this._REPAY_OPTIONS[idx].value });
    this._resetAndLoad();
  },

  onKeywordInput: function (e) {
    this.setData({ keyword: e.detail.value });
  },

  onKeywordSearch: function () {
    this._resetAndLoad();
  },

  onClearSearch: function () {
    this.setData({ keyword: '' });
    this._resetAndLoad();
  },

  onTapCreate: function () {
    this.setData({ showCreateModal: true, createForm: { employeeName: '', amount: '', reason: '', orderNo: '' } });
  },

  onCreateFieldInput: function (e) {
    const field = e.currentTarget.dataset.field;
    const form = this.data.createForm;
    form[field] = e.detail.value;
    this.setData({ createForm: form });
  },

  onSubmitCreate: function () {
    const form = this.data.createForm;
    if (!form.employeeName || !form.employeeName.trim()) { toast(i18n.t(NS + 'employeeNameReq', this._lang)); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast(i18n.t(NS + 'invalidAmount', this._lang)); return; }
    if (!form.reason || !form.reason.trim()) { toast(i18n.t(NS + 'reasonReq', this._lang)); return; }
    const that = this;
    api.employeeAdvance.create({
      employeeName: form.employeeName.trim(),
      amount: Number(form.amount),
      reason: form.reason.trim(),
      orderNo: (form.orderNo || '').trim(),
    }).then(function () {
      toast(i18n.t(NS + 'applyOk', this._lang));
      that.setData({ showCreateModal: false });
      that._resetAndLoad();
    }).catch(function (e) { toast(i18n.t(NS + 'applyFailPrefix', this._lang) + (e.message || e)); });
  },

  onCancelCreate: function () {
    this.setData({ showCreateModal: false });
  },

  onTapItem: function (e) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.list[idx];
    if (!item) return;
    this.setData({ currentAdvance: item, showActionSheet: true });
  },

  onActionApprove: function () {
    if (!hasFeaturePermission('approve_advance')) { toast(i18n.t(NS + 'noApprovePerm', this._lang)); return; }
    const item = this.data.currentAdvance;
    if (!item || item.status !== 'pending') return;
    const that = this;
    wx.showModal({ title: i18n.t(NS + 'approveTitle', this._lang), content: i18n.t(NS + 'approveConfirm', this._lang), success: function (res) {
      if (!res.confirm) return;
      api.employeeAdvance.approve(item.id).then(function () {
        toast(i18n.t(NS + 'approveOk', this._lang));
        that.setData({ showActionSheet: false, currentAdvance: null });
        that._resetAndLoad();
      }).catch(function (e) { toast(i18n.t(NS + 'approveFailPrefix', this._lang) + (e.message || e)); });
    }});
  },

  onActionReject: function () {
    const item = this.data.currentAdvance;
    if (!item || item.status !== 'pending') return;
    const that = this;
    wx.showModal({ title: i18n.t(NS + 'rejectTitle', this._lang), content: i18n.t(NS + 'rejectConfirm', this._lang), editable: true, placeholderText: i18n.t(NS + 'rejectReasonOpt', this._lang), success: function (res) {
      if (!res.confirm) return;
      api.employeeAdvance.reject(item.id, res.content || '').then(function () {
        toast(i18n.t(NS + 'rejected', this._lang));
        that.setData({ showActionSheet: false, currentAdvance: null });
        that._resetAndLoad();
      }).catch(function (e) { toast(i18n.t(NS + 'rejectFailPrefix', this._lang) + (e.message || e)); });
    }});
  },

  onCloseActionSheet: function () {
    this.setData({ showActionSheet: false, currentAdvance: null });
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
      pickerTitle: ds.title || i18n.t('common.pleaseSelect', this._lang),
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
