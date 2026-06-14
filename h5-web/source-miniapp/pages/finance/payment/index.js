const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { isAdminOrSupervisor, hasFeaturePermission } = require('../../../utils/permission');

const PAYMENT_METHOD_MAP = {
  OFFLINE: '线下付款',
  BANK: '银行卡',
  WECHAT: '微信',
  ALIPAY: '支付宝',
};

const BIZ_TYPE_MAP = {
  PAYROLL_SETTLEMENT: { text: '工资结算', cls: 'tag-blue' },
  ORDER_SETTLEMENT: { text: '订单结算', cls: 'tag-green' },
  RECONCILIATION: { text: '工厂对账', cls: 'tag-orange' },
  REIMBURSEMENT: { text: '费用报销', cls: 'tag-gray' },
  PAYROLL: { text: '工资', cls: 'tag-blue' },
};

const PAYMENT_STATUS_MAP = {
  pending: { text: '待处理', cls: 'tag-orange' },
  processing: { text: '处理中', cls: 'tag-blue' },
  success: { text: '已完成', cls: 'tag-green' },
  failed: { text: '失败', cls: 'tag-red' },
  cancelled: { text: '已取消', cls: 'tag-gray' },
  refunded: { text: '已退回', cls: 'tag-orange' },
};

function bizTypeText(s) { return (BIZ_TYPE_MAP[s] || {}).text || s || ''; }
function bizTypeCls(s) { return (BIZ_TYPE_MAP[s] || {}).cls || 'tag-gray'; }
function paymentStatusText(s) { return (PAYMENT_STATUS_MAP[s] || {}).text || s || ''; }
function paymentStatusCls(s) { return (PAYMENT_STATUS_MAP[s] || {}).cls || 'tag-gray'; }

Page({
  data: {
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
  },

  onLoad: function () {
    this.setData({ canPay: isAdminOrSupervisor() });
  },

  onShow: function () {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._loadStats();
    this._resetAndLoad();
  },

  onPullDownRefresh: function () {
    const that = this;
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
    }).catch(function () {});
  },

  _resetAndLoad: function () {
    this.setData({ pendingPage: 1, paymentPage: 1, pendingList: [], paymentList: [], pendingHasMore: true, paymentHasMore: true });
    return Promise.all([this._loadPending(), this._loadPayments()]);
  },

  _loadPending: function () {
    if (this.data.loading) return Promise.resolve();
    const that = this;
    this.setData({ loading: true });
    return api.wagePayment.listPendingPayables({ page: this.data.pendingPage, pageSize: this.data.pageSize }).then(function (res) {
      const records = (res && res.records) || res || [];
      const total = (res && res.total) || records.length;
      const enriched = records.map(function (r) {
        r.bizTypeText = bizTypeText(r.bizType);
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
    }).catch(function (e) {
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
        r.paymentMethodText = PAYMENT_METHOD_MAP[r.paymentMethod] || r.paymentMethod || '';
        return r;
      });
      that.setData({
        paymentList: that.data.paymentList.concat(enriched),
        paymentHasMore: that.data.paymentList.length + records.length < total,
        paymentPage: that.data.paymentPage + 1,
      });
    }).catch(function () {});
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

  onPayMethodChange: function (e) {
    this.setData({ 'payForm.paymentMethod': e.detail.value, selectedAccountId: '' });
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
    if (!hasFeaturePermission('initiate_payment')) { toast('您没有发起支付的权限'); return; }
    const item = this.data.currentPayable;
    if (!item) return;
    const amount = Number(this.data.payForm.amount);
    if (!amount || amount <= 0) { toast('请输入有效金额'); return; }
    const remaining = item.remainingAmount || item.amount || 0;
    if (amount > remaining) { toast('支付金额不能超过待付金额'); return; }
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
    wx.showModal({ title: '确认支付', content: '确认支付 ¥' + amount.toFixed(2) + ' 给 ' + (item.payeeName || '') + '？', success: function (res) {
      if (!res.confirm) return;
      api.wagePayment.initiatePayment(payload).then(function () {
        toast('支付成功');
        that.setData({ showPayModal: false, currentPayable: null });
        that._loadStats();
        that._resetAndLoad();
      }).catch(function (e) { toast('支付失败: ' + (e.message || e)); });
    }});
  },

  onCancelPay: function () {
    if (!hasFeaturePermission('cancel_payment')) { toast('您没有取消支付的权限'); return; }
    this.setData({ showPayModal: false, currentPayable: null });
  },
});
