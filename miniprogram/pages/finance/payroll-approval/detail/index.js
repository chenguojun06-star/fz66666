/**
 * 工资明细详情页（D-421）
 *
 * 数据源：POST /api/finance/payroll-settlement/operator-summary
 * 该接口返回聚合行（无单条 detail 接口），所以按 approvalId 重查列表后取出匹配项。
 * 传参：?approvalId=xxx&year=2026&month=9
 *
 * 审核：POST /api/finance/payroll-settlement/detail-approval/{approvalId}/approve
 * 内外部规则（与列表页/PC 端一致）：
 *   内部工厂 → 可直接审核；外部工厂 → 订单需进入终态（已关单等）才可审核
 */
const api = require('../../../../utils/api');
const { toast } = require('../../../../utils/uiHelper');
const { hasFeaturePermission, isFactoryAccount } = require('../../../../utils/permission');
const fileUrl = require('../../../../utils/fileUrl');

// 订单终态（与 PC 端 production.order.ts TERMINAL_ORDER_STATUSES 对齐）
var TERMINAL_ORDER_STATUSES = ['completed', 'closed', 'cancelled', 'scrapped', 'archived'];

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

function isOrderFrozenByStatus(status) {
  return TERMINAL_ORDER_STATUSES.indexOf(String(status || '').trim().toLowerCase()) >= 0;
}

// D-421：来源标注（用户要求明确区分样衣 / 大货）
// scanType 取值来源：PayrollSettlementOrchestrator.PAYROLL_SCAN_TYPES
var SCAN_TYPE_MAP = {
  pattern: { kind: 'sample', text: '样衣' },
  production: { kind: 'bulk', text: '大货' },
  cutting: { kind: 'cutting', text: '裁床' },
};

// D-426：结算类型（字段为 delegateTargetType，与 PC 端「结算类型」列一致）
//   none/空 → 自己完成   internal → 内部指派   external → 外发工厂
// 只有**明确外发工厂**的订单才要求已关单才能审核。
var DELEGATE_TYPE_MAP = {
  none: { kind: 'self', text: '自己完成' },
  internal: { kind: 'internal', text: '内部指派' },
  external: { kind: 'external', text: '外发工厂' },
};

function pad2(n) { return n < 10 ? '0' + n : String(n); }

function fmtDateTime(v) {
  if (!v) return '';
  if (typeof v === 'number') {
    var d0 = new Date(v);
    if (isNaN(d0.getTime())) return '';
    return d0.getFullYear() + '-' + pad2(d0.getMonth() + 1) + '-' + pad2(d0.getDate())
      + ' ' + pad2(d0.getHours()) + ':' + pad2(d0.getMinutes());
  }
  var s = String(v).trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{1,2})/);
  if (m) {
    return m[1] + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[3]))
      + ' ' + pad2(Number(m[4])) + ':' + pad2(Number(m[5]));
  }
  var d2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (d2) return d2[1] + '-' + pad2(Number(d2[2])) + '-' + pad2(Number(d2[3]));
  return '';
}

Page({
  data: {
    detail: null,
    loading: true,
    loadError: '',
    canOperate: false,
  },

  onLoad: function (options) {
    var opts = options || {};
    if (isFactoryAccount()) {
      this.setData({ loadError: '工厂账号不可查看工资结算（属租户财务管理数据）', loading: false });
      return;
    }
    var approvalId = opts.approvalId ? String(opts.approvalId) : '';
    if (!approvalId) {
      this.setData({ loadError: '缺少明细标识', loading: false });
      return;
    }
    var now = new Date();
    this.setData({
      canOperate: hasFeaturePermission('approve_payroll'),
      _approvalId: approvalId,
      _year: opts.year ? Number(opts.year) : now.getFullYear(),
      _month: opts.month ? Number(opts.month) : (now.getMonth() + 1),
    });
    this._loadDetail();
  },

  _loadDetail: function () {
    var that = this;
    var y = this.data._year;
    var m = this.data._month;
    var startDate = y + '-' + pad2(m) + '-01';
    var lastDay = new Date(y, m, 0).getDate();
    var endDate = y + '-' + pad2(m) + '-' + pad2(lastDay);

    this.setData({ loading: true, loadError: '' });
    api.payrollSettlement.operatorSummary({
      startTime: startDate + ' 00:00:00',
      endTime: endDate + ' 23:59:59',
      includeSettled: true,
    }).then(function (data) {
      var rows = Array.isArray(data) ? data : [];
      var targetId = that.data._approvalId;
      var hit = null;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i] && String(rows[i].approvalId || '') === targetId) { hit = rows[i]; break; }
      }
      if (!hit) {
        that.setData({ loading: false, loadError: '该明细已不存在或已变更，请返回列表刷新' });
        return;
      }
      that.setData({ detail: that._enrich(hit), loading: false });
    }).catch(function (e) {
      that.setData({ loading: false, loadError: '加载失败：' + (e.errMsg || e.message || e) });
    });
  },

  /**
   * 与列表页保持一致的字段加工（审核资格、状态色、时间文案）
   */
  _enrich: function (r) {
    var canOperate = this.data.canOperate;
    // D-426：判定字段为 delegateTargetType；只有明确外发工厂才受关单限制
    var dtype = String(r.delegateTargetType || '').toLowerCase();
    var isExternalFactory = dtype === 'external';
    var audited = String(r.approvalStatus || '').toLowerCase() === 'approved';
    var hasApproval = !!(r.approvalId && String(r.approvalId).trim());
    var frozen = isOrderFrozenByStatus(r.orderStatus);
    var canAudit = !isExternalFactory || frozen;
    var eligible = canOperate && hasApproval && !audited && canAudit;

    var blockReason = '';
    if (!hasApproval) blockReason = '缺少审批标识';
    else if (audited) blockReason = '该明细已审核';
    else if (!canAudit) blockReason = '外发工厂订单尚未关单，只有已关单的订单才能审核';

    r.audited = audited;
    r.canAudit = canAudit;
    r.isExternalFactory = isExternalFactory;
    r.eligible = eligible;
    r.blockReason = blockReason;
    r.auditText = audited ? '已审核' : '待审核';
    r._statusColor = audited ? 'var(--color-success)' : 'var(--color-warning)';
    r.orderStatusText = ORDER_STATUS_TEXT[String(r.orderStatus || '').toLowerCase()] || (r.orderStatus || '—');
    r.amountStr = r.totalAmount != null ? Number(r.totalAmount).toFixed(2) : '0.00';
    r.unitPriceStr = r.unitPrice != null ? Number(r.unitPrice).toFixed(2) : '—';
    r.quantityStr = r.quantity != null ? String(r.quantity) : '0';
    r.operatorName = r.operatorName || r.actualOperatorName || '—';
    r.processName = r.processName || '—';
    r._image = r.coverImage ? fileUrl.getAuthedImageUrl(r.coverImage) : '';
    r._startText = fmtDateTime(r.startTime);
    r._endText = fmtDateTime(r.endTime);
    // D-421：来源标注（样衣 / 大货 / 裁床）
    var scan = SCAN_TYPE_MAP[String(r.scanType || '').toLowerCase()] || null;
    r._sourceKind = scan ? scan.kind : '';
    r._sourceText = scan ? scan.text : '';
    // D-426：结算类型标签（自己完成 / 内部指派 / 外发工厂）
    var dkey = String(r.delegateTargetType || '').toLowerCase();
    var dty = DELEGATE_TYPE_MAP[dkey] || DELEGATE_TYPE_MAP.none;
    r._factoryKind = dty.kind;
    r._factoryText = dty.text;
    return r;
  },

  onAudit: function () {
    var that = this;
    var item = this.data.detail;
    if (!item) return;
    if (!item.eligible) { toast(item.blockReason || '当前不可审核'); return; }
    wx.showModal({
      title: '确认审核',
      content: '审核 ' + (item.operatorName || '') + ' - ' + (item.processName || '') + ' ¥' + item.amountStr + '？',
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...', mask: true });
        api.payrollSettlement.approveDetail(item.approvalId).then(function () {
          wx.hideLoading();
          toast('已审核');
          that._loadDetail();
        }).catch(function (e) {
          wx.hideLoading();
          toast('审核失败: ' + (e.errMsg || e.message || e));
        });
      },
    });
  },
});