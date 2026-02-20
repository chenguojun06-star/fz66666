/**
 * 历史记录页面
 * 展示全部扫码记录 - 支持日期筛选、搜索、汇总
 * 表头：领取人, 订单号, 菲号, 工序, 单价, 数量, 床号, 日期
 */
const api = require('../../../utils/api');

/**
 * 获取30天前日期 YYYY-MM-DD
 */
function getDateBefore(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getToday() {
  return getDateBefore(0);
}

/**
 * 格式化时间
 */
function formatTime(timeStr) {
  if (!timeStr) return '-';
  // 取 MM-DD HH:mm
  if (timeStr.length >= 16) {
    return timeStr.substring(5, 16);
  }
  return timeStr;
}

Page({
  data: {
    startDate: getDateBefore(30),
    endDate: getToday(),
    searchKeyword: '',
    records: [],
    displayRecords: [],
    showOnlyPayable: false,
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 30,
    summary: {
      totalQuantity: 0,
      recordCount: 0,
      payableRecordCount: 0,
      totalWage: '0.00',
    },
  },

  onLoad() {
    this.loadData(true);
  },

  onPullDownRefresh() {
    this.loadData(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadData(false);
    }
  },

  // ===== 日期 =====
  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value });
    this.loadData(true);
  },
  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value });
    this.loadData(true);
  },

  // ===== 搜索 =====
  onKeywordInput(e) {
    this.setData({ searchKeyword: e.detail.value });
  },
  onSearch() {
    this.loadData(true);
  },
  onClearSearch() {
    this.setData({ searchKeyword: '', startDate: getDateBefore(30), endDate: getToday() });
    this.loadData(true);
  },

  // ===== 数据加载 =====
  async loadData(reset) {
    if (this.data.loading) return;
    if (!reset && !this.data.hasMore) return;

    const nextPage = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true });

    try {
      const params = {
        currentUser: 'true',
        page: nextPage,
        pageSize: this.data.pageSize,
      };

      if (this.data.startDate) {
        params.startTime = this.data.startDate + ' 00:00:00';
      }
      if (this.data.endDate) {
        params.endTime = this.data.endDate + ' 23:59:59';
      }
      if (this.data.searchKeyword) {
        const keyword = this.data.searchKeyword.trim();
        params.orderNo = keyword;
        params.bundleNo = keyword;
      }

      const result = await api.production.myScanHistory(params);
      const newRecords = (result?.records || []).filter(
        (item) => (item.scanResult || '').toLowerCase() !== 'failure'
      );

      const formatted = newRecords.map((item) => ({
        ...item,
        displayTime: formatTime(item.scanTime),
        displayProcess: item.processName || item.progressStage || item.scanType || '-',
        displayWorker: item.workerName || item.operatorName || '-',
        displayOrderNo: item.orderNo || '-',
        displayBundleNo:
          item.bundleNo ||
          (item.cuttingBundleNo != null ? String(item.cuttingBundleNo) : '') ||
          item.cuttingBundleQrCode ||
          '-',
        displayQuantity: item.quantity || 0,
        displayUnitPrice: item.unitPrice == null || item.unitPrice === '' ? '-' : Number(item.unitPrice).toFixed(2),
        lineAmount: (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0),
        displayLineAmount:
          (Number(item.unitPrice) || 0) > 0 && (Number(item.quantity) || 0) > 0
            ? ((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)).toFixed(2)
            : '-',
        isPayable: (Number(item.unitPrice) || 0) > 0 && (Number(item.quantity) || 0) > 0,
        displayBedNo: item.bedNo || item.batchNo || (item.cuttingBundleNo != null ? String(item.cuttingBundleNo) : '') || '-',
      }));

      const prevList = reset ? [] : this.data.records;
      const merged = prevList.concat(formatted);
      const total = result?.total || 0;
      const hasMore = merged.length < total;

      // 计算汇总
      let totalQuantity = 0;
      let totalWage = 0;
      merged.forEach((r) => {
        totalQuantity += r.quantity || 0;
        const price = Number(r.unitPrice) || 0;
        const qty = Number(r.quantity) || 0;
        if (price > 0 && qty > 0) {
          totalWage += price * qty;
        }
      });

      const displayRecords = this._getDisplayRecords(merged);

      this.setData({
        records: merged,
        displayRecords,
        page: nextPage,
        hasMore,
        loading: false,
        summary: {
          totalQuantity,
          recordCount: merged.length,
          payableRecordCount: merged.filter((item) => item.isPayable).length,
          totalWage: totalWage.toFixed(2),
        },
      });
    } catch (e) {
      if (e && e.type === 'auth') return;
      wx.showToast({ title: `加载失败: ${(e && e.message) || '请稍后重试'}`, icon: 'none' });
      this.setData({ loading: false });
    }
  },

  _getDisplayRecords(records) {
    if (this.data.showOnlyPayable) {
      return records.filter((item) => item.isPayable);
    }
    return records;
  },

  onTogglePayableFilter() {
    const showOnlyPayable = !this.data.showOnlyPayable;
    const displayRecords = showOnlyPayable
      ? this.data.records.filter((item) => item.isPayable)
      : this.data.records;

    this.setData({
      showOnlyPayable,
      displayRecords,
    });
  },

  onLoadMore() {
    this.loadData(false);
  },
});
