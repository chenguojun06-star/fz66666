const api = require('../../../../utils/api');

function toInt(value) {
  const n = Number(value);
  if (Number.isNaN(n)) {
    return 0;
  }
  return Math.max(0, Math.floor(n));
}

function parseValue(v) {
  return decodeURIComponent(String(v || '')).trim();
}

function formatDateTime(value) {
  if (!value) return '-';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    const hh = `${date.getHours()}`.padStart(2, '0');
    const mm = `${date.getMinutes()}`.padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}`;
  } catch (e) {
    return String(value);
  }
}

function getStatusMeta(status) {
  const value = String(status || '').trim();
  switch (value) {
    case 'waiting_procurement':
    case 'PENDING':
      return { text: '待采购', cls: 'default' };
    case 'procurement_in_progress':
    case 'PARTIAL':
    case 'IN_PROGRESS':
      return { text: '采购中', cls: 'warning' };
    case 'procurement_completed':
    case 'COMPLETED':
    case 'RECEIVED':
      return { text: '已完成', cls: 'success' };
    case 'CANCELLED':
      return { text: '已取消', cls: 'error' };
    default:
      return { text: value || '-', cls: 'default' };
  }
}

Page({
  data: {
    materialCode: '',
    materialName: '',
    color: '',
    size: '',
    unit: '',
    quantity: 0,
    safetyStock: 0,
    recentOutQuantity: 0,
    loading: false,
    batches: [],
    purchases: [],
  },

  onLoad(options) {
    this.setData({
      materialCode: parseValue(options.materialCode),
      materialName: parseValue(options.materialName),
      color: parseValue(options.color),
      size: parseValue(options.size),
      unit: parseValue(options.unit),
      quantity: toInt(options.quantity),
      safetyStock: toInt(options.safetyStock),
      recentOutQuantity: toInt(options.recentOutQuantity),
    });
    this.loadData();
  },

  async loadData() {
    const { materialCode, color, size } = this.data;
    if (!materialCode) {
      wx.showToast({ title: '物料编码缺失', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const [batchesResp, purchasesResp] = await Promise.all([
        api.material.listBatchDetails({ materialCode, color, size }),
        api.material.listPurchaseRecords({ materialCode, color, size, page: 1, pageSize: 20 }),
      ]);

      const batchList = Array.isArray(batchesResp) ? batchesResp : [];
      const purchaseRaw = Array.isArray(purchasesResp)
        ? purchasesResp
        : (purchasesResp && purchasesResp.records) || [];

      const batches = batchList.map(item => ({
        id: String(item.id || item.batchNo || `${item.inboundTime || ''}-${Math.random()}`),
        batchNo: item.batchNo || item.warehousingNo || '-',
        quantity: toInt(item.quantity || item.availableQuantity || item.stockQuantity),
        inboundTime: formatDateTime(item.inboundTime || item.createTime || item.warehousingEndTime),
      }));

      const purchases = purchaseRaw.map(item => {
        const statusMeta = getStatusMeta(item.status);
        return {
          id: String(item.id || `${item.createTime || ''}-${Math.random()}`),
          purchaseNo: item.purchaseNo || item.instructionNo || '-',
          quantity: toInt(item.purchaseQuantity || item.quantity),
          status: item.status || '-',
          statusText: statusMeta.text,
          statusClass: statusMeta.cls,
          createTime: formatDateTime(item.createTime),
        };
      });

      this.setData({ batches, purchases });
    } catch (e) {
      wx.showToast({ title: '加载明细失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onRefreshTap() {
    this.loadData();
  },

  onQuickOrderTap() {
    wx.navigateBack({ delta: 1 });
  },
});
