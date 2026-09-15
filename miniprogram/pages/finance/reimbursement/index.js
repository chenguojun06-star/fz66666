/**
 * 费用报销处理页（D-417 手机端独立处理页）
 *
 * 与 PC 端 ExpenseReimbursement 页同源接口，补齐手机端「基本无处理能力」。
 * 状态链：pending(待审批) → approved(已批准) → paid(已付款)
 *                     ↘ rejected(已驳回)
 *
 * 权限：仅内部管理员/主管可审批；工厂（外部）账号不参与租户财务，直接拦截。
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { hasFeaturePermission, isFactoryAccount } = require('../../../utils/permission');

var STATUS_CLS_MAP = {
  pending: 'tag-orange',
  approved: 'tag-green',
  rejected: 'tag-red',
  paid: 'tag-green',
};
var STATUS_TEXT_MAP = {
  pending: '待审批',
  approved: '已批准',
  rejected: '已驳回',
  paid: '已付款',
};

var STATUS_MAP = {};
Object.keys(STATUS_TEXT_MAP).forEach(function (k) {
  STATUS_MAP[k] = { text: STATUS_TEXT_MAP[k], cls: STATUS_CLS_MAP[k] };
});

function statusText(s) { return STATUS_TEXT_MAP[s] || s || '—'; }
function statusCls(s) { return STATUS_CLS_MAP[s] || 'tag-gray'; }

Page({
  data: {
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
    STATUS_MAP: STATUS_MAP,
    STATUS_OPTIONS: [
      { value: '', label: '全部状态' },
      { value: 'pending', label: '待审批' },
      { value: 'approved', label: '已批准' },
      { value: 'paid', label: '已付款' },
      { value: 'rejected', label: '已驳回' },
    ],
  },

  _STATUS_OPTIONS: [
    { value: '', label: '全部状态' },
    { value: 'pending', label: '待审批' },
    { value: 'approved', label: '已批准' },
    { value: 'paid', label: '已付款' },
    { value: 'rejected', label: '已驳回' },
  ],

  onLoad: function (options) {
    var opts = options || {};
    if (isFactoryAccount()) {
      this.setData({
        blocked: true,
        blockedMsg: '工厂账号不可查看费用报销（属租户财务数据）',
        canOperate: false,
      });
      return;
    }
    this.setData({
      canOperate: hasFeaturePermission('approve_expense'),
      statusFilter: opts.status || '',
      keyword: opts.keyword ? decodeURIComponent(opts.keyword) : '',
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
      toast('加载失败: ' + (e.errMsg || e.message || e));
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
   * 批准（action=approve）
   */
  onActionApprove: function () {
    var item = this.data.current;
    if (!item) return;
    var that = this;
    wx.showModal({
      title: '确认批准',
      content: '批准该报销单 ¥' + Number(item.amount || 0).toFixed(2) + '？',
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...', mask: true });
        api.expenseReimbursement.approve(item.id, 'approve', '').then(function () {
          wx.hideLoading();
          toast('已批准');
          that.setData({ showActionSheet: false, current: null });
          that._resetAndLoad();
        }).catch(function (e) {
          wx.hideLoading();
          toast('批准失败: ' + (e.errMsg || e.message || e));
        });
      },
    });
  },

  /**
   * 驳回（action=reject，需填理由）
   */
  onActionReject: function () {
    var item = this.data.current;
    if (!item) return;
    var that = this;
    wx.showModal({
      title: '驳回',
      content: '',
      editable: true,
      placeholderText: '请填写驳回理由',
      success: function (res) {
        if (!res.confirm) return;
        var remark = (res.content || '').trim();
        if (!remark) { toast('请填写驳回理由'); return; }
        wx.showLoading({ title: '处理中...', mask: true });
        api.expenseReimbursement.approve(item.id, 'reject', remark).then(function () {
          wx.hideLoading();
          toast('已驳回');
          that.setData({ showActionSheet: false, current: null });
          that._resetAndLoad();
        }).catch(function (e) {
          wx.hideLoading();
          toast('驳回失败: ' + (e.errMsg || e.message || e));
        });
      },
    });
  },

  /**
   * 确认付款（批准后打款）
   */
  onActionPay: function () {
    var item = this.data.current;
    if (!item) return;
    var that = this;
    wx.showModal({
      title: '确认付款',
      content: '确认已向「' + (item.applicantName || '申请人') + '」支付 ¥' + Number(item.amount || 0).toFixed(2) + '？',
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...', mask: true });
        api.expenseReimbursement.pay(item.id, '').then(function () {
          wx.hideLoading();
          toast('已确认付款');
          that.setData({ showActionSheet: false, current: null });
          that._resetAndLoad();
        }).catch(function (e) {
          wx.hideLoading();
          toast('操作失败: ' + (e.errMsg || e.message || e));
        });
      },
    });
  },

  onCloseActionSheet: function () {
    this.setData({ showActionSheet: false, current: null });
  },
});
