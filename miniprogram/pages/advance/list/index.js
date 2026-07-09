const api = require('../../../utils/api');
const { toast, safeNavigate } = require('../../../utils/uiHelper');
const { isAdminOrSupervisor, hasFeaturePermission } = require('../../../utils/permission');
const { bindPageEvents, unbindPageEvents } = require('../../../utils/pageEventBinder');

const STATUS_MAP = {
  pending: { text: '待审批', cls: 'tag-orange' },
  approved: { text: '已审批', cls: 'tag-green' },
  rejected: { text: '已驳回', cls: 'tag-red' },
};

const DEDUCT_MAP = {
  unrepaid: { text: '未扣款', cls: 'tag-red' },
  partial:  { text: '部分扣款', cls: 'tag-orange' },
  repaid:   { text: '已扣完', cls: 'tag-green' },
};

function statusText(s) { return s ? ((STATUS_MAP[s] || {}).text || '未知') : ''; }
function statusCls(s) { return (STATUS_MAP[s] || {}).cls || 'tag-gray'; }
function deductText(s) { return s ? ((DEDUCT_MAP[s] || {}).text || '未知') : ''; }
function deductCls(s) { return (DEDUCT_MAP[s] || {}).cls || 'tag-gray'; }

Page({
  data: {
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
  },

  _STATUS_OPTIONS: [
    { value: '', label: '全部状态' },
    { value: 'pending', label: '待审批' },
    { value: 'approved', label: '已审批' },
    { value: 'rejected', label: '已驳回' },
  ],
  _REPAY_OPTIONS: [
    { value: '', label: '全部扣款' },
    { value: 'unrepaid', label: '未扣款' },
    { value: 'partial', label: '部分扣款' },
    { value: 'repaid', label: '已扣完' },
  ],

  onLoad: function () {
    this.setData({ canApprove: isAdminOrSupervisor() });
    bindPageEvents(this, () => this._resetAndLoad());
  },

  onUnload: function () {
    unbindPageEvents(this);
  },

  onShow: function () {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._resetAndLoad();
  },

  onPullDownRefresh: function () {
    const that = this;
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
      toast('加载失败: ' + (e.message || e));
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
    if (!form.employeeName || !form.employeeName.trim()) { toast('请输入员工姓名'); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast('请输入有效金额'); return; }
    if (!form.reason || !form.reason.trim()) { toast('请输入借支事由'); return; }
    const that = this;
    api.employeeAdvance.create({
      employeeName: form.employeeName.trim(),
      amount: Number(form.amount),
      reason: form.reason.trim(),
      orderNo: (form.orderNo || '').trim(),
    }).then(function () {
      toast('申请成功');
      that.setData({ showCreateModal: false });
      that._resetAndLoad();
    }).catch(function (e) { toast('申请失败: ' + (e.message || e)); });
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
    if (!hasFeaturePermission('approve_advance')) { toast('您没有审批借支的权限'); return; }
    const item = this.data.currentAdvance;
    if (!item || item.status !== 'pending') return;
    const that = this;
    wx.showModal({ title: '确认审批', content: '确认通过该借支申请？', success: function (res) {
      if (!res.confirm) return;
      api.employeeAdvance.approve(item.id).then(function () {
        toast('审批通过');
        that.setData({ showActionSheet: false, currentAdvance: null });
        that._resetAndLoad();
      }).catch(function (e) { toast('审批失败: ' + (e.message || e)); });
    }});
  },

  onActionReject: function () {
    const item = this.data.currentAdvance;
    if (!item || item.status !== 'pending') return;
    const that = this;
    wx.showModal({ title: '确认驳回', content: '确认驳回该借支申请？', editable: true, placeholderText: '驳回原因（可选）', success: function (res) {
      if (!res.confirm) return;
      api.employeeAdvance.reject(item.id, res.content || '').then(function () {
        toast('已驳回');
        that.setData({ showActionSheet: false, currentAdvance: null });
        that._resetAndLoad();
      }).catch(function (e) { toast('驳回失败: ' + (e.message || e)); });
    }});
  },

  onCloseActionSheet: function () {
    this.setData({ showActionSheet: false, currentAdvance: null });
  },
});
