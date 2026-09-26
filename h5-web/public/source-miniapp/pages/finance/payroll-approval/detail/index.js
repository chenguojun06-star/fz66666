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
const i18n = require('../../../../utils/i18n/index');
const NS = 'mp.payrollApproval.';
const api = require('../../../../utils/api');
const { toast } = require('../../../../utils/uiHelper');
const { hasFeaturePermission, isFactoryAccount } = require('../../../../utils/permission');
const fileUrl = require('../../../../utils/fileUrl');
const { decodeParam } = require('../../../../utils/urlParams');

// 订单终态（与 PC 端 production.order.ts TERMINAL_ORDER_STATUSES 对齐）
var TERMINAL_ORDER_STATUSES = ['completed', 'closed', 'cancelled', 'scrapped', 'archived'];

var ORDER_STATUS_TEXT = {
  pending: 'stPendingProd', confirmed: 'stConfirmed',
  production: 'mp.pattern.psProducing', in_progress: 'mp.pattern.psProducing',
  completed: 'common.completed', closed: 'stClosed',
  cancelled: 'common.cancelled', canceled: 'common.cancelled',
  scrapped: 'stScrapped', archived: 'stArchived', paused: 'stPaused',
  returned: 'stReturned', delayed: 'stOverdue',
};

function isOrderFrozenByStatus(status) {
  return TERMINAL_ORDER_STATUSES.indexOf(String(status || '').trim().toLowerCase()) >= 0;
}

// D-421：来源标注（用户要求明确区分样衣 / 大货）
// scanType 取值来源：PayrollSettlementOrchestrator.PAYROLL_SCAN_TYPES
var SCAN_TYPE_MAP = {
  pattern: { kind: 'sample', key: 'srcSample' },
  production: { kind: 'bulk', key: 'srcBulk' },
  cutting: { kind: 'cutting', key: 'srcCutting' },
};

// D-429：扫码类型中文映射 —— 与 PC 端 components/common/ScanTypeBadge.tsx 的
// SCAN_TYPE_LABEL 完全一致（此前详情页直接显示英文原值，用户反馈"为什么是英文"）
var SCAN_TYPE_LABEL = {
  production: 'scanProduction', cutting: 'scanCutting', procurement: 'scanProcurement',
  quality: 'scanQuality', pressing: 'scanPressing', packaging: 'scanPackaging',
  warehouse: 'scanWarehouse', warehousing: 'scanWarehouse', sewing: 'scanSewing',
  carSewing: 'scanSewing', pattern: 'scanPattern',
};
function scanTypeLabel(v, lang) {
  var key = String(v || '').trim();
  if (!key) return '-';
  var sk = SCAN_TYPE_LABEL[key];
  return sk ? i18n.t(NS + sk, lang) : i18n.t(NS + 'unknownWord2', lang || i18n.DEFAULT_LANG);
}

// D-426：结算类型（字段为 delegateTargetType，与 PC 端「结算类型」列一致）
//   none/空 → 自己完成   internal → 内部指派   external → 外发工厂
// 只有**明确外发工厂**的订单才要求已关单才能审核。
var DELEGATE_TYPE_MAP = {
  none: { kind: 'self', key: 'delegateSelf' },
  internal: { kind: 'internal', key: 'delegateInternal' },
  external: { kind: 'external', key: 'delegateExternal' },
  factory: { kind: 'external', text: '外发工厂' },  // 后端实际写入值（大写 FACTORY）
};
function isExternalDelegateType(v) {
  var t = String(v || '').toLowerCase();
  return t === 'external' || t === 'factory';
}

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

  /** 静态文案按语言写入（wxml 用 {{t.xxx}}） */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        navTitle: i18n.t(NS + 'navTitle', lang),
        wordStyles: i18n.t(NS + 'wordStyles', lang),
        settleAmount: i18n.t(NS + 'settleAmountW', lang),
        pieceQtyLabel: i18n.t(NS + 'pieceQtyLabel', lang),
        priceProcess: i18n.t('mp.orderDetail.priceProcess', lang),
        formulaLabel: i18n.t(NS + 'formulaLabel', lang),
        timeLabel: i18n.t('common.time', lang),
        startTimeLabel: i18n.t(NS + 'startTimeLabelW', lang),
        completeTimeLabel: i18n.t(NS + 'completeTimeLabel', lang),
        scanCountLabel: i18n.t(NS + 'scanCountLabel', lang),
        linkedInfo: i18n.t('mp.reconciliation.linkedInfo', lang),
        personnelLabel: i18n.t(NS + 'personnelLabel', lang),
        processWord: i18n.t('mp.pattern.processWord', lang),
        sourceLabel: i18n.t('mp.reconciliation.sourceLabel', lang),
        settleTypeLabel: i18n.t('mp.orderDetail.priceMethodLabel', lang),
        orderNoLabel: i18n.t(NS + 'orderNoLabelW', lang),
        orderStatusLabel: i18n.t(NS + 'orderStatusLabelW', lang),
        actualOperator: i18n.t(NS + 'actualOperator', lang),
        auditBtn: i18n.t(NS + 'auditBtn', lang),
        statusAudited: i18n.t(NS + 'statusAudited', lang),
        statusAuditing: i18n.t(NS + 'statusAuditing', lang),
        settleTypeLabel2: i18n.t(NS + 'settleTypeLabel2', lang),
        styleNoLabelW2: i18n.t(NS + 'styleNoLabelW2', lang),
        unitPiece: i18n.t(NS + 'unitPiece', lang),
        perPiece: i18n.t(NS + 'perPiece', lang),
        timesUnit: i18n.t(NS + 'timesUnit', lang),
        processCodeLabel: i18n.t(NS + 'processCodeLabel', lang),
        colorSizeLabel2: i18n.t(NS + 'colorSizeLabel2', lang),
        scanTypeLabel2: i18n.t(NS + 'scanTypeLabel2', lang),
        settlementSheet: i18n.t(NS + 'settlementSheet', lang),
        auditPassBtn: i18n.t(NS + 'auditPassBtn', lang),
        auditedNoRepeat: i18n.t(NS + 'auditedNoRepeat', lang),
        styleNoLabel: i18n.t('mp.scanResult.styleNoLabel', lang),
        colorLabel: i18n.t('common.color', lang),
        sizeLabel: i18n.t('common.size', lang),
      },
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onLoad: function (options) {
    this.applyLanguage(i18n.getLanguage());
    var opts = options || {};
    if (isFactoryAccount()) {
      this.setData({ loadError: i18n.t(NS + 'factoryPermHint', this._lang), loading: false });
      return;
    }
    var approvalId = decodeParam(opts.approvalId);
    if (!approvalId) {
      this.setData({ loadError: i18n.t(NS + 'missingItemKey', this._lang), loading: false });
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
        that.setData({ loading: false, loadError: i18n.t(NS + 'itemGoneMsg', this._lang) });
        return;
      }
      that.setData({ detail: that._enrich(hit), loading: false });
    }).catch(function (e) {
      that.setData({ loading: false, loadError: i18n.t(NS + 'loadFailColon', this._lang) + (e.errMsg || e.message || e) });
    });
  },

  /**
   * 与列表页保持一致的字段加工（审核资格、状态色、时间文案）
   */
  _enrich: function (r) {
    var canOperate = this.data.canOperate;
    // D-426：判定字段为 delegateTargetType；只有明确外发工厂才受关单限制
    var isExternalFactory = isExternalDelegateType(r.delegateTargetType);
    var audited = String(r.approvalStatus || '').toLowerCase() === 'approved';
    var hasApproval = !!(r.approvalId && String(r.approvalId).trim());
    var frozen = isOrderFrozenByStatus(r.orderStatus);
    var canAudit = !isExternalFactory || frozen;
    var eligible = canOperate && hasApproval && !audited && canAudit;

    var blockReason = '';
    if (!hasApproval) blockReason = i18n.t(NS + 'missingAuditId', lang);
    else if (audited) blockReason = i18n.t(NS + 'itemAuditedMsg', lang);
    else if (!canAudit) blockReason = i18n.t(NS + 'factoryNotClosed', lang);

    // D-428：结算异常判定（与列表页同一套规则）
    var amtNum = Number(r.totalAmount || 0);
    var qtyNum = Number(r.quantity || 0);
    var priceNum = Number(r.unitPrice || 0);
    var abnormalText = '';
    if (!hasApproval) {
      abnormalText = i18n.t(NS + 'missingAuditIdLong', lang);
    } else if (qtyNum > 0 && (amtNum <= 0 || priceNum <= 0)) {
      abnormalText = i18n.t(NS + 'zeroAmountWarn', lang);
    }

    r.audited = audited;
    r.canAudit = canAudit;
    r.isExternalFactory = isExternalFactory;
    r.eligible = eligible;
    r.blockReason = blockReason;
    r._abnormalText = abnormalText;
    r._isAbnormal = !!abnormalText;
    r.auditText = audited ? i18n.t(NS + 'statusAudited', lang) : i18n.t(NS + 'statusAuditing', lang);
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
    // D-429：扫码类型中文
    r._scanTypeText = scanTypeLabel(r.scanType);
    // D-429：人员（操作人 / 实际操作人）
    r._operatorText = r.operatorName || r.actualOperatorName || '—';
    r._showActual = !!(r.actualOperatorName && r.actualOperatorName !== r.operatorName);
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
    if (!item.eligible) { toast(item.blockReason || i18n.t(NS + 'cannotAuditNow', this._lang)); return; }
    wx.showModal({
      title: i18n.t(NS + 'auditConfirmTitle', this._lang),
      content: i18n.t(NS + 'auditFmt', this._lang) + (item.operatorName || '') + ' - ' + (item.processName || '') + ' ¥' + item.amountStr + '？',
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: i18n.t(NS + 'handlingTxt', this._lang), mask: true });
        api.payrollSettlement.approveDetail(item.approvalId).then(function () {
          wx.hideLoading();
          toast(i18n.t(NS + 'statusAudited', this._lang));
          that._loadDetail();
        }).catch(function (e) {
          wx.hideLoading();
          toast(i18n.t(NS + 'auditFailPrefix', this._lang) + (e.errMsg || e.message || e));
        });
      },
    });
  },
});