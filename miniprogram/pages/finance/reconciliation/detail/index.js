/**
 * 物料对账详情页（D-419 详情页）
 *
 * 从列表页 onTapItem 跳转进入；展示完整字段 + 状态时间线 + 操作。
 * 操作按钮与列表卡片右下按钮同源（onActionAdvance / onActionReturn）。
 */
const i18n = require('../../../../utils/i18n/index');
const NS = 'mp.reconciliation.';
const api = require('../../../../utils/api');
const { toast } = require('../../../../utils/uiHelper');
const { hasFeaturePermission, isFactoryAccount } = require('../../../../utils/permission');
const { getAuthedImageUrl } = require('../../../../utils/fileUrl');
const { decodeParam } = require('../../../../utils/urlParams');

// 与列表页保持一致
var STATUS_TEXT_MAP = {
  pending: 'stPending',
  verified: 'stVerified',
  approved: 'stApproved',
  paid: 'stPaid',
  rejected: 'stRejected',
};
var STATUS_COLOR_MAP = {
  pending: 'var(--color-warning)',
  verified: 'var(--color-primary)',
  approved: 'var(--color-success)',
  paid: 'var(--color-success)',
  rejected: 'var(--color-danger)',
};
var NEXT_STEP = {
  pending: { status: 'verified', key: 'actVerify' },
  verified: { status: 'approved', key: 'actApprove' },
  approved: { status: 'paid', key: 'actMarkPaid' },
};

// D-421：来源标注（用户要求明确区分样衣 / 大货）
// MaterialPurchase.sourceType: order=批量订单(大货) / sample=样衣开发
var SOURCE_TYPE_MAP = {
  sample: { kind: 'sample', key: 'samplePurchase' },
  order: { kind: 'bulk', key: 'bulkPurchase' },
};

function fmtMoney(v) {
  if (v == null) return '—';
  var n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}
function fmtDate(v) {
  if (!v) return '';
  return String(v).replace('T', ' ').slice(0, 16);
}

Page({
  data: {
    detail: null,
    loading: true,
    loadError: '',
    canOperate: false,
    nextLabel: '',
    canReturn: false,
  },

  /** 静态文案按语言写入（wxml 用 {{t.xxx}}），映射按语言解析 */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this._langResolved = {};
    var self = this;
    Object.keys(STATUS_TEXT_MAP).forEach(function (k) {
      self._langResolved[k] = i18n.t(NS + STATUS_TEXT_MAP[k], lang);
    });
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        navTitle: i18n.t(NS + 'navTitle', lang),
        finalAmount: i18n.t(NS + 'finalAmount', lang),
        unitPriceLabel: i18n.t(NS + 'unitPriceLabel', lang),
        reconQtyLabel: i18n.t(NS + 'reconQtyLabel', lang),
        whLocation: i18n.t(NS + 'whLocation', lang),
        statusFlow: i18n.t(NS + 'statusFlow', lang),
        createdW: i18n.t(NS + 'createdW', lang),
        verifyW: i18n.t(NS + 'verifyW', lang),
        approveW: i18n.t(NS + 'approveW', lang),
        payW: i18n.t(NS + 'payW', lang),
        pendingTag: i18n.t(NS + 'stPending', lang),
        approveTag: i18n.t(NS + 'stApproved', lang),
        payTag: i18n.t(NS + 'stPaid', lang),
        linkedInfo: i18n.t(NS + 'linkedInfo', lang),
        sourceLabel: i18n.t(NS + 'sourceLabel', lang),
        supplierContact: i18n.t(NS + 'supplierContact', lang),
        buyerLabel: i18n.t(NS + 'buyerLabel', lang),
        purchaseNoLabel: i18n.t(NS + 'purchaseNoLabel', lang),
        reconDateLabel: i18n.t(NS + 'reconDateLabel', lang),
        expectArrival: i18n.t(NS + 'expectArrival', lang),
        actualArrival: i18n.t(NS + 'actualArrival', lang),
        inboundDate: i18n.t(NS + 'inboundDate', lang),
        remarkLabel: i18n.t('common.remark', lang),
        returnBtn: i18n.t(NS + 'returnBtn', lang),
        matCharW: i18n.t(NS + 'matCharW', lang),
        sourcePrefix: i18n.t(NS + 'sourcePrefix', lang),
        supplierPrefix: i18n.t(NS + 'supplierPrefix', lang),
        materialPrefix: i18n.t(NS + 'materialPrefix', lang),
        totalAmountLabel: i18n.t(NS + 'totalAmountLabel', lang),
        deductionLabel: i18n.t(NS + 'deductionLabel', lang),
        operatorPrefix: i18n.t(NS + 'operatorPrefix', lang),
        auditorPrefix: i18n.t(NS + 'auditorPrefix', lang),
        reasonPrefix: i18n.t(NS + 'reasonPrefix', lang),
      },
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onLoad: function (options) {
    this.applyLanguage(i18n.getLanguage());
    var opts = options || {};
    if (isFactoryAccount()) {
      this.setData({
        loadError: i18n.t(NS + 'factoryPermHintShort', this._lang),
        loading: false,
      });
      return;
    }
    var id = decodeParam(opts.id);
    if (!id) {
      this.setData({ loadError: i18n.t(NS + 'missingReconId', this._lang), loading: false });
      return;
    }
    this.setData({
      canOperate: hasFeaturePermission('approve_reconciliation'),
      _id: id,
    });
    this._loadDetail(id);
  },

  _loadDetail: function (id) {
    var that = this;
    this.setData({ loading: true, loadError: '' });
    api.materialReconciliation.getById(id).then(function (r) {
      r.statusText = this._langResolved ? (this._langResolved[r.status] || r.status) : (STATUS_TEXT_MAP[r.status] || r.status || '—');
      r._statusColor = STATUS_COLOR_MAP[r.status] || 'var(--color-text-tertiary)';
      r._image = r.materialImageUrl ? getAuthedImageUrl(r.materialImageUrl) : '';
      r.amountStr = fmtMoney(r.finalAmount != null ? r.finalAmount : r.totalAmount);
      r.totalAmountStr = fmtMoney(r.totalAmount);
      r.deductionAmountStr = fmtMoney(r.deductionAmount);
      // WXML 表达式不支持 Number() 等内置函数调用，扣减行是否显示必须在 JS 侧算好
      var deduction = Number(r.deductionAmount);
      r._hasDeduction = Number.isFinite(deduction) && deduction > 0;
      r.unitPriceStr = fmtMoney(r.unitPrice);
      r.quantityStr = r.quantity != null ? String(Number(r.quantity)) : '—';
      // D-421：来源标注（样衣采购 / 大货采购）
      var src = SOURCE_TYPE_MAP[String(r.sourceType || '').toLowerCase()] || null;
      r._sourceKind = src ? src.kind : '';
      r._sourceText = src ? src.text : '';
      // 时间字段格式化
      ['createTime', 'verifiedAt', 'approvedAt', 'paidAt', 'reReviewAt',
       'expectedArrivalDate', 'actualArrivalDate', 'inboundDate'].forEach(function (k) {
        if (r[k]) r[k] = fmtDate(r[k]);
      });
      // 推导底部按钮
      var next = NEXT_STEP[r.status];
      that.setData({
        detail: r,
        nextLabel: that.data.canOperate && next ? i18n.t(NS + next.key, that._lang) : '',
        canReturn: !!(that.data.canOperate && r.status && r.status !== 'pending' && r.status !== 'rejected'),
        loading: false,
      });
    }).catch(function (e) {
      that.setData({
        loading: false,
        loadError: i18n.t(NS + 'loadFailColon', this._lang) + (e.errMsg || e.message || e),
      });
    });
  },

  onActionAdvance: function () {
    var that = this;
    var item = this.data.detail;
    if (!item) return;
    var next = NEXT_STEP[item.status];
    if (!next) { toast(i18n.t(NS + 'noStateAction', this._lang)); return; }
    wx.showModal({
      title: i18n.t(NS + 'confirmOpTitle', this._lang),
      content: i18n.tf(NS + 'confirmOpFmt', { act: i18n.t(NS + next.key, this._lang), no: item.reconciliationNo || '—' }, this._lang),
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: i18n.t(NS + 'handlingTxt', this._lang), mask: true });
        api.materialReconciliation.statusAction(item.id, 'update', next.status, '').then(function () {
          wx.hideLoading();
          toast(i18n.t(NS + next.key, this._lang));
          that._loadDetail(item.id);
        }).catch(function (e) {
          wx.hideLoading();
          toast(i18n.t(NS + 'opFailPrefix', this._lang) + (e.errMsg || e.message || e));
        });
      },
    });
  },

  onActionReturn: function () {
    var that = this;
    var item = this.data.detail;
    if (!item) return;
    wx.showModal({
      title: i18n.t(NS + 'returnBtn', this._lang),
      content: '',
      editable: true,
      placeholderText: i18n.t(NS + 'rejectReasonReq', this._lang),
      success: function (res) {
        if (!res.confirm) return;
        var reason = (res.content || '').trim();
        if (!reason) { toast(i18n.t(NS + 'rejectReasonReq', this._lang)); return; }
        wx.showLoading({ title: i18n.t(NS + 'handlingTxt', this._lang), mask: true });
        api.materialReconciliation.statusAction(item.id, 'return', '', reason).then(function () {
          wx.hideLoading();
          toast(i18n.t(NS + 'returnedW', this._lang));
          that._loadDetail(item.id);
        }).catch(function (e) {
          wx.hideLoading();
          toast(i18n.t(NS + 'returnFailPrefix', this._lang) + (e.errMsg || e.message || e));
        });
      },
    });
  },
});