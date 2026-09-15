/**
 * 工资结算审批页（D-417 手机端独立处理页）
 *
 * 与 PC 端 PayrollOperatorSummary 同源接口：
 *   列表 = POST /finance/payroll-settlement/operator-summary
 *   审核 = POST /finance/payroll-settlement/detail-approval/{approvalId}/approve
 *
 * 结算类型规则（D-426 修正，与 PC 端 baseInfoColumns「结算类型」列同源字段）：
 *   自己完成 / 内部指派（delegateTargetType = none | internal）→ 可直接审核
 *   外发工厂（delegateTargetType = external）→ 只有订单进入终态
 *     （已完成/已关单/已取消/已报废/已归档）才允许审核，
 *     否则先提示「订单尚未关单」，避免未完工就结钱。
 *   ⚠️ 原实现读的 row.factoryType 在后端 DTO 中并不存在（恒 undefined），
 *      会把所有订单误判为"外发工厂"，导致未关单的一律无法审核。
 *
 * 权限：后端限制「主管及以上」；工厂（外部）账号不可查看工资汇总。
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { hasFeaturePermission, isFactoryAccount } = require('../../../utils/permission');
const fileUrl = require('../../../utils/fileUrl');

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

// D-419：实底 status-badge 颜色（与样式表 --color-* 对齐）
var AUDIT_STATUS_COLOR_MAP = {
  audited: 'var(--color-success)',
  pending: 'var(--color-warning)',
};

// D-421：来源标注 —— 用户要求卡片上明确区分「样衣 / 大货」
// scanType 取值来源：PayrollSettlementOrchestrator.PAYROLL_SCAN_TYPES = [production, cutting, pattern]
var SCAN_TYPE_MAP = {
  pattern: { kind: 'sample', text: '样衣' },
  production: { kind: 'bulk', text: '大货' },
  cutting: { kind: 'cutting', text: '裁床' },
};
var SCAN_TYPE_FALLBACK = { kind: 'bulk', text: '大货' };

// D-426：结算类型标注 —— 字段为 delegateTargetType（**不是 factoryType**！）
// 取值与 PC 端 PayrollOperatorSummary/baseInfoColumns「结算类型」列完全一致：
//   none / 空 → 自己完成     internal → 内部指派     external → 外发工厂
// 该字段同时决定审核资格：只有**明确外发工厂(external)**的订单才要求已关单。
// ⚠️ 历史 bug：PC 端 usePayrollActions 读的是 row.factoryType，
//    而该字段在后端 DTO 与前端类型里都不存在 → 恒为 undefined →
//    所有订单被误判为"外发工厂"，未关单的一律不给审核。
//    本处改用正确字段，并保留对旧值的兜底兼容。
// D-427：结算类型筛选选项（客户端筛选，与卡片标签同源字段 delegateTargetType）
var FACTORY_FILTER_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'none', label: '自己完成' },
  { value: 'internal', label: '内部指派' },
  { value: 'external', label: '外发工厂' },
];
var DELEGATE_TYPE_MAP = {
  none: { kind: 'self', text: '自己完成' },
  internal: { kind: 'internal', text: '内部指派' },
  external: { kind: 'external', text: '外发工厂' },
  // ⚠️ 后端 ProductionScanExecutor:613 / ScanRecordFactoryBackfillRunner 实际写入的是
  //    大写 'FACTORY'（不是 'external'），此处必须兼容，否则会 fallback 成"自己完成"。
  factory: { kind: 'external', text: '外发工厂' },
};
// 判定"是否外发工厂"时同时接受两种写法
function isExternalDelegateType(v) {
  var t = String(v || '').toLowerCase();
  return t === 'external' || t === 'factory';
}

/**
 * 订单是否已关单（冻结）——决定外部工厂明细能否审核
 * @param {string} status - 订单状态
 * @returns {boolean}
 */
function isOrderFrozenByStatus(status) {
  return TERMINAL_ORDER_STATUSES.indexOf(String(status || '').trim().toLowerCase()) >= 0;
}

function pad2(n) { return n < 10 ? '0' + n : String(n); }

/**
 * D-421：格式化后端返回的时间（LocalDateTime 序列化后可能是
 * "2026-09-15T14:30:00" / "2026-09-15 14:30:00" / 时间戳），
 * 输出 "2026-09-15 14:30"。解析不了就返回空串（不显示）。
 */
function fmtDateTime(v) {
  if (!v) return '';
  if (typeof v === 'number') {
    var d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
      + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  var s = String(v).trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{1,2})/);
  if (m) {
    return m[1] + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[3]))
      + ' ' + pad2(Number(m[4])) + ':' + pad2(Number(m[5]));
  }
  // 仅日期
  var d2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (d2) return d2[1] + '-' + pad2(Number(d2[2])) + '-' + pad2(Number(d2[3]));
  return '';
}

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
    // D-427：结算类型筛选
    factoryFilter: '',
    factoryFilterLabel: '全部类型',
    FACTORY_FILTER_OPTIONS: FACTORY_FILTER_OPTIONS,
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
      // D-427：按结算类型筛选（空值归入「自己完成」）
      var ff = that.data.factoryFilter;
      if (ff) {
        rows = rows.filter(function (r) {
          var d = String(r.delegateTargetType || '').toLowerCase() || 'none';
          return d === ff;
        });
      }

      var pendingCount = 0;
      var auditedCount = 0;
      var totalAmount = 0;
      var auditableIds = [];
      // D-423：批量审核被跳过的分类计数（对齐 PC 端 handleBatchAuditDetails 的提示优先级）
      var notFrozenCount = 0;
      var noApprovalIdCount = 0;
      var abnormalCount = 0;   // D-428：数据异常条数（标红）

      var enriched = rows.map(function (r) {
        // D-426：判定字段改为 delegateTargetType（正确字段），
        // 只有**明确外发工厂**才受"订单须关单"限制；自己完成/内部指派不受限。
        var isExternalFactory = isExternalDelegateType(r.delegateTargetType);
        var audited = String(r.approvalStatus || '').toLowerCase() === 'approved';
        var hasApproval = !!(r.approvalId && String(r.approvalId).trim());
        var frozen = isOrderFrozenByStatus(r.orderStatus);
        var canAudit = !isExternalFactory || frozen;
        var eligible = that.data.canOperate && hasApproval && !audited && canAudit;

        var blockReason = '';
        if (!hasApproval) blockReason = '缺少审批标识';
        else if (audited) blockReason = '已审核';
        else if (!canAudit) {
          blockReason = '外发工厂订单尚未关单，只有已关单的订单才能审核';
        }

        // D-428：结算异常判定 —— 异常项前端标红，提示用户核实详情
        //   红色(danger)：数据本身有问题，必须人工核实
        //   橙色(warn)  ：业务流转中（如外发订单待关单），非数据错误
        var amtNum = Number(r.totalAmount || 0);
        var qtyNum = Number(r.quantity || 0);
        var priceNum = Number(r.unitPrice || 0);
        var abnormalText = '';
        var cardCls = '';
        if (!hasApproval) {
          abnormalText = '缺少审批标识，数据可能未同步，请核实';
          cardCls = 'order-card--danger';
        } else if (qtyNum > 0 && (amtNum <= 0 || priceNum <= 0)) {
          abnormalText = '结算金额或工序单价为 0，请核实';
          cardCls = 'order-card--danger';
        } else if (!audited && !canAudit) {
          abnormalText = '外发工厂订单尚未关单，暂不可审核';
          cardCls = 'order-card--warn';
        }

        if (audited) auditedCount++;
        else pendingCount++;
        totalAmount += Number(r.totalAmount || 0);
        if (eligible) auditableIds.push(r.approvalId);
        if (!audited && !eligible && !canAudit) notFrozenCount++;
        if (!audited && !hasApproval) noApprovalIdCount++;
        if (cardCls === 'order-card--danger') abnormalCount++;

        r.audited = audited;
        r.canAudit = canAudit;
        r.isExternalFactory = isExternalFactory;
        r.auditText = audited ? '已审核' : '待审核';
        r.auditCls = audited ? 'tag-green' : 'tag-orange';
        r.eligible = eligible;
        r.blockReason = blockReason;
        r._abnormalText = abnormalText;
        r._cardCls = cardCls;
        r.orderStatusText = ORDER_STATUS_TEXT[String(r.orderStatus || '').toLowerCase()] || (r.orderStatus || '—');
        r.amountStr = r.totalAmount != null ? Number(r.totalAmount).toFixed(2) : '0.00';
        r.unitPriceStr = r.unitPrice != null ? Number(r.unitPrice).toFixed(2) : '—';
        r.quantityStr = r.quantity != null ? String(r.quantity) : '0';
        r.operatorName = r.operatorName || r.actualOperatorName || '—';
        r.processName = r.processName || '—';
        // D-418：款式封面图（后端 PayrollOperatorProcessSummaryDTO.coverImage，
        // 经 ScanRecordEnrichHelper 从 StyleInfo 补齐）→ 走鉴权 URL 处理后供 <image> 直接用
        r._image = r.coverImage ? fileUrl.getAuthedImageUrl(r.coverImage) : '';
        // D-421：完成时间（endTime 优先=最后扫码时间；无则退到 startTime）
        var endText = fmtDateTime(r.endTime);
        var startText = fmtDateTime(r.startTime);
        if (endText) {
          r._timeText = '完成 ' + endText;
        } else if (startText) {
          r._timeText = '开始 ' + startText;
        } else {
          r._timeText = '';
        }
        // D-421：来源标注（样衣 / 大货 / 裁床）
        var scan = SCAN_TYPE_MAP[String(r.scanType || '').toLowerCase()] || SCAN_TYPE_FALLBACK;
        r._sourceKind = scan.kind;
        r._sourceText = scan.text;
        // D-426：结算类型标签（自己完成 / 内部指派 / 外发工厂）
        var dkey = String(r.delegateTargetType || '').toLowerCase();
        var dty = DELEGATE_TYPE_MAP[dkey] || DELEGATE_TYPE_MAP.none;
        r._factoryKind = dty.kind;
        r._factoryText = dty.text;
        return r;
      });

      that.setData({
        list: enriched,
        totalCount: enriched.length,
        pendingCount: pendingCount,
        auditedCount: auditedCount,
        totalAmountStr: totalAmount.toFixed(2),
        auditableIds: auditableIds,
        // D-423：供批量审核按 PC 端优先级给出准确提示
        notFrozenCount: notFrozenCount,
        noApprovalIdCount: noApprovalIdCount,
        abnormalCount: abnormalCount,
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

  /**
   * D-427：结算类型筛选变更（客户端筛选，无需重新请求）
   */
  onFactoryFilterChange: function (e) {
    var idx = Number(e.detail.value);
    var opt = FACTORY_FILTER_OPTIONS[idx] || FACTORY_FILTER_OPTIONS[0];
    this.setData({
      factoryFilter: opt.value,
      factoryFilterLabel: opt.label,
    });
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

  /**
   * D-421：点击卡片 → 进详情页（不再弹面板；审核按钮仍可直接在卡片上点）
   */
  onTapItem: function (e) {
    var idx = e.currentTarget.dataset.index;
    var item = this.data.list[idx];
    if (!item) return;
    var approvalId = item.approvalId ? String(item.approvalId) : '';
    if (!approvalId) { toast('该明细缺少审批标识，无法查看详情'); return; }
    wx.navigateTo({
      url: '/pages/finance/payroll-approval/detail/index?approvalId=' + encodeURIComponent(approvalId)
        + '&year=' + this.data._year + '&month=' + this.data._month,
    });
  },

  /**
   * D-419：卡片右下「审核通过」按钮（单次确认即执行，不再走弹面板）
   */
  onActionAuditInline: function (e) {
    var that = this;
    var idx = e.currentTarget.dataset.index;
    var item = this.data.list[idx];
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
          that._loadData();
        }).catch(function (err) {
          wx.hideLoading();
          toast('审核失败: ' + (err.errMsg || err.message || err));
        });
      },
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
   * 一键审核当前全部可审核明细（对应 PC 端 handleBatchAuditDetails）
   * D-423：无可审核项时的提示优先级与 PC 端完全对齐：
   *   外发未关单 > 已全部审核 > 缺审批标识 > 无数据
   */
  onBatchAudit: function () {
    var ids = this.data.auditableIds || [];
    if (!ids.length) {
      if (this.data.notFrozenCount > 0) {
        toast('外发工厂订单尚未关单，只有已关单的订单才能审核');
      } else if (this.data.pendingCount === 0 && this.data.auditedCount > 0) {
        toast('已全部审核过，无需重复审核');
      } else if (this.data.noApprovalIdCount > 0) {
        toast('存在缺少审批标识的明细，无法审核');
      } else {
        toast('当前没有可审核的明细');
      }
      return;
    }
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
