const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');

Page({
  data: {
    loading: true,
    type: 'purchase', // 'purchase' | 'sales'
    id: null,
    detail: null,
    items: [],
    statusLabel: '',
    statusColor: '#64748b',
    canApprove: false,
    canComplete: false,
    canReject: false,
    partyLabel: '供应商',
  },

  onLoad(options) {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    const id = Number(options.id);
    const type = options.type === 'sales' ? 'sales' : 'purchase';
    this.setData({ id, type, partyLabel: type === 'purchase' ? '供应商' : '客户' });
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const { id, type } = this.data;
      const fetcher = type === 'purchase' ? api.purchaseReturn.detail : api.salesReturn.detail;
      const res = await fetcher(id);
      const returnOrder = type === 'purchase' ? (res && (res.returnOrder || res.purchaseReturn || res)) : (res && (res.returnOrder || res.salesReturn || res));
      const items = type === 'purchase' ? (res && (res.items || res.returnItems || [])) : (res && (res.items || res.returnItems || []));
      const status = String((returnOrder && returnOrder.returnStatus) || '').trim();
      this.setData({
        detail: this._normalizeDetail(returnOrder, type),
        items: this._normalizeItems(items, type),
        statusLabel: this._statusLabel(status),
        statusColor: this._statusColor(status),
        canApprove: status === 'PENDING',
        canComplete: status === 'APPROVED' && type === 'purchase',
        canReject: status === 'PENDING' && type === 'sales',
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
      returnType: r.returnType === 'FULL' ? '全部退货' : '部分退货',
      returnReason: r.returnReason || '-',
      totalAmount: Number(r.totalAmount || 0).toFixed(2),
      refundAmount: r.refundAmount != null ? Number(r.refundAmount).toFixed(2) : '',
      returnStatus: r.returnStatus || '',
      operatorName: r.operatorName || '-',
      approveUserName: r.approveUserName || '',
      approveTime: r.approveTime ? String(r.approveTime).replace('T', ' ').slice(0, 16) : '',
      returnTime: r.returnTime ? String(r.returnTime).replace('T', ' ').slice(0, 16) : '',
      refundTime: r.refundTime ? String(r.refundTime).replace('T', ' ').slice(0, 16) : '',
      remark: r.remark || '-',
      createTime: r.createTime ? String(r.createTime).replace('T', ' ').slice(0, 16) : '-',
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

  _statusLabel(status) {
    const map = {
      PENDING: '待审核',
      APPROVED: '已审核',
      RETURNED: '已退货',
      REFUNDED: '已退款',
      REJECTED: '已拒绝',
    };
    return map[status] || status || '-';
  },

  _statusColor(status) {
    const map = {
      PENDING: '#f97316',
      APPROVED: '#16a34a',
      RETURNED: '#2563eb',
      REFUNDED: '#2563eb',
      REJECTED: '#dc2626',
    };
    return map[status] || '#64748b';
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
