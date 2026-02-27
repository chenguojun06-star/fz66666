/**
 * 历史记录页面
 * 展示全部扫码记录 - 支持日期筛选、搜索、汇总
 * 表头：领取人, 订单号, 菲号, 工序, 单价, 数量, 扎号, 日期
 */
const api = require('../../../utils/api');

/**
 * 归一化质检子步骤名称：质检领取/质检验收 → 质检
 */
function _normalizeQualityName(processName) {
  if (!processName) return processName;
  // 兼容历史旧数据（确认）及现在的两步（领取/验收）
  if (/^质检(领取|验收|确认)$/.test(processName)) return '质检';
  return processName;
}

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

/**
 * 将样板扫码记录格式化为与普通扫码记录一致的 displayRecord 格式
 * @param {Object} item - PatternScanRecord（来自 /scan-records/my-history）
 */
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

Page({
  data: {
    startDate: getDateBefore(30),
    endDate: getToday(),
    searchKeyword: '',
    records: [],          // 普通扫码记录（分页追加）
    patternRecords: [],   // 样板扫码记录（首次全量加载，后续不再追加）
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
      patternRecordCount: 0,
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

  // 将所有记录合并并按扫码时间倒序排列
  _mergeAndSort(regularRecords, patternRecords) {
    return [...regularRecords, ...patternRecords].sort((a, b) => {
      const ta = a.scanTime || '';
      const tb = b.scanTime || '';
      if (tb > ta) return 1;
      if (tb < ta) return -1;
      return 0;
    });
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

      // 并发请求：大货记录（分页）+ 样衣记录（仅 reset 时全量加载）
      const requests = [api.production.myScanHistory(params)];
      if (reset) {
        const patternParams = {};
        if (this.data.startDate) patternParams.startTime = this.data.startDate + ' 00:00:00';
        if (this.data.endDate) patternParams.endTime = this.data.endDate + ' 23:59:59';
        requests.push(api.production.myPatternScanHistory(patternParams));
      }

      const settled = await Promise.allSettled(requests);
      const result = settled[0].status === 'fulfilled' ? settled[0].value : null;
      const patternRaw = reset
        ? (settled[1] && settled[1].status === 'fulfilled' ? settled[1].value : [])
        : this.data.patternRecords;

      // 格式化大货记录
      const newRecords = (result?.records || []).filter(
        (item) => (item.scanResult || '').toLowerCase() !== 'failure'
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

      // 格式化样衣记录（reset 时重建，翻页时复用旧数据）
      const patternRecords = reset
        ? (Array.isArray(patternRaw) ? patternRaw : []).map((item) => _formatPatternRecord(item))
        : this.data.patternRecords;

      // 计算汇总（仅大货记录计入数量和工资）
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

      const allForDisplay = this._mergeAndSort(merged, patternRecords);
      const displayRecords = this._getDisplayRecords(allForDisplay);

      this.setData({
        records: merged,
        patternRecords,
        displayRecords,
        page: nextPage,
        hasMore,
        loading: false,
        summary: {
          totalQuantity,
          recordCount: merged.length + patternRecords.length,
          payableRecordCount: merged.filter((item) => item.isPayable).length,
          patternRecordCount: patternRecords.length,
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
    const allRecords = this._mergeAndSort(this.data.records, this.data.patternRecords);
    const displayRecords = showOnlyPayable
      ? allRecords.filter((item) => item.isPayable)
      : allRecords;

    this.setData({
      showOnlyPayable,
      displayRecords,
    });
  },

  onLoadMore() {
    this.loadData(false);
  },
});
