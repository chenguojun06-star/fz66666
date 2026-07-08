const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');

Page({
  data: {
    loading: false,
    activeType: 'purchase', // 'purchase' | 'sales'
    activeStatus: 'all',
    typeTabs: [
      { key: 'purchase', label: '采购退货' },
      { key: 'sales', label: '销售退货' },
    ],
    statusTabs: [
      { key: 'all', label: '全部' },
      { key: 'PENDING', label: '待审核' },
      { key: 'APPROVED', label: '已审核' },
      { key: 'RETURNED', label: '已退货' },
      { key: 'REJECTED', label: '已拒绝' },
    ],
    statusTabsSales: [
      { key: 'all', label: '全部' },
      { key: 'PENDING', label: '待审核' },
      { key: 'APPROVED', label: '已审核' },
      { key: 'REFUNDED', label: '已退款' },
      { key: 'REJECTED', label: '已拒绝' },
    ],
    list: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false,
  },

  onLoad() {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this.loadData();
  },

  onShow() {
    if (this._needRefresh) {
      this._needRefresh = false;
      this.loadData();
    }
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore();
    }
  },

  async loadData() {
    this.setData({ page: 1, loading: true });
    try {
      const { activeType, activeStatus, page, pageSize } = this.data;
      const params = { page, pageSize };
      if (activeStatus !== 'all') params.returnStatus = activeStatus;
      const fetcher = activeType === 'purchase' ? api.purchaseReturn.list : api.salesReturn.list;
      const res = await fetcher(params);
      const records = Array.isArray(res) ? res : (res && res.records) || [];
      const total = Array.isArray(res) ? records.length : (res && res.total) || 0;
      this.setData({
        list: this._normalizeList(records, activeType),
        total,
        hasMore: page * pageSize < total,
        loading: false,
      });
    } catch (e) {
      console.error('[ReturnList] loadData error', e);
      this.setData({ loading: false });
      toast.error('加载退货列表失败');
    }
  },

  async loadMore() {
    const nextPage = this.data.page + 1;
    this.setData({ page: nextPage, loading: true });
    try {
      const { activeType, activeStatus, page, pageSize } = this.data;
      const params = { page, pageSize };
      if (activeStatus !== 'all') params.returnStatus = activeStatus;
      const fetcher = activeType === 'purchase' ? api.purchaseReturn.list : api.salesReturn.list;
      const res = await fetcher(params);
      const records = Array.isArray(res) ? res : (res && res.records) || [];
      const merged = this.data.list.concat(this._normalizeList(records, activeType));
      const total = Array.isArray(res) ? merged.length : (res && res.total) || 0;
      this.setData({ list: merged, total, hasMore: page * pageSize < total, loading: false });
    } catch (e) {
      console.error('[ReturnList] loadMore error', e);
      this.setData({ loading: false });
    }
  },

  onTypeChange(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeType) return;
    this.setData({ activeType: key, activeStatus: 'all' });
    this.loadData();
  },

  onStatusChange(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeStatus) return;
    this.setData({ activeStatus: key });
    this.loadData();
  },

  _normalizeList(records, type) {
    if (!Array.isArray(records)) return [];
    return records.map(r => {
      const status = String(r.returnStatus || '').trim();
      const statusLabel = this._statusLabel(status, type);
      const isPurchase = type === 'purchase';
      return {
        id: r.id,
        returnNo: r.returnNo || '-',
        originalNo: isPurchase ? (r.originalPurchaseNo || '-') : (r.originalOrderNo || '-'),
        partyName: isPurchase ? (r.supplierName || '-') : (r.customerName || '-'),
        returnType: r.returnType === 'FULL' ? '全部退货' : '部分退货',
        returnReason: r.returnReason || '-',
        totalAmount: Number(r.totalAmount || 0).toFixed(2),
        returnStatus: status,
        statusLabel,
        statusColor: this._statusColor(status),
        createTime: r.createTime ? String(r.createTime).replace('T', ' ').slice(0, 16) : '-',
        _type: type,
      };
    });
  },

  _statusLabel(status, type) {
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

  goDetail(e) {
    const { id, type } = e.currentTarget.dataset;
    this._needRefresh = true;
    wx.navigateTo({
      url: `/pages/return/detail/index?id=${id}&type=${type}`,
    });
  },
});
