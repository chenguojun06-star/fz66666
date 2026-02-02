const api = require('../../../../utils/api');

function computeAvailable(order) {
  const inStockRaw = Number(order && order.inStockQuantity);
  if (!Number.isNaN(inStockRaw)) {
    return Math.max(0, inStockRaw);
  }
  const inQty = Number(order && order.warehousingQualifiedQuantity) || 0;
  const outQty = Number(order && order.outstockQuantity) || 0;
  return Math.max(0, inQty - outQty);
}

Page({
  data: {
    keyword: '',
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    isRefreshing: false,
    modal: {
      visible: false,
      order: null,
      quantity: '',
      remark: '',
      submitting: false
    }
  },

  onLoad() {
    this.loadData(true);
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.loadData(true);
  },

  async loadData(reset = false) {
    if (this.data.loading) {
      return;
    }

    if (reset) {
      this.setData({ page: 1, hasMore: true, list: [] });
    }

    if (!this.data.hasMore) {
      return;
    }

    this.setData({ loading: true });

    try {
      const { page, pageSize, keyword } = this.data;
      const params = { page, pageSize };
      const kw = String(keyword || '').trim();
      if (kw) {
        params.keyword = kw;
        if (kw.toUpperCase().startsWith('PO')) {
          params.orderNo = kw;
        } else {
          params.styleNo = kw;
        }
      }
      const data = await api.production.listOrders(params);
      const records = (data && data.records) || [];
      const mapped = records.map(item => ({
        ...item,
        availableQty: computeAvailable(item)
      }));
      const visibleList = mapped.filter(item => item.availableQty > 0);
      this.setData({
        list: reset ? visibleList : [...this.data.list, ...visibleList],
        hasMore: records.length === pageSize,
        page: page + 1
      });
    } catch (error) {
      console.error('加载列表失败', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false, isRefreshing: false });
    }
  },

  onRefresh() {
    this.setData({ isRefreshing: true });
    this.loadData(true);
  },

  onLoadMore() {
    this.loadData();
  },

  openOutstockModal(e) {
    const index = Number(e.currentTarget.dataset.index);
    const order = this.data.list[index];
    if (!order) {
      wx.showToast({ title: '订单信息缺失', icon: 'none' });
      return;
    }
    this.setData({
      modal: {
        visible: true,
        order,
        quantity: '',
        remark: '',
        submitting: false
      }
    });
  },

  closeOutstockModal() {
    this.setData({
      modal: {
        visible: false,
        order: null,
        quantity: '',
        remark: '',
        submitting: false
      }
    });
  },

  onModalQuantityInput(e) {
    this.setData({ 'modal.quantity': e.detail.value });
  },

  onModalRemarkInput(e) {
    this.setData({ 'modal.remark': e.detail.value });
  },

  async onConfirmOutstock() {
    const { modal } = this.data;
    const order = modal.order;
    const qty = Number(modal.quantity);
    const available = computeAvailable(order);

    if (!order) {
      wx.showToast({ title: '订单信息缺失', icon: 'none' });
      return;
    }

    if (!qty || qty <= 0) {
      wx.showToast({ title: '请输入有效出库数量', icon: 'none' });
      return;
    }

    if (qty > available) {
      wx.showToast({ title: '出库数量不能超过可用库存', icon: 'none' });
      return;
    }

    this.setData({ 'modal.submitting': true });

    try {
      await api.production.createOutstock({
        orderId: order.id,
        orderNo: order.orderNo,
        styleNo: order.styleNo,
        styleName: order.styleName,
        outstockQuantity: qty,
        remark: modal.remark || ''
      });
      wx.showToast({ title: '出库成功' });
      this.closeOutstockModal();
      this.loadData(true);
    } catch (error) {
      console.error('出库失败', error);
      wx.showToast({ title: '出库失败', icon: 'none' });
    } finally {
      this.setData({ 'modal.submitting': false });
    }
  }
});
