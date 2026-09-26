const i18n = require('../../../utils/i18n/index');
const NS = 'mp.payment.';
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { isAdminOrSupervisor, hasFeaturePermission } = require('../../../utils/permission');
const displayHelper = require('../../../utils/displayHelper');

var PAYMENT_METHOD_MAP = {
  OFFLINE: 'payMethodOffline',
  BANK: 'payMethodBank',
  WECHAT: 'payMethodWechat',
  ALIPAY: 'payMethodAlipay',
};

// label 由 applyLanguage 重建（PAYMENT_METHOD_MAP 存键后缀）
var PAYMENT_METHODS = [
  { value: 'OFFLINE' },
  { value: 'BANK' },
  { value: 'WECHAT' },
  { value: 'ALIPAY' },
];

var BIZ_TYPE_MAP = {
  PURCHASE: { key: 'bizPurchase', cls: 'tag-blue' },
  PROCESSING: { key: 'bizProcessing', cls: 'tag-orange' },
  LOGISTICS: { key: 'bizLogistics', cls: 'tag-green' },
  PAYROLL_SETTLEMENT: { key: 'bizPayrollSettle', cls: 'tag-blue' },
  ORDER_SETTLEMENT: { key: 'bizOrderSettle', cls: 'tag-green' },
  RECONCILIATION: { key: 'bizReconciliation', cls: 'tag-orange' },
  REIMBURSEMENT: { key: 'bizReimbursement', cls: 'tag-gray' },
  PAYROLL: { key: 'bizPayroll', cls: 'tag-blue' },
};

// wxml 模板依赖 tag-* CSS 类名（如 tag-orange），displayHelper 仅提供 CSS 变量颜色值，
// 故 cls 保留本地映射；文案统一走 displayHelper.displayPaymentStatusText
var PAYMENT_STATUS_CLS = {
  pending: 'tag-orange',
  processing: 'tag-orange',
  success: 'tag-green',
  failed: 'tag-red',
  cancelled: 'tag-gray',
  refunded: 'tag-orange',
};

function bizTypeText(s, lang) {
  var fb = BIZ_TYPE_MAP[s];
  return fb ? i18n.t(NS + fb.key, lang) : (s || '');
}
function bizTypeCls(s) { return (BIZ_TYPE_MAP[s] || {}).cls || 'tag-gray'; }
function paymentStatusText(s) { if (!s) return ''; return displayHelper.displayPaymentStatusText(s); }
function paymentStatusCls(s) { return PAYMENT_STATUS_CLS[s] || 'tag-gray'; }

Page({
  data: {

    // D-533：可搜索选择器状态（原生 picker 没有搜索）

    pickerVisible: false,

    pickerTitle: '',

    pickerOptions: [],

    pickerValue: '',
    activeTab: 0,
    pendingList: [],
    paymentList: [],
    loading: false,
    pendingPage: 1,
    paymentPage: 1,
    pageSize: 20,
    pendingHasMore: true,
    paymentHasMore: true,
    showPayModal: false,
    currentPayable: null,
    payForm: { amount: '', paymentMethod: 'OFFLINE', remark: '' },
    payeeAccounts: [],
    selectedAccountId: '',
    selectedAccountName: '',
    canPay: false,
    stats: null,
    paymentMethods: PAYMENT_METHODS,
    modalView: 'form',
    searchKeyword: '',
    searchResults: [],
    searching: false,
    newAccountForm: { accountName: '', accountNumber: '', bankName: '' },
  },

  /** 静态文案按语言写入（wxml 用 {{t.xxx}}），支付方式选项重建 */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        navTitle: i18n.t(NS + 'navTitle', lang),
        tabPending: i18n.t(NS + 'tabPending', lang),
        tabPaid: i18n.t(NS + 'tabPaid', lang),
        tabRecords: i18n.t(NS + 'tabRecords', lang),
        payableAmount: i18n.t(NS + 'payableAmount', lang),
        paidAmount: i18n.t(NS + 'paidAmount', lang),
        pendingAmount: i18n.t(NS + 'pendingAmount', lang),
        payBtnWord: i18n.t(NS + 'payBtnWord', lang),
        initiatePay: i18n.t(NS + 'initiatePay', lang),
        payeeLabel: i18n.t(NS + 'payeeLabel', lang),
        bizTypeLabel: i18n.t(NS + 'bizTypeLabel', lang),
        payAmountLabel: i18n.t(NS + 'payAmountLabel', lang),
        payMethodLabel: i18n.t(NS + 'payMethodLabel', lang),
        payAccountLabel: i18n.t(NS + 'payAccountLabel', lang),
        pickPayAccount: i18n.t(NS + 'pickPayAccount', lang),
        searchPayee: i18n.t(NS + 'searchPayee', lang),
        newAccountBtn: i18n.t(NS + 'newAccountBtn', lang),
        noPayeeMatch: i18n.t(NS + 'noPayeeMatch', lang),
        searchingTxt: i18n.t(NS + 'searchingTxt', lang),
        accountNameLabel: i18n.t(NS + 'accountNameLabel', lang),
        accountNoLabel: i18n.t(NS + 'accountNoLabel', lang),
        bankBranchLabel: i18n.t(NS + 'bankBranchLabel', lang),
        remarkLabel: i18n.t('common.remark', lang),
        confirmTextW: i18n.t(NS + 'confirmTextW', lang),
        searchWord: i18n.t('common.search', lang),
        saveWord: i18n.t('common.save', lang),
        cancel: i18n.t('common.cancel', lang),
        pieceUnit: i18n.t('common.piece', lang),
        noPendingPayable: i18n.t(NS + 'noPendingPayable', lang),
        linkedOrderPrefix: i18n.t(NS + 'linkedOrderPrefix', lang),
        noRecordsW: i18n.t(NS + 'noRecordsW', lang),
        payAmountPh: i18n.t(NS + 'payAmountPh', lang),
        payeeNamePh: i18n.t(NS + 'payeeNamePh', lang),
        accountNamePh: i18n.t(NS + 'accountNamePh', lang),
        accountNoPh: i18n.t(NS + 'accountNoPh', lang),
        bankBranchPh: i18n.t(NS + 'bankBranchPh', lang),
        noMoreW: i18n.t(NS + 'noMoreW', lang),
        optionalW: i18n.t('common.optional', lang),
      },
      paymentMethods: PAYMENT_METHODS.map(function (m) {
        return { value: m.value, label: i18n.t(NS + PAYMENT_METHOD_MAP[m.value], lang) };
      }),
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onLoad: function () {
    this.applyLanguage(i18n.getLanguage());
    this.setData({ canPay: isAdminOrSupervisor() });
  },

  onShow: function () {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._loadStats();
    this._resetAndLoad();
  },

  onPullDownRefresh: function () {
    this._loadStats();
    this._resetAndLoad().finally(function () { wx.stopPullDownRefresh(); });
  },

  onReachBottom: function () {
    if (this.data.activeTab === 0 && this.data.pendingHasMore) this._loadPending();
    else if (this.data.activeTab === 1 && this.data.paymentHasMore) this._loadPayments();
  },

  switchTab: function (e) {
    const tab = Number(e.currentTarget.dataset.tab);
    this.setData({ activeTab: tab });
  },

  _loadStats: function () {
    const that = this;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const today = y + '-' + m + '-' + d;
    const firstDay = y + '-' + m + '-01';
    api.wagePayment.dashboardStats(firstDay, today).then(function (stats) {
      that.setData({ stats: stats || {} });
    }).catch(function (err) {
      console.error('[payment] _loadStats failed', err);
    });
  },

  _resetAndLoad: function () {
    this.setData({ pendingPage: 1, paymentPage: 1, pendingList: [], paymentList: [], pendingHasMore: true, paymentHasMore: true });
    return Promise.all([this._loadPending(), this._loadPayments()]);
  },

  _loadPending: function () {
    if (this.data.loading) return Promise.resolve();
    const that = this;
    var lang = this._lang || i18n.getLanguage();
    this.setData({ loading: true });
    return api.wagePayment.listPendingPayables({ page: this.data.pendingPage, pageSize: this.data.pageSize }).then(function (res) {
      const records = (res && res.records) || res || [];
      const total = (res && res.total) || records.length;
      const enriched = records.map(function (r) {
        r.bizTypeText = bizTypeText(r.bizType, lang);
        r.bizTypeCls = bizTypeCls(r.bizType);
        r.remainingAmount = (r.amount || 0) - (r.paidAmount || 0);
        return r;
      });
      that.setData({
        pendingList: that.data.pendingList.concat(enriched),
        pendingHasMore: that.data.pendingList.length + records.length < total,
        pendingPage: that.data.pendingPage + 1,
        loading: false,
      });
    }).catch(function (_e) {
      that.setData({ loading: false });
    });
  },

  _loadPayments: function () {
    const that = this;
    return api.wagePayment.listPayments({ page: this.data.paymentPage, pageSize: this.data.pageSize }).then(function (res) {
      const records = (res && res.records) || res || [];
      const total = (res && res.total) || records.length;
      const enriched = records.map(function (r) {
        r.statusText = paymentStatusText(r.status);
        r.statusCls = paymentStatusCls(r.status);
        var pmKey = PAYMENT_METHOD_MAP[r.paymentMethod];
        r.paymentMethodText = pmKey ? i18n.t(NS + pmKey, this._lang || i18n.getLanguage()) : (r.paymentMethod || '');
        return r;
      });
      that.setData({
        paymentList: that.data.paymentList.concat(enriched),
        paymentHasMore: that.data.paymentList.length + records.length < total,
        paymentPage: that.data.paymentPage + 1,
      });
    }).catch(function (err) {
      console.error('[payment] _loadPayments failed', err);
    });
  },

  onOpenPayModal: function (e) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.pendingList[idx];
    if (!item) return;
    const remaining = item.remainingAmount || item.amount || 0;
    this.setData({
      showPayModal: true,
      currentPayable: item,
      payForm: { amount: String(remaining), paymentMethod: 'OFFLINE', remark: '' },
      payeeAccounts: [],
      selectedAccountId: '',
      selectedAccountName: '',
      modalView: 'form',
      searchKeyword: '',
      searchResults: [],
    });
    this._loadPayeeAccounts(item);
  },

  _loadPayeeAccounts: function (item) {
    if (!item || !item.payeeId) return;
    const that = this;
    api.wagePayment.listAccounts({ payeeId: item.payeeId, payeeType: item.payeeType }).then(function (res) {
      const accounts = Array.isArray(res) ? res : (res && res.records) || [];
      that.setData({ payeeAccounts: accounts });
    }).catch(function () {});
  },

  onPayAmountInput: function (e) {
    this.setData({ 'payForm.amount': e.detail.value });
  },

  onPayMethodSelect: function (e) {
    this.setData({ 'payForm.paymentMethod': e.currentTarget.dataset.value, selectedAccountId: '', selectedAccountName: '' });
  },

  onPayRemarkInput: function (e) {
    this.setData({ 'payForm.remark': e.detail.value });
  },

  onSelectAccount: function (e) {
    const idx = Number(e.detail.value);
    const accounts = this.data.payeeAccounts;
    if (accounts[idx]) {
      this.setData({ selectedAccountId: accounts[idx].id, selectedAccountName: accounts[idx].accountName || '' });
    }
  },

  onSubmitPay: function () {
    if (!hasFeaturePermission('initiate_payment')) { toast(i18n.t(NS + 'noPayPerm', this._lang)); return; }
    const item = this.data.currentPayable;
    if (!item) return;
    const amount = Number(this.data.payForm.amount);
    if (!amount || amount <= 0) { toast(i18n.t(NS + 'invalidAmount', this._lang)); return; }
    const remaining = item.remainingAmount || item.amount || 0;
    if (amount > remaining) { toast(i18n.t(NS + 'amountOverLimit', this._lang)); return; }
    const form = this.data.payForm;
    const payload = {
      payeeType: item.payeeType,
      payeeId: item.payeeId,
      payeeName: item.payeeName,
      paymentMethod: form.paymentMethod,
      amount: amount,
      bizType: item.bizType,
      bizId: item.bizId,
      bizNo: item.bizNo,
      remark: form.remark || '',
    };
    if (this.data.selectedAccountId) {
      payload.paymentAccountId = this.data.selectedAccountId;
    }
    const that = this;
    wx.showModal({ title: i18n.t(NS + 'confirmTextW', this._lang), content: i18n.tf(NS + 'payConfirmFmt', { amount: amount.toFixed(2), name: item.payeeName || '' }, this._lang), success: function (res) {
      if (!res.confirm) return;
      api.wagePayment.initiatePayment(payload).then(function () {
        toast(i18n.t(NS + 'payOk', this._lang));
        that.setData({ showPayModal: false, currentPayable: null });
        that._loadStats();
        that._resetAndLoad();
      }).catch(function (e) { toast(i18n.t(NS + 'payFailPrefix', this._lang) + (e.message || e)); });
    }});
  },

  onSearchPayee: function () {
    this.setData({ modalView: 'search', searchKeyword: '', searchResults: [] });
  },

  onPayeeSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  onPayeeSearch: function () {
    var keyword = (this.data.searchKeyword || '').trim();
    if (!keyword) { toast(i18n.t(NS + 'payeeNameReq', this._lang)); return; }
    this.setData({ searching: true });
    var that = this;
    api.wagePayment.searchPayee({ keyword: keyword }).then(function (res) {
      var results = Array.isArray(res) ? res : (res && res.records) || [];
      that.setData({ searchResults: results, searching: false });
    }).catch(function () {
      that.setData({ searching: false });
    });
  },

  onSelectPayee: function (e) {
    var idx = Number(e.currentTarget.dataset.index);
    var payee = this.data.searchResults[idx];
    if (!payee) return;
    var payeeId = payee.payeeId || payee.id;
    var payeeType = payee.payeeType || payee.type;
    var payeeName = payee.payeeName || payee.name || '';
    this.setData({
      'currentPayable.payeeId': payeeId,
      'currentPayable.payeeType': payeeType,
      'currentPayable.payeeName': payeeName,
      modalView: 'form',
      selectedAccountId: '',
      selectedAccountName: '',
      payeeAccounts: [],
    });
    this._loadPayeeAccounts(this.data.currentPayable);
  },

  onBackToForm: function () {
    this.setData({ modalView: 'form' });
  },

  onAddAccount: function () {
    this.setData({ modalView: 'addAccount', newAccountForm: { accountName: '', accountNumber: '', bankName: '' } });
  },

  onAccountInput: function (e) {
    var field = e.currentTarget.dataset.field;
    var data = {};
    data['newAccountForm.' + field] = e.detail.value;
    this.setData(data);
  },

  onSaveAccount: function () {
    var form = this.data.newAccountForm;
    if (!form.accountName) { toast(i18n.t(NS + 'accountNameReq', this._lang)); return; }
    if (!form.accountNumber) { toast(i18n.t(NS + 'accountNoReq', this._lang)); return; }
    var item = this.data.currentPayable;
    if (!item || !item.payeeId) { toast(i18n.t(NS + 'pickPayeeFirst', this._lang)); return; }
    var payload = {
      payeeId: item.payeeId,
      payeeType: item.payeeType,
      accountName: form.accountName,
      accountNumber: form.accountNumber,
      bankName: form.bankName || '',
    };
    var that = this;
    api.wagePayment.saveAccount(payload).then(function () {
      toast(i18n.t(NS + 'accountAdded', this._lang));
      that.setData({ modalView: 'form' });
      that._loadPayeeAccounts(item);
    }).catch(function (e) { toast(i18n.t(NS + 'addFailPrefix', this._lang) + (e.message || e)); });
  },

  onCancelRecord: function (e) {
    if (!hasFeaturePermission('cancel_payment')) { toast(i18n.t(NS + 'noCancelPerm', this._lang)); return; }
    var id = e.currentTarget.dataset.id;
    var that = this;
    wx.showModal({
      title: i18n.t(NS + 'cancelTitle', this._lang),
      content: i18n.t(NS + 'cancelConfirm', this._lang),
      editable: true,
      placeholderText: i18n.t(NS + 'cancelReasonPh', this._lang),
      success: function (res) {
        if (!res.confirm) return;
        var reason = (res.content || '').trim();
        api.wagePayment.cancelPayment(id, reason ? { reason: reason } : {}).then(function () {
          toast(i18n.t(NS + 'cancelled', this._lang));
          that._resetAndLoad();
        }).catch(function (err) { toast(i18n.t(NS + 'cancelFailPrefix', this._lang) + (err && err.message ? err.message : String(err))); });
      }
    });
  },

  onConfirmRecord: function (e) {
    if (!hasFeaturePermission('initiate_payment')) { toast(i18n.t(NS + 'noConfirmPerm', this._lang)); return; }
    var id = e.currentTarget.dataset.id;
    var that = this;
    wx.showModal({
      title: i18n.t(NS + 'confirmTextW', this._lang),
      content: i18n.t(NS + 'confirmPayMsg', this._lang),
      editable: true,
      placeholderText: i18n.t(NS + 'confirmRemarkPh', this._lang),
      success: function (res) {
        if (!res.confirm) return;
        var remark = (res.content || '').trim();
        api.wagePayment.confirmOffline(id, remark ? { remark: remark } : {}).then(function () {
          toast(i18n.t(NS + 'confirmed', this._lang));
          that._loadStats();
          that._resetAndLoad();
        }).catch(function (err) { toast(i18n.t(NS + 'confirmFailPrefix', this._lang) + (err && err.message ? err.message : String(err))); });
      }
    });
  },

  onCancelPay: function () {
    if (!hasFeaturePermission('cancel_payment')) { toast(i18n.t(NS + 'noCancelPerm', this._lang)); return; }
    this.setData({ showPayModal: false, currentPayable: null });
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
