/**
 * 当月记录页面
 * 展示当月扫码记录 - 支持月份切换、搜索、工资/数量汇总
 * 表头：领取人, 订单号, 菲号, 工序, 单价, 数量, 床号, 日期
 */
const api = require('../../../utils/api');

/**
 * 获取指定月份的首尾日期
 * @param {number} year - 年份（如 2026）
 * @param {number} month - 1-12
 * @returns {{ start: string, end: string, display: string }} 返回起始日期、结束日期和展示文案
 */
function getMonthRange(year, month) {
  const m = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${m}-01`,
    end: `${year}-${m}-${String(lastDay).padStart(2, '0')}`,
    display: `${year}年${month}月`,
  };
}

/**
 * 格式化扫码时间为 MM-DD HH:mm
 * @param {string} timeStr - 原始时间字符串
 * @returns {string} 格式化后的时间字符串
 */
function formatTime(timeStr) {
  if (!timeStr) return '-';
  if (timeStr.length >= 16) return timeStr.substring(5, 16);
  return timeStr;
}

const now = new Date();

Page({
  data: {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    displayMonth: '',
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
      orderCount: 0,
      recordCount: 0,
      totalWage: '0.00',
    },
  },

  onLoad() {
    this._updateDisplay();
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

  _updateDisplay() {
    const range = getMonthRange(this.data.year, this.data.month);
    this.setData({ displayMonth: range.display });
  },

  // ===== 月份切换 =====
  onPrevMonth() {
    let { year, month } = this.data;
    month -= 1;
    if (month < 1) { month = 12; year -= 1; }
    this.setData({ year, month });
    this._updateDisplay();
    this.loadData(true);
  },
  onNextMonth() {
    let { year, month } = this.data;
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    // 不允许超过当月
    if (year > curYear || (year === curYear && month >= curMonth)) return;
    month += 1;
    if (month > 12) { month = 1; year += 1; }
    this.setData({ year, month });
    this._updateDisplay();
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
    this.setData({ searchKeyword: '' });
    this.loadData(true);
  },

  _buildHistoryParams(nextPage) {
    const range = getMonthRange(this.data.year, this.data.month);
    const params = {
      currentUser: 'true',
      page: nextPage,
      pageSize: this.data.pageSize,
      startTime: range.start + ' 00:00:00',
      endTime: range.end + ' 23:59:59',
    };

    if (this.data.searchKeyword) {
      const keyword = this.data.searchKeyword.trim();
      if (/^\d+$/.test(keyword)) {
        params.bundleNo = keyword;
      } else {
        params.orderNo = keyword;
      }
    }

    return params;
  },

  _formatHistoryRecords(records) {
    return records.map((item) => ({
      ...item,
      displayTime: formatTime(item.scanTime),
      displayProcess: item.processName || item.progressStage || item.scanType || '-',
      displayWorker: item.workerName || item.operatorName || '-',
      displayOrderNo: item.orderNo || '-',
      displayBundleNo: item.bundleNo || item.cuttingBundleNo || item.cuttingBundleQrCode || '-',
      displayQuantity: item.quantity || 0,
      displayUnitPrice: item.unitPrice == null || item.unitPrice === '' ? '-' : Number(item.unitPrice).toFixed(2),
      lineAmount: (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0),
      displayLineAmount:
        (Number(item.unitPrice) || 0) > 0 && (Number(item.quantity) || 0) > 0
          ? ((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)).toFixed(2)
          : '-',
      isPayable: (Number(item.unitPrice) || 0) > 0 && (Number(item.quantity) || 0) > 0,
      displayBedNo: item.bedNo || item.batchNo || '-',
    }));
  },

  _getDisplayRecords(records) {
    if (this.data.showOnlyPayable) {
      return records.filter((item) => item.isPayable);
    }
    return records;
  },

  _applyPageResult(result, reset, nextPage) {
    const newRecords = (result?.records || []).filter(
      (item) => (item.scanResult || '').toLowerCase() !== 'failure',
    );
    const formatted = this._formatHistoryRecords(newRecords);
    const prevList = reset ? [] : this.data.records;
    const merged = prevList.concat(formatted);
    const total = result?.total || 0;
    const summary = this._buildSummaryFromRecords(merged);
    const displayRecords = this._getDisplayRecords(merged);

    this.setData({
      records: merged,
      displayRecords,
      page: nextPage,
      hasMore: merged.length < total,
      summary,
      loading: false,
    });
  },

  _buildSummaryFromRecords(records) {
    let totalQuantity = 0;
    let totalWage = 0;
    const orderSet = new Set();

    records.forEach((item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPrice) || 0;

      totalQuantity += qty;
      if (price > 0 && qty > 0) {
        totalWage += price * qty;
      }
      if (item.orderNo && item.orderNo !== '-') {
        orderSet.add(item.orderNo);
      }
    });

    return {
      totalQuantity,
      orderCount: orderSet.size,
      recordCount: records.length,
      payableRecordCount: records.filter((item) => item.isPayable).length,
      totalWage: totalWage.toFixed(2),
    };
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

  // ===== 数据加载 =====
  async loadData(reset) {
    if (this.data.loading) return;
    if (!reset && !this.data.hasMore) return;

    const nextPage = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true });

    try {
      const params = this._buildHistoryParams(nextPage);
      const result = await api.production.myScanHistory(params);
      this._applyPageResult(result, reset, nextPage);
    } catch (e) {
      if (e && e.type === 'auth') return;
      wx.showToast({ title: `加载失败: ${(e && e.message) || '请稍后重试'}`, icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onLoadMore() {
    this.loadData(false);
  },
});
