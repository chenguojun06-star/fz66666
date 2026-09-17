/**
 * 物料对账详情页（D-419 详情页）
 *
 * 从列表页 onTapItem 跳转进入；展示完整字段 + 状态时间线 + 操作。
 * 操作按钮与列表卡片右下按钮同源（onActionAdvance / onActionReturn）。
 */
const api = require('../../../../utils/api');
const { toast } = require('../../../../utils/uiHelper');
const { hasFeaturePermission, isFactoryAccount } = require('../../../../utils/permission');
const { getAuthedImageUrl } = require('../../../../utils/fileUrl');

// 与列表页保持一致
var STATUS_TEXT_MAP = {
  pending: '待核实',
  verified: '已核实',
  approved: '已审批',
  paid: '已付款',
  rejected: '已驳回',
};
var STATUS_COLOR_MAP = {
  pending: 'var(--color-warning)',
  verified: 'var(--color-primary)',
  approved: 'var(--color-success)',
  paid: 'var(--color-success)',
  rejected: 'var(--color-danger)',
};
var NEXT_STEP = {
  pending: { status: 'verified', label: '核实通过' },
  verified: { status: 'approved', label: '审批通过' },
  approved: { status: 'paid', label: '标记已付款' },
};

// D-421：来源标注（用户要求明确区分样衣 / 大货）
// MaterialPurchase.sourceType: order=批量订单(大货) / sample=样衣开发
var SOURCE_TYPE_MAP = {
  sample: { kind: 'sample', text: '样衣采购' },
  order: { kind: 'bulk', text: '大货采购' },
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

  onLoad: function (options) {
    var opts = options || {};
    if (isFactoryAccount()) {
      this.setData({
        loadError: '工厂账号不可查看物料对账',
        loading: false,
      });
      return;
    }
    var id = opts.id ? String(opts.id) : '';
    if (!id) {
      this.setData({ loadError: '缺少对账记录ID', loading: false });
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
      r.statusText = STATUS_TEXT_MAP[r.status] || r.status || '—';
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
        nextLabel: that.data.canOperate && next ? next.label : '',
        canReturn: !!(that.data.canOperate && r.status && r.status !== 'pending' && r.status !== 'rejected'),
        loading: false,
      });
    }).catch(function (e) {
      that.setData({
        loading: false,
        loadError: '加载失败：' + (e.errMsg || e.message || e),
      });
    });
  },

  onActionAdvance: function () {
    var that = this;
    var item = this.data.detail;
    if (!item) return;
    var next = NEXT_STEP[item.status];
    if (!next) { toast('当前状态无可执行操作'); return; }
    wx.showModal({
      title: '确认' + next.label,
      content: next.label + '单号 ' + (item.reconciliationNo || '—') + '？',
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...', mask: true });
        api.materialReconciliation.statusAction(item.id, 'update', next.status, '').then(function () {
          wx.hideLoading();
          toast('已' + next.label);
          that._loadDetail(item.id);
        }).catch(function (e) {
          wx.hideLoading();
          toast('操作失败: ' + (e.errMsg || e.message || e));
        });
      },
    });
  },

  onActionReturn: function () {
    var that = this;
    var item = this.data.detail;
    if (!item) return;
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
          that._loadDetail(item.id);
        }).catch(function (e) {
          wx.hideLoading();
          toast('退回失败: ' + (e.errMsg || e.message || e));
        });
      },
    });
  },
});