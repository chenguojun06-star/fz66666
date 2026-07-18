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

  onLoad(options) {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    const id = Number(options.id);
    const type = options.type === 'sales' ? 'sales' : 'purchase';
    this.setData({ id, type, partyLabel: type === 'purchase' ? '供应商' : '客户' });
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
      toast.error('加载退货详情失败');
    }
  },

  _normalizeDetail(r, type) {
    if (!r) return null;
    return {
      returnNo: r.returnNo || '-',
      originalNo: type === 'purchase' ? (r.originalPurchaseNo || '-') : (r.originalOrderNo || '-'),
      partyName: type === 'purchase' ? (r.supplierName || '-') : (r.customerName || '-'),
      returnType: r.returnType === 'FULL' ? '全部退货' : (r.returnType === 'PARTIAL' ? '部分退货' : (r.returnType || '-')),
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
      unit: it.unit || (type === 'purchase' ? '' : '件'),
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
      title: '确认审核',
      content: '确定通过此退货单的审核？',
      confirmText: '通过',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          if (type === 'purchase') {
            await api.purchaseReturn.approve(id, { approved: true });
          } else {
            await api.salesReturn.approve(id, {});
          }
          toast.success('审核通过');
          this.loadDetail();
        } catch (e) {
          toast.error(e && e.errMsg ? e.errMsg : '审核失败');
        }
      },
    });
  },

  async onReject() {
    const { id, type } = this.data;
    wx.showModal({
      title: '拒绝退货',
      editable: true,
      placeholderText: '请输入拒绝原因',
      confirmText: '确认拒绝',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return;
        const reason = (res.content || '').trim();
        if (!reason) {
          toast.error('请输入拒绝原因');
          return;
        }
        try {
          if (type === 'purchase') {
            await api.purchaseReturn.approve(id, { approved: false, reason });
          } else {
            await api.salesReturn.reject(id, reason);
          }
          toast.success('已拒绝');
          this.loadDetail();
        } catch (e) {
          toast.error(e && e.errMsg ? e.errMsg : '操作失败');
        }
      },
    });
  },

  async onComplete() {
    const { id } = this.data;
    wx.showModal({
      title: '确认完成退货',
      content: '完成后将更新库存和应付账款，确定继续？',
      confirmText: '确认完成',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.purchaseReturn.complete(id);
          toast.success('退货已完成');
          this.loadDetail();
        } catch (e) {
          toast.error(e && e.errMsg ? e.errMsg : '操作失败');
        }
      },
    });
  },

  async onRefund() {
    const { id } = this.data;
    wx.showModal({
      title: '确认退款完成',
      content: '确认此销售退货单已退款给客户？',
      confirmText: '确认退款',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.salesReturn.markRefunded(id);
          toast.success('已标记退款完成');
          this.loadDetail();
        } catch (e) {
          toast.error(e && e.errMsg ? e.errMsg : '操作失败');
        }
      },
    });
  },
});
