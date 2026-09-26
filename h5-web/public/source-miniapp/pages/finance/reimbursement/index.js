/**
 * 费用报销处理页（D-417 手机端独立处理页 · D-419 卡片重构）
 *
 * 与 PC 端 ExpenseReimbursement 页同源接口，补齐手机端「基本无处理能力」。
 * 状态链：pending(待审批) → approved(已批准) → paid(已付款)
 *                     ↘ rejected(已驳回)
 *
 * 权限：仅内部管理员/主管可审批；工厂（外部）账号不参与租户财务，直接拦截。
 */
const i18n = require('../../../utils/i18n/index');
const NS = 'mp.reimbursement.';
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { hasFeaturePermission, isFactoryAccount } = require('../../../utils/permission');
const { decodeParam } = require('../../../utils/urlParams');

// D-419：颜色统一为实底 status-badge 用色
var STATUS_TEXT_MAP = {
  pending: 'stPending', approved: 'stApproved',
  rejected: 'stRejected', paid: 'stPaid',
};
var STATUS_CLS_MAP = {
  pending: 'tag-orange',
  approved: 'tag-green',
  rejected: 'tag-red',
  paid: 'tag-green',
};
var STATUS_COLOR_MAP = {
  pending: 'var(--color-warning)',
  approved: 'var(--color-success)',
  rejected: 'var(--color-danger)',
  paid: 'var(--color-success)',
};

var STATUS_MAP = {};
Object.keys(STATUS_TEXT_MAP).forEach(function (k) {
  STATUS_MAP[k] = { text: STATUS_TEXT_MAP[k], cls: STATUS_CLS_MAP[k] };
});

function statusText(s, lang) {
  var key = STATUS_TEXT_MAP[s];
  return key ? i18n.t(NS + key, lang) : (s || '—');
}
function statusCls(s) { return STATUS_CLS_MAP[s] || 'tag-gray'; }
function statusColor(s) { return STATUS_COLOR_MAP[s] || 'var(--color-text-tertiary)'; }

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
    blocked: false,
    blockedMsg: '',
    showActionSheet: false,
    current: null,
    currentCanApprove: false,
    currentCanPay: false,
    STATUS_MAP: {},  // applyLanguage 重建（text 已解析为语言文案）
    STATUS_OPTIONS: [],  // applyLanguage 重建
  },

  _STATUS_OPTIONS: [
    { value: '', key: 'filterAllStatus' },
    { value: 'pending', key: 'stPending' },
    { value: 'approved', key: 'stApproved' },
    { value: 'paid', key: 'stPaid' },
    { value: 'rejected', key: 'stRejected' },
  ],

  /** 静态文案按语言写入（wxml 用 {{t.xxx}}），状态筛选重建 */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        navTitle: i18n.t(NS + 'navTitle', lang),
        applicantLabel: i18n.t(NS + 'applicantLabel', lang),
        approveBtn: i18n.t(NS + 'approveBtn', lang),
        rejectBtn: i18n.t(NS + 'rejectBtn', lang),
        payBtn: i18n.t(NS + 'payBtn', lang),
        detailBtn: i18n.t(NS + 'detailBtn', lang),
        payTitle: i18n.t(NS + 'payTitle', lang),
        searchPhW: i18n.t(NS + 'searchPhW', lang),
        filterAllW: i18n.t(NS + 'filterAllStatus', lang),
        noSheets: i18n.t(NS + 'noSheets', lang),
        approveText: i18n.t(NS + 'approveText', lang),
        auditedPrefix: i18n.t(NS + 'auditedPrefix', lang),
        linkedPrefix: i18n.t(NS + 'linkedPrefix', lang),
        noMoreW: i18n.t(NS + 'noMoreW', lang),
        opTitle: i18n.t(NS + 'opTitle', lang),
      },
      STATUS_OPTIONS: this._STATUS_OPTIONS.map(function (o) {
        return { value: o.value, label: i18n.t(NS + o.key, lang) };
      }),
      STATUS_MAP: (function () {
        var m = {};
        Object.keys(STATUS_TEXT_MAP).forEach(function (k) {
          m[k] = { text: i18n.t(NS + STATUS_TEXT_MAP[k], lang), cls: STATUS_CLS_MAP[k] };
        });
        return m;
      })(),
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onLoad: function (options) {
    this.applyLanguage(i18n.getLanguage());
    var opts = options || {};
    if (isFactoryAccount()) {
      this.setData({
        blocked: true,
        blockedMsg: i18n.t(NS + 'factoryPermHint', this._lang || i18n.getLanguage()),
        canOperate: false,
      });
      return;
    }
    this.setData({
      canOperate: hasFeaturePermission('approve_expense'),
      statusFilter: opts.status || '',
      keyword: decodeParam(opts.keyword),
    });
  },

  onShow: function () {
    if (this.data.blocked) return;
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._resetAndLoad();
  },

  onPullDownRefresh: function () {
    if (this.data.blocked) { wx.stopPullDownRefresh(); return; }
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

    return api.expenseReimbursement.list(params).then(function (res) {
      var records = (res && res.records) || [];
      var total = (res && res.total) || 0;
      var enriched = records.map(function (r) {
        r.statusText = statusText(r.status);
        r.statusCls = statusCls(r.status);
        r._statusColor = statusColor(r.status);
        r.amountStr = r.amount != null ? Number(r.amount).toFixed(2) : '0.00';
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
      toast(i18n.t(NS + 'loadFailPrefix', this._lang) + (e.errMsg || e.message || e));
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
    this.setData({ statusFilter: this._STATUS_OPTIONS[idx].value });
    this._resetAndLoad();
  },

  /**
   * D-419：点击卡片 → 默认仅展示操作面板（如未来加详情页则改为跳转）
   */
  onTapItem: function (e) {
    var idx = e.currentTarget.dataset.index;
    var item = this.data.list[idx];
    if (!item) return;
    this.setData({
      current: item,
      showActionSheet: true,
      currentCanApprove: !!(this.data.canOperate && item.status === 'pending'),
      currentCanPay: !!(this.data.canOperate && item.status === 'approved'),
    });
  },

  /**
   * D-419：卡片右下「批准」按钮（单次确认即执行，不再走弹面板）
   */
  onActionApproveInline: function (e) {
    var that = this;
    var idx = e.currentTarget.dataset.index;
    var item = this.data.list[idx];
    if (!item) return;
    wx.showModal({
      title: i18n.t(NS + 'approveTitle', this._lang),
      content: i18n.tf(NS + 'approveFmt', { amount: Number(item.amount || 0).toFixed(2) }, this._lang),
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: i18n.t('mp.taskDetail.handlingTxt', this._lang), mask: true });
        api.expenseReimbursement.approve(item.id, 'approve', '').then(function () {
          wx.hideLoading();
          toast(i18n.t(NS + 'stApproved', this._lang));
          that._resetAndLoad();
        }).catch(function (e) {
          wx.hideLoading();
          toast(i18n.t(NS + 'approveFailPrefix', this._lang) + (e.errMsg || e.message || e));
        });
      },
    });
  },

  /**
   * D-419：卡片右下「驳回」按钮（需填理由）
   */
  onActionRejectInline: function (e) {
    var that = this;
    var idx = e.currentTarget.dataset.index;
    var item = this.data.list[idx];
    if (!item) return;
    wx.showModal({
      title: i18n.t(NS + 'rejectBtn', this._lang),
      content: '',
      editable: true,
      placeholderText: i18n.t(NS + 'rejectReasonReq', this._lang),
      success: function (res) {
        if (!res.confirm) return;
        var remark = (res.content || '').trim();
        if (!remark) { toast(i18n.t(NS + 'rejectReasonReq', this._lang)); return; }
        wx.showLoading({ title: i18n.t('mp.taskDetail.handlingTxt', this._lang), mask: true });
        api.expenseReimbursement.approve(item.id, 'reject', remark).then(function () {
          wx.hideLoading();
          toast(i18n.t(NS + 'stRejected', this._lang));
          that._resetAndLoad();
        }).catch(function (e) {
          wx.hideLoading();
          toast(i18n.t(NS + 'opFailPrefix', this._lang) + (e.errMsg || e.message || e));
        });
      },
    });
  },

  /**
   * D-419：卡片右下「确认付款」按钮
   */
  onActionPayInline: function (e) {
    var that = this;
    var idx = e.currentTarget.dataset.index;
    var item = this.data.list[idx];
    if (!item) return;
    wx.showModal({
      title: i18n.t(NS + 'payTitle', this._lang),
      content: i18n.tf(NS + 'payFmt', { name: item.applicantName || i18n.t(NS + 'applicantLabel', this._lang), amount: Number(item.amount || 0).toFixed(2) }, this._lang),
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: i18n.t('mp.taskDetail.handlingTxt', this._lang), mask: true });
        api.expenseReimbursement.pay(item.id, '').then(function () {
          wx.hideLoading();
          toast(i18n.t(NS + 'payConfirmed', this._lang));
          that._resetAndLoad();
        }).catch(function (e) {
          wx.hideLoading();
          toast(i18n.t(NS + 'opFailPrefix', this._lang) + (e.errMsg || e.message || e));
        });
      },
    });
  },

  /**
   * 兼容路径：弹面板里的批准 / 驳回 / 付款（已废弃，推荐走卡片右下角 inline 按钮）
   */
  onActionApprove: function () {
    var that = this;
    var item = this.data.current;
    if (!item) return;
    wx.showModal({
      title: i18n.t(NS + 'approveTitle', this._lang),
      content: i18n.tf(NS + 'approveFmt', { amount: Number(item.amount || 0).toFixed(2) }, this._lang),
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: i18n.t('mp.taskDetail.handlingTxt', this._lang), mask: true });
        api.expenseReimbursement.approve(item.id, 'approve', '').then(function () {
          wx.hideLoading();
          toast(i18n.t(NS + 'stApproved', this._lang));
          that.setData({ showActionSheet: false, current: null });
          that._resetAndLoad();
        }).catch(function (e) {
          wx.hideLoading();
          toast(i18n.t(NS + 'approveFailPrefix', this._lang) + (e.errMsg || e.message || e));
        });
      },
    });
  },
  onActionReject: function () {
    var that = this;
    var item = this.data.current;
    if (!item) return;
    wx.showModal({
      title: i18n.t(NS + 'rejectBtn', this._lang),
      content: '',
      editable: true,
      placeholderText: i18n.t(NS + 'rejectReasonReq', this._lang),
      success: function (res) {
        if (!res.confirm) return;
        var remark = (res.content || '').trim();
        if (!remark) { toast(i18n.t(NS + 'rejectReasonReq', this._lang)); return; }
        wx.showLoading({ title: i18n.t('mp.taskDetail.handlingTxt', this._lang), mask: true });
        api.expenseReimbursement.approve(item.id, 'reject', remark).then(function () {
          wx.hideLoading();
          toast(i18n.t(NS + 'stRejected', this._lang));
          that.setData({ showActionSheet: false, current: null });
          that._resetAndLoad();
        }).catch(function (e) {
          wx.hideLoading();
          toast(i18n.t(NS + 'opFailPrefix', this._lang) + (e.errMsg || e.message || e));
        });
      },
    });
  },
  onActionPay: function () {
    var that = this;
    var item = this.data.current;
    if (!item) return;
    wx.showModal({
      title: i18n.t(NS + 'payTitle', this._lang),
      content: i18n.tf(NS + 'payFmt', { name: item.applicantName || i18n.t(NS + 'applicantLabel', this._lang), amount: Number(item.amount || 0).toFixed(2) }, this._lang),
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: i18n.t('mp.taskDetail.handlingTxt', this._lang), mask: true });
        api.expenseReimbursement.pay(item.id, '').then(function () {
          wx.hideLoading();
          toast(i18n.t(NS + 'payConfirmed', this._lang));
          that.setData({ showActionSheet: false, current: null });
          that._resetAndLoad();
        }).catch(function (e) {
          wx.hideLoading();
          toast(i18n.t(NS + 'opFailPrefix', this._lang) + (e.errMsg || e.message || e));
        });
      },
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