/**
 * 历史记录页面（合并原 history + monthly）
 * 支持"按月"和"自定义"两种时间筛选模式
 */
const api = require('../../../utils/api');

function _normalizeQualityName(processName) {
  if (!processName) return processName;
  if (/^质检(领取|验收|确认)$/.test(processName)) return '质检';
  return processName;
}

function getDateBefore(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getToday() { return getDateBefore(0); }

function getMonthRange(year, month) {
  const m = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${m}-01`,
    end: `${year}-${m}-${String(lastDay).padStart(2, '0')}`,
    display: `${year}年${month}月`,
  };
}

function formatTime(timeStr) {
  if (!timeStr) return '-';
  if (timeStr.length >= 16) return timeStr.substring(5, 16);
  return timeStr;
}

function _formatPatternRecord(item) {
  return {
    ...item,
    _isPattern: true,
    displayTime: formatTime(item.scanTime),
    displayProcess: '样衣-' + (item.progressStage || item.operationType || '-'),
    displayWorker: item.operatorName || '-',
    displayOrderNo: item.styleNo || '-',
    displayBundleNo: item.color || '-',
    displayQuantity: 0,
    displayUnitPrice: '-',
    lineAmount: 0,
    displayLineAmount: '-',
    isPayable: false,
    displayBedNo: '-',
  };
}

const _now = new Date();

Page({
  data: {
    dateMode: 'month',
    year: _now.getFullYear(),
    month: _now.getMonth() + 1,
    displayMonth: '',
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
      orderCount: 0,
      recordCount: 0,
      payableRecordCount: 0,
      patternRecordCount: 0,
      totalWage: '0.00',
    },
    emptyText: '',
    emptyHint: '',
  },

  _reqGeneration: 0,

  onLoad() {
    this._reqGeneration = 0;
    this._showedOnce = false;
    this._updateMonthDisplay();
    this.loadData(true);
  },

  onShow() {
    if (!this._showedOnce) {
      this._showedOnce = true;
      return;
    }
    this.setData({ loading: false });
    this.loadData(true);
  },

  onPullDownRefresh() {
    this.setData({ loading: false });
    this.loadData(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadData(false);
    }
  },

  _updateMonthDisplay() {
    const range = getMonthRange(this.data.year, this.data.month);
    this.setData({ displayMonth: range.display });
  },

  onModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.dateMode) return;
    this.setData({ dateMode: mode });
    if (mode === 'month') {
      this._updateMonthDisplay();
    }
    this.loadData(true);
  },

  onPrevMonth() {
    let { year, month } = this.data;
    month -= 1;
    if (month < 1) { month = 12; year -= 1; }
    this.setData({ year, month });
    this._updateMonthDisplay();
    this.loadData(true);
  },

  onNextMonth() {
    let { year, month } = this.data;
    const curYear = _now.getFullYear();
    const curMonth = _now.getMonth() + 1;
    if (year > curYear || (year === curYear && month >= curMonth)) return;
    month += 1;
    if (month > 12) { month = 1; year += 1; }
    this.setData({ year, month });
    this._updateMonthDisplay();
    this.loadData(true);
  },

  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value });
    this.loadData(true);
  },
  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value });
    this.loadData(true);
  },

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

  _getDateRange() {
    if (this.data.dateMode === 'month') {
      const range = getMonthRange(this.data.year, this.data.month);
      return { start: range.start, end: range.end };
    }
    return { start: this.data.startDate, end: this.data.endDate };
  },

  _mergeAndSort(regularRecords, patternRecords) {
    return [...regularRecords, ...patternRecords].sort((a, b) => {
      const ta = a.scanTime || '';
      const tb = b.scanTime || '';
      if (tb > ta) return 1;
      if (tb < ta) return -1;
      return 0;
    });
  },

  async loadData(reset) {
    if (this.data.loading) return;
    if (!reset && !this.data.hasMore) return;

    const gen = ++this._reqGeneration;
    const nextPage = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true });

    try {
      const { start, end } = this._getDateRange();
      const params = {
        currentUser: 'true',
        page: nextPage,
        pageSize: this.data.pageSize,
      };

      if (start) params.startTime = start + ' 00:00:00';
      if (end) params.endTime = end + ' 23:59:59';

      if (this.data.searchKeyword) {
        const keyword = this.data.searchKeyword.trim();
        if (/^\d+$/.test(keyword)) {
          params.bundleNo = keyword;
        } else {
          params.orderNo = keyword;
        }
      }

      const requests = [api.production.myScanHistory(params)];
      if (reset) {
        const patternParams = {};
        if (start) patternParams.startTime = start + ' 00:00:00';
        if (end) patternParams.endTime = end + ' 23:59:59';
        requests.push(api.production.myPatternScanHistory(patternParams));
      }

      const settled = await Promise.allSettled(requests);
      const result = settled[0].status === 'fulfilled' ? settled[0].value : null;
      const patternRaw = reset
        ? (settled[1] && settled[1].status === 'fulfilled' ? settled[1].value : [])
        : (this._patternRecords || []);

      const newRecords = (result?.records || []).filter(
        (item) => (item.scanResult || '').toLowerCase() !== 'failure',
      );
      const formatted = newRecords.map((item) => ({
        ...item,
        displayTime: formatTime(item.scanTime),
        displayProcess: _normalizeQualityName(item.processName) || item.progressStage || item.scanType || '-',
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
        displayBedNo: item.bedNo != null ? String(item.bedNo) : '-',
      }));

      const prevList = reset ? [] : this.data.records;
      const merged = prevList.concat(formatted);
      const total = result?.total || 0;
      const hasMore = merged.length < total;

      const patternRecords = reset
        ? (Array.isArray(patternRaw) ? patternRaw : []).map((item) => _formatPatternRecord(item))
        : (this._patternRecords || []);

      let totalQuantity = 0;
      let totalWage = 0;
      const orderSet = new Set();
      merged.forEach((r) => {
        totalQuantity += r.quantity || 0;
        const price = Number(r.unitPrice) || 0;
        const qty = Number(r.quantity) || 0;
        if (price > 0 && qty > 0) {
          totalWage += price * qty;
        }
        if (r.orderNo && r.orderNo !== '-') {
          orderSet.add(r.orderNo);
        }
      });

      const allForDisplay = this._mergeAndSort(merged, patternRecords);
      const displayRecords = this._getDisplayRecords(allForDisplay);

      if (gen !== this._reqGeneration) return;
      this._patternRecords = patternRecords;
      this.setData({
        records: merged,
        displayRecords,
        page: nextPage,
        hasMore,
        loading: false,
        summary: {
          totalQuantity,
          orderCount: orderSet.size,
          recordCount: merged.length + patternRecords.length,
          payableRecordCount: merged.filter((item) => item.isPayable).length,
          patternRecordCount: patternRecords.length,
          totalWage: totalWage.toFixed(2),
        },
        emptyText: this.data.showOnlyPayable ? '暂无计薪记录' : '暂无记录',
        emptyHint: this.data.showOnlyPayable ? '点击工资可切回全部记录' : '调整时间范围或搜索条件试试',
      });
    } catch (e) {
      if (gen !== this._reqGeneration) return;
      if (e && e.type === 'auth') {
        this.setData({ loading: false });
        return;
      }
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
    const allRecords = this._mergeAndSort(this.data.records, this._patternRecords || []);
    const displayRecords = showOnlyPayable
      ? allRecords.filter((item) => item.isPayable)
      : allRecords;

    this.setData({
      showOnlyPayable,
      displayRecords,
      emptyText: showOnlyPayable ? '暂无计薪记录' : '暂无记录',
      emptyHint: showOnlyPayable ? '点击工资可切回全部记录' : '调整时间范围或搜索条件试试',
    });
  },

  onLoadMore() {
    this.loadData(false);
  },
});
