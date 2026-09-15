/**
 * 工资结算审批页（D-417 手机端独立处理页）
 *
 * 与 PC 端 PayrollOperatorSummary 同源接口：
 *   列表 = POST /finance/payroll-settlement/operator-summary
 *   审核 = POST /finance/payroll-settlement/detail-approval/{approvalId}/approve
 *
 * 内外部规则（与 PC 端 usePayrollActions.handleAuditDetail 一致）：
 *   内部工厂（factoryType === 'INTERNAL'）→ 可直接审核
 *   外部工厂 → 只有订单进入终态（已完成/已关单/已取消/已报废/已归档）才允许审核，
 *             否则先提示「订单尚未关单」，避免未完工就结钱。
 *
 * 权限：后端限制「主管及以上」；工厂（外部）账号不可查看工资汇总。
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { hasFeaturePermission, isFactoryAccount } = require('../../../utils/permission');

// 订单终态（与 PC 端 production.order.ts TERMINAL_ORDER_STATUSES 对齐）
var TERMINAL_ORDER_STATUSES = ['completed', 'closed', 'cancelled', 'scrapped', 'archived'];

// 订单状态中文（用于卡片展示）
var ORDER_STATUS_TEXT = {
  pending: '待生产',
  confirmed: '已确认',
  production: '生产中',
  in_progress: '生产中',
  completed: '已完成',
  closed: '已关单',
  cancelled: '已取消',
  canceled: '已取消',
  scrapped: '已报废',
  archived: '已归档',
  paused: '已暂停',
  returned: '已退回',
  delayed: '已逾期',
};

/**
 * 订单是否已关单（冻结）——决定外部工厂明细能否审核
 * @param {string} status - 订单状态
 * @returns {boolean}
 */
function isOrderFrozenByStatus(status) {
  return TERMINAL_ORDER_STATUSES.indexOf(String(status || '').trim().toLowerCase()) >= 0;
}

function pad2(n) { return n < 10 ? '0' + n : String(n); }

Page({
  data: {
    list: [],
    loading: false,
    keyword: '',
    // 统计
    totalCount: 0,
    pendingCount: 0,
    auditedCount: 0,
    totalAmountStr: '0.00',
    // 权限
    canOperate: false,
    blocked: false,
    blockedMsg: '',
    // 月份选择（monthValue 供 picker 用，格式 YYYY-MM；monthLabel 供展示）
    monthLabel: '',
    monthValue: '',
    // 操作面板
    showActionSheet: false,
    current: null,
    currentCanAudit: false,
    currentBlockReason: '',
    // 批量
    auditableIds: [],
    _year: 0,
    _month: 0,
  },

  onLoad: function () {
    if (isFactoryAccount()) {
      this.setData({
        blocked: true,
        blockedMsg: '工厂账号不可查看工资结算（属租户财务管理数据）',
        canOperate: false,
      });
      return;
    }
    var now = new Date();
    this.setData({
      canOperate: hasFeaturePermission('approve_payroll'),
      _year: now.getFullYear(),
      _month: now.getMonth() + 1,
      monthLabel: now.getFullYear() + '年' + (now.getMonth() + 1) + '月',
      monthValue: now.getFullYear() + '-' + pad2(now.getMonth() + 1),
    });
  },

  onShow: function () {
    if (this.data.blocked) return;
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._loadData();
  },

  onPullDownRefresh: function () {
    if (this.data.blocked) { wx.stopPullDownRefresh(); return; }
    this._loadData().finally(function () { wx.stopPullDownRefresh(); });
  },

  _loadData: function () {
    if (this.data.loading) return Promise.resolve();
    var that = this;
    this.setData({ loading: true });
    var y = this.data._year;
    var m = this.data._month;
    var startDate = y + '-' + pad2(m) + '-01';
    var lastDay = new Date(y, m, 0).getDate();
    var endDate = y + '-' + pad2(m) + '-' + pad2(lastDay);

    return api.payrollSettlement.operatorSummary({
      startTime: startDate + ' 00:00:00',
      endTime: endDate + ' 23:59:59',
      includeSettled: true,
    }).then(function (data) {
      var rows = Array.isArray(data) ? data : [];
      var kw = (that.data.keyword || '').trim().toLowerCase();
      if (kw) {
        rows = rows.filter(function (r) {
          return String(r.operatorName || '').toLowerCase().indexOf(kw) >= 0
            || String(r.processName || '').toLowerCase().indexOf(kw) >= 0
            || String(r.orderNo || '').toLowerCase().indexOf(kw) >= 0;
        });
      }

      var pendingCount = 0;
      var auditedCount = 0;
      var totalAmount = 0;
      var auditableIds = [];

      var enriched = rows.map(function (r) {
        var isInternal = String(r.factoryType || '') === 'INTERNAL';
        var audited = String(r.approvalStatus || '').toLowerCase() === 'approved';
        var hasApproval = !!(r.approvalId && String(r.approvalId).trim());
        var frozen = isOrderFrozenByStatus(r.orderStatus);
        var eligible = that.data.canOperate && hasApproval && !audited && (isInternal || frozen);

        var blockReason = '';
        if (!hasApproval) blockReason = '缺少审批标识';
        else if (audited) blockReason = '已审核';
        else if (!isInternal && !frozen) {
          blockReason = '外部工厂订单未关单，需订单进入终态后才能审核';
        }

        if (audited) auditedCount++;
        else pendingCount++;
        totalAmount += Number(r.totalAmount || 0);
        if (eligible) auditableIds.push(r.approvalId);

        r.audited = audited;
        r.auditText = audited ? '已审核' : '待审核';
        r.auditCls = audited ? 'tag-green' : 'tag-orange';
        r.eligible = eligible;
        r.blockReason = blockReason;
        r.orderStatusText = ORDER_STATUS_TEXT[String(r.orderStatus || '').toLowerCase()] || (r.orderStatus || '—');
        r.amountStr = r.totalAmount != null ? Number(r.totalAmount).toFixed(2) : '0.00';
        r.unitPriceStr = r.unitPrice != null ? Number(r.unitPrice).toFixed(2) : '—';
        r.quantityStr = r.quantity != null ? String(r.quantity) : '0';
        r.operatorName = r.operatorName || r.actualOperatorName || '—';
        r.processName = r.processName || '—';
        return r;
      });

      that.setData({
        list: enriched,
        totalCount: enriched.length,
        pendingCount: pendingCount,
        auditedCount: auditedCount,
        totalAmountStr: totalAmount.toFixed(2),
        auditableIds: auditableIds,
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
    this._loadData();
  },

  onMonthChange: function (e) {
    var parts = String(e.detail.value || '').split('-');
    if (parts.length < 2) return;
    this.setData({
      _year: Number(parts[0]),
      _month: Number(parts[1]),
      monthLabel: Number(parts[0]) + '年' + Number(parts[1]) + '月',
      monthValue: parts[0] + '-' + parts[1],
      list: [],
    });
    this._loadData();
  },

  onTapItem: function (e) {
    var idx = e.currentTarget.dataset.index;
    var item = this.data.list[idx];
    if (!item) return;
    this.setData({
      current: item,
      showActionSheet: true,
      currentCanAudit: !!item.eligible,
      currentBlockReason: item.blockReason || '',
    });
  },

  /**
   * 审核单条明细（detail-approval/{approvalId}/approve）
   */
  onActionAudit: function () {
    var item = this.data.current;
    if (!item) return;
    if (!item.eligible) { toast(item.blockReason || '当前不可审核'); return; }
    var that = this;
    wx.showModal({
      title: '确认审核',
      content: '审核 ' + (item.operatorName || '') + ' - ' + (item.processName || '') + ' ¥' + item.amountStr + '？',
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...', mask: true });
        api.payrollSettlement.approveDetail(item.approvalId).then(function () {
          wx.hideLoading();
          toast('已审核');
          that.setData({ showActionSheet: false, current: null });
          that._loadData();
        }).catch(function (e) {
          wx.hideLoading();
          toast('审核失败: ' + (e.errMsg || e.message || e));
        });
      },
    });
  },

  /**
   * 一键审核当前全部可审核明细（对应 PC 端批量审核）
   */
  onBatchAudit: function () {
    var ids = this.data.auditableIds || [];
    if (!ids.length) { toast('当前没有可审核的明细'); return; }
    var that = this;
    wx.showModal({
      title: '批量审核',
      content: '确认审核全部 ' + ids.length + ' 条可审核明细？',
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: '审核中...', mask: true });
        // 顺序提交，避免并发写导致的状态竞争
        var chain = Promise.resolve();
        var okCount = 0;
        var failCount = 0;
        ids.forEach(function (id) {
          chain = chain.then(function () {
            return api.payrollSettlement.approveDetail(id).then(function () {
              okCount++;
            }).catch(function () {
              failCount++;
            });
          });
        });
        chain.then(function () {
          wx.hideLoading();
          toast('已审核 ' + okCount + ' 条' + (failCount ? '，失败 ' + failCount + ' 条' : ''));
          that._loadData();
        });
      },
    });
  },

  onCloseActionSheet: function () {
    this.setData({ showActionSheet: false, current: null });
  },
});
