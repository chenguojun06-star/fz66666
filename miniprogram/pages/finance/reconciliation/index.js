/**
 * 物料对账处理页（D-417 手机端独立处理页）
 *
 * 与 PC 端 MaterialReconciliation 页同源接口，补齐手机端「只能看不能办」。
 * 状态链：pending(待核实) → verified(已核实) → approved(已审批) → paid(已付款)
 *        任意环节可 return(退回上一步)
 *
 * 权限：仅内部管理员/主管可操作；工厂（外部）账号不参与租户财务，直接拦截。
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { hasFeaturePermission, isFactoryAccount } = require('../../../utils/permission');

// 状态文案/配色（与 PC 端 MATERIAL_RECON_STATUS_MAP 对齐）
var STATUS_CLS_MAP = {
  pending: 'tag-orange',
  verified: 'tag-blue',
  approved: 'tag-green',
  paid: 'tag-green',
  rejected: 'tag-red',
};
var STATUS_TEXT_MAP = {
  pending: '待核实',
  verified: '已核实',
  approved: '已审批',
  paid: '已付款',
  rejected: '已驳回',
};

// 状态推进链：当前状态 → 下一步动作（对齐 PC 端 status-action: action=update + status）
var NEXT_STEP = {
  pending: { status: 'verified', label: '核实通过' },
  verified: { status: 'approved', label: '审批通过' },
  approved: { status: 'paid', label: '标记已付款' },
};

function statusText(s) { return STATUS_TEXT_MAP[s] || s || '—'; }
function statusCls(s) { return STATUS_CLS_MAP[s] || 'tag-gray'; }

// wxml 筛选用：{status: {text, cls}}（与 advance 页 STATUS_MAP 结构一致）
var STATUS_MAP = {};
Object.keys(STATUS_TEXT_MAP).forEach(function (k) {
  STATUS_MAP[k] = { text: STATUS_TEXT_MAP[k], cls: STATUS_CLS_MAP[k] };
});

Page({
  data: {
    list: [],
    loading: false,
    page: 1,
    pageSize: 20,
    hasMore: true,
    keyword: '',
    statusFilter: '',
    // 操作权限
    canOperate: false,
    blocked: false,
    blockedMsg: '',
    // 底部操作面板
    showActionSheet: false,
    current: null,
    currentNextLabel: '',
    currentCanAdvance: false,
    currentCanReturn: false,
    STATUS_OPTIONS: [
      { value: '', label: '全部状态' },
      { value: 'pending', label: '待核实' },
      { value: 'verified', label: '已核实' },
      { value: 'approved', label: '已审批' },
      { value: 'paid', label: '已付款' },
    ],
    STATUS_MAP: STATUS_MAP,
  },

  _STATUS_OPTIONS: [
    { value: '', label: '全部状态' },
    { value: 'pending', label: '待核实' },
    { value: 'verified', label: '已核实' },
    { value: 'approved', label: '已审批' },
    { value: 'paid', label: '已付款' },
  ],

  onLoad: function (options) {
    var opts = options || {};
    // 外部（工厂）账号不参与租户财务对账，直接拦截，避免误操作越权
    if (isFactoryAccount()) {
      this.setData({
        blocked: true,
        blockedMsg: '工厂账号不可查看物料对账（属租户财务数据）',
        canOperate: false,
      });
      return;
    }
    this.setData({
      canOperate: hasFeaturePermission('approve_reconciliation'),
      // 支持从待办直达并预置筛选（如 ?status=pending / ?keyword=xxx）
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

    return api.materialReconciliation.list(params).then(function (res) {
      var records = (res && res.records) || [];
      var total = (res && res.total) || 0;
      var enriched = records.map(function (r) {
        r.statusText = statusText(r.status);
        r.statusCls = statusCls(r.status);
        r.amountStr = r.finalAmount != null ? Number(r.finalAmount).toFixed(2)
          : (r.totalAmount != null ? Number(r.totalAmount).toFixed(2) : '0.00');
        r.unitPriceStr = r.unitPrice != null ? Number(r.unitPrice).toFixed(2) : '—';
        r.quantityStr = r.quantity != null ? String(Number(r.quantity)) : '—';
        // 下一步可推进的文案（无下一步则不显示操作）
        var next = NEXT_STEP[r.status];
        r.nextLabel = next ? next.label : '';
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
    var next = NEXT_STEP[item.status];
    this.setData({
      current: item,
      showActionSheet: true,
      currentNextLabel: next ? next.label : '',
      currentCanAdvance: !!(this.data.canOperate && next),
      currentCanReturn: !!(this.data.canOperate && item.status && item.status !== 'pending' && item.status !== 'rejected'),
    });
  },

  /**
   * 推进到下一状态（核实 → 审批 → 付款）
   */
  onActionAdvance: function () {
    var item = this.data.current;
    if (!item) return;
    var next = NEXT_STEP[item.status];
    if (!next) { toast('当前状态无可执行操作'); return; }
    var that = this;
    wx.showModal({
      title: '确认操作',
      content: '确认「' + next.label + '」？单号 ' + (item.reconciliationNo || '—'),
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...', mask: true });
        api.materialReconciliation.statusAction(item.id, 'update', next.status, '').then(function () {
          wx.hideLoading();
          toast('已' + next.label.replace('通过', '通过').replace('标记', ''));
          that.setData({ showActionSheet: false, current: null });
          that._resetAndLoad();
        }).catch(function (e) {
          wx.hideLoading();
          toast('操作失败: ' + (e.errMsg || e.message || e));
        });
      },
    });
  },

  /**
   * 退回上一步（需填原因）
   */
  onActionReturn: function () {
    var item = this.data.current;
    if (!item) return;
    var that = this;
    wx.showModal({
      title: '退回',
      content: '',
      editable: true,
      placeholderText: '请填写退回原因',
      success: function (res) {
        if (!res.confirm) return;
        var reason = (res.content || '').trim();
        if (!reason) { toast('请填写退回原因'); return; }
        wx.showLoading({ title: '处理中...', mask: true });
        api.materialReconciliation.statusAction(item.id, 'return', '', reason).then(function () {
          wx.hideLoading();
          toast('已退回');
          that.setData({ showActionSheet: false, current: null });
          that._resetAndLoad();
        }).catch(function (e) {
          wx.hideLoading();
          toast('退回失败: ' + (e.errMsg || e.message || e));
        });
      },
    });
  },

  onCloseActionSheet: function () {
    this.setData({ showActionSheet: false, current: null });
  },
});
