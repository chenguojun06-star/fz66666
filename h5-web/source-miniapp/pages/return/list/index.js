const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { bindPageEvents, unbindPageEvents } = require('../../../utils/pageEventBinder');
const { hasFeaturePermission } = require('../../../utils/permission');
const displayHelper = require('../../../utils/displayHelper');

// 退货状态文案兜底：RETURNED/APPROVED/REFUNDED 是退货业务专属状态，
// 不在 displayHelper.RETURN_STATUS_LABEL 中，本地保留兜底文案
const RETURN_STATUS_FALLBACK = {
  RETURNED: '已退货',
  APPROVED: '已批准',
  REFUNDED: '已退款',
};

function returnStatusLabel(status) {
  if (RETURN_STATUS_FALLBACK[status]) return RETURN_STATUS_FALLBACK[status];
  var fromHelper = displayHelper.displayReturnStatusText(status);
  return fromHelper || status || '-';
}

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
      { key: 'all', label: '全部', cls: 'all' },
      { key: 'PENDING', label: returnStatusLabel('PENDING'), cls: 'pending' },
      { key: 'APPROVED', label: returnStatusLabel('APPROVED'), cls: 'approved' },
      { key: 'RETURNED', label: returnStatusLabel('RETURNED'), cls: 'returned' },
      { key: 'REJECTED', label: returnStatusLabel('REJECTED'), cls: 'rejected' },
    ],
    statusTabsSales: [
      { key: 'all', label: '全部', cls: 'all' },
      { key: 'PENDING', label: returnStatusLabel('PENDING'), cls: 'pending' },
      { key: 'APPROVED', label: returnStatusLabel('APPROVED'), cls: 'approved' },
      { key: 'REFUNDED', label: returnStatusLabel('REFUNDED'), cls: 'refunded' },
      { key: 'REJECTED', label: returnStatusLabel('REJECTED'), cls: 'rejected' },
    ],
    statusCounts: {
      all: 0,
      PENDING: 0,
      APPROVED: 0,
      RETURNED: 0,
      REFUNDED: 0,
      REJECTED: 0,
    },
    list: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false,
  },

  onLoad() {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    if (!hasFeaturePermission('view_purchase_return') && !hasFeaturePermission('view_sales_return')) {
      toast('您没有查看退货的权限');
      wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/dashboard/index' }) });
      return;
    }
    this.loadData();
    bindPageEvents(this, () => this.loadData());
  },

  onUnload() {
    unbindPageEvents(this);
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
      const updateData = {
        list: this._normalizeList(records, activeType),
        total,
        hasMore: page * pageSize < total,
        loading: false,
      };
      if (activeStatus === 'all') {
        updateData.statusCounts = this._computeCounts(records, total);
      }
      this.setData(updateData);
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
      const updateData = { list: merged, total, hasMore: page * pageSize < total, loading: false };
      if (activeStatus === 'all') {
        const counts = { all: total, PENDING: 0, APPROVED: 0, RETURNED: 0, REFUNDED: 0, REJECTED: 0 };
        merged.forEach(r => {
          if (Object.prototype.hasOwnProperty.call(counts, r.returnStatus)) counts[r.returnStatus]++;
        });
        updateData.statusCounts = counts;
      }
      this.setData(updateData);
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

  _computeCounts(records, total) {
    const counts = { all: total, PENDING: 0, APPROVED: 0, RETURNED: 0, REFUNDED: 0, REJECTED: 0 };
    records.forEach(r => {
      const status = String(r.returnStatus || '').trim();
      if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status]++;
    });
    return counts;
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
        reasonType: r.returnReason || '-',
        reasonDetail: r.remark || '',
        totalAmount: Number(r.totalAmount || 0).toFixed(2),
        returnStatus: status,
        statusLabel,
        statusColor: this._statusColor(status),
        createTime: r.createTime ? String(r.createTime).replace('T', ' ').slice(0, 16) : '-',
        _type: type,
      };
    });
  },

  _statusLabel(status, _type) {
    return returnStatusLabel(status);
  },

  _statusColor(status) {
    const map = {
      PENDING: 'warning',
      APPROVED: 'success',
      RETURNED: 'gray',
      REFUNDED: 'blue',
      REJECTED: 'danger',
    };
    return map[status] || 'gray';
  },

  goDetail(e) {
    const { id, type } = e.currentTarget.dataset;
    this._needRefresh = true;
    wx.navigateTo({
      url: `/pages/return/detail/index?id=${id}&type=${type}`,
    });
  },
});
