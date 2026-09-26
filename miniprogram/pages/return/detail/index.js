const i18n = require('../../../utils/i18n/index');
const NS = 'mp.returnDetail.';
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { bindPageEvents, unbindPageEvents } = require('../../../utils/pageEventBinder');
const Display = require('../../../utils/displayHelper');

Page({
  data: {
    loading: true,
    type: 'purchase', // 'purchase' | 'sales'
    id: null,
    detail: null,
    items: [],
    statusLabel: '',
    statusClass: 'gray',
    canApprove: false,
    canComplete: false,
    canReject: false,
    showRefundBtn: false,
    partyLabel: '供应商',
    returnRatio: '0%',
  },

  /** 静态文案按语言写入（wxml 用 {{t.xxx}}） */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        navTitle: i18n.t(NS + 'navTitle', lang),
        returnAmtLabel: i18n.t(NS + 'returnAmtLabel', lang),
        returnRatio: i18n.t(NS + 'returnRatio', lang),
        returnItemCount: i18n.t(NS + 'returnItemCount', lang),
        basicInfoTitle: i18n.t(NS + 'basicInfoTitle', lang),
        originalNoLabel: i18n.t(NS + 'originalNoLabel', lang),
        returnTypeLabel: i18n.t(NS + 'returnTypeLabel', lang),
        partyLabel: i18n.t(this.data.type === 'purchase' ? NS + 'supplierLabel' : NS + 'customerLabel', lang),
        operatorLabel: i18n.t(NS + 'operatorLabel', lang),
        createTimeLabel: i18n.t(NS + 'createTimeLabel', lang),
        auditorLabel: i18n.t(NS + 'auditorLabel', lang),
        auditTimeLabel: i18n.t(NS + 'auditTimeLabel', lang),
        returnTimeLabel: i18n.t(NS + 'returnTimeLabel', lang),
        refundTimeLabel: i18n.t(NS + 'refundTimeLabel', lang),
        refundAmtLabel: i18n.t(NS + 'refundAmtLabel', lang),
        returnReason: i18n.t(NS + 'returnReason', lang),
        remarkLabel: i18n.t(NS + 'remarkLabel', lang),
        returnDetailTitle: i18n.t(NS + 'returnDetailTitle', lang),
        rejectBtn: i18n.t(NS + 'rejectBtn', lang),
        auditPassBtn: i18n.t(NS + 'auditPassBtn', lang),
        completeReturnBtn: i18n.t(NS + 'completeReturnBtn', lang),
        markRefundedBtn: i18n.t(NS + 'markRefundedBtn', lang),
        cancel: i18n.t('common.cancel', lang),
        itemsUnitW: i18n.t(NS + 'itemsUnitW', lang),
        fullReturnW: i18n.t(NS + 'stFull', lang),
        qtyLabelW: i18n.t(NS + 'qtyLabelW', lang),
        unitPriceW: i18n.t(NS + 'unitPriceW', lang),
      },
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onLoad(options) {
    this.applyLanguage(i18n.getLanguage());
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    const id = Number(options.id);
    const type = options.type === 'sales' ? 'sales' : 'purchase';
    this.setData({ id: id, type: type, partyLabel: i18n.t(type === 'purchase' ? NS + 'supplierLabel' : NS + 'customerLabel', this._lang) });
    this.loadDetail();
    bindPageEvents(this, () => this.loadDetail());
  },

  onUnload() {
    unbindPageEvents(this);
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const { id, type } = this.data;
      const fetcher = type === 'purchase' ? api.purchaseReturn.detail : api.salesReturn.detail;
      const res = await fetcher(id);
      const returnOrder = type === 'purchase' ? (res && (res.returnOrder || res.purchaseReturn || res)) : (res && (res.returnOrder || res.salesReturn || res));
      const items = type === 'purchase' ? (res && (res.items || res.returnItems || [])) : (res && (res.items || res.returnItems || []));
      const status = String((returnOrder && returnOrder.returnStatus) || '').trim().toUpperCase();
      const detail = this._normalizeDetail(returnOrder, type);
      const normalizedItems = this._normalizeItems(items, type);
      const statusInfo = Display.displayReturnStatus(this._mapReturnStatus(status));
      const returnRatio = this._calcReturnRatio(returnOrder, normalizedItems);
      this.setData({
        detail: detail,
        items: normalizedItems,
        statusLabel: statusInfo.text,
        statusClass: this._colorToClass(statusInfo.color),
        returnRatio: returnRatio,
        canApprove: status === 'PENDING',
        canComplete: status === 'APPROVED' && type === 'purchase',
        canReject: status === 'PENDING' && type === 'sales',
        showRefundBtn: type === 'sales' && status === 'APPROVED',
        loading: false,
      });
    } catch (e) {
      console.error('[ReturnDetail] loadDetail error', e);
      this.setData({ loading: false });
      toast.error(i18n.t(NS + 'loadFailW', this._lang));
    }
  },

  _normalizeDetail(r, type) {
    if (!r) return null;
    return {
      returnNo: r.returnNo || '-',
      originalNo: type === 'purchase' ? (r.originalPurchaseNo || '-') : (r.originalOrderNo || '-'),
      partyName: type === 'purchase' ? (r.supplierName || '-') : (r.customerName || '-'),
      returnType: r.returnType === 'FULL' ? i18n.t(NS + 'stFull', this._lang) : (r.returnType === 'PARTIAL' ? i18n.t(NS + 'stPartial', this._lang) : (r.returnType || '-')),
      returnReason: r.returnReason || '-',
      totalAmount: Number(r.totalAmount || 0).toFixed(2),
      refundAmount: r.refundAmount != null ? Number(r.refundAmount).toFixed(2) : '',
      returnStatus: r.returnStatus || '',
      operatorName: r.operatorName || '-',
      approveUserName: r.approveUserName || '',
      approveTime: Display.formatDateTime(r.approveTime),
      returnTime: Display.formatDateTime(r.returnTime),
      refundTime: Display.formatDateTime(r.refundTime),
      remark: r.remark || '-',
      createTime: Display.formatDateTime(r.createTime),
    };
  },

  _normalizeItems(items, type) {
    if (!Array.isArray(items)) return [];
    return items.map((it, idx) => ({
      idx: idx + 1,
      name: type === 'purchase' ? (it.materialName || '-') : (it.styleName || it.styleNo || '-'),
      code: type === 'purchase' ? (it.materialCode || '') : (it.styleNo || ''),
      color: it.color || '',
      size: it.size || '',
      quantity: it.quantity || 0,
      unit: it.unit || (type === 'purchase' ? '' : i18n.t(NS + 'pieceUnit', this._lang)),
      unitPrice: Number(it.unitPrice || 0).toFixed(2),
      amount: Number(it.amount || 0).toFixed(2),
      returnReason: it.returnReason || '',
    }));
  },

  _mapReturnStatus(status) {
    const s = String(status || '').toLowerCase();
    const map = {
      PENDING: 'pending',
      APPROVED: 'processing',
      RETURNED: 'completed',
      REFUNDED: 'completed',
      REJECTED: 'rejected',
    };
    return map[status] || s || 'pending';
  },

  _colorToClass(color) {
    const c = String(color || '');
    if (c.includes('success')) return 'success';
    if (c.includes('warning')) return 'warning';
    if (c.includes('error') || c.includes('danger')) return 'danger';
    if (c.includes('primary') || c.includes('processing')) return 'blue';
    if (c.includes('info')) return 'blue';
    return 'gray';
  },

  _calcReturnRatio(returnOrder, _items) {
    if (!returnOrder || returnOrder.returnType === 'FULL') return '100%';
    const total = Number(returnOrder.originalAmount || returnOrder.totalOriginalAmount || 0);
    const returned = Number(returnOrder.totalAmount || 0);
    if (total <= 0) return '-';
    return Display.calcProgressPercent(returned, total, 0);
  },

  async onApprove() {
    const { id, type } = this.data;
    wx.showModal({
      title: i18n.t(NS + 'auditTitle', this._lang),
      content: i18n.t(NS + 'auditPassConfirm', this._lang),
      confirmText: i18n.t(NS + 'passWord', this._lang),
      cancelText: i18n.t('common.cancel', this._lang),
      success: async (res) => {
        if (!res.confirm) return;
        try {
          if (type === 'purchase') {
            await api.purchaseReturn.approve(id, { approved: true });
          } else {
            await api.salesReturn.approve(id, {});
          }
          toast.success(i18n.t(NS + 'auditPassed', this._lang));
          this.loadDetail();
        } catch (e) {
          toast.error(e && e.errMsg ? e.errMsg : i18n.t(NS + 'auditFailW', this._lang));
        }
      },
    });
  },

  async onReject() {
    const { id, type } = this.data;
    wx.showModal({
      title: i18n.t(NS + 'rejectTitle', this._lang),
      editable: true,
      placeholderText: i18n.t(NS + 'rejectReasonReq', this._lang),
      confirmText: i18n.t(NS + 'rejectConfirm', this._lang),
      cancelText: i18n.t('common.cancel', this._lang),
      success: async (res) => {
        if (!res.confirm) return;
        const reason = (res.content || '').trim();
        if (!reason) {
          toast.error(i18n.t(NS + 'rejectReasonReq', this._lang));
          return;
        }
        try {
          if (type === 'purchase') {
            await api.purchaseReturn.approve(id, { approved: false, reason });
          } else {
            await api.salesReturn.reject(id, reason);
          }
          toast.success(i18n.t(NS + 'rejected', this._lang));
          this.loadDetail();
        } catch (e) {
          toast.error(e && e.errMsg ? e.errMsg : i18n.t(NS + 'opFailW', this._lang));
        }
      },
    });
  },

  async onComplete() {
    const { id } = this.data;
    wx.showModal({
      title: i18n.t(NS + 'completeTitle', this._lang),
      content: i18n.t(NS + 'completeHint', this._lang),
      confirmText: i18n.t(NS + 'confirmComplete', this._lang),
      cancelText: i18n.t('common.cancel', this._lang),
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.purchaseReturn.complete(id);
          toast.success(i18n.t(NS + 'returnDone', this._lang));
          this.loadDetail();
        } catch (e) {
          toast.error(e && e.errMsg ? e.errMsg : i18n.t(NS + 'opFailW', this._lang));
        }
      },
    });
  },

  async onRefund() {
    const { id } = this.data;
    wx.showModal({
      title: i18n.t(NS + 'refundTitle', this._lang),
      content: i18n.t(NS + 'refundConfirm', this._lang),
      confirmText: i18n.t(NS + 'refundConfirmBtn', this._lang),
      cancelText: i18n.t('common.cancel', this._lang),
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.salesReturn.markRefunded(id);
          toast.success(i18n.t(NS + 'refundMarked', this._lang));
          this.loadDetail();
        } catch (e) {
          toast.error(e && e.errMsg ? e.errMsg : i18n.t(NS + 'opFailW', this._lang));
        }
      },
    });
  },
});
