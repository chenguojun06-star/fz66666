// pages/payroll/payroll.js
const api = require('../../utils/api');
const { toast } = require('../../utils/uiHelper');
const { hasFeaturePermission } = require('../../utils/permission');

function parseDateSafe(dateStr) {
  if (!dateStr) return new Date(NaN);
  if (dateStr instanceof Date) return dateStr;
  return new Date(String(dateStr).replace(' ', 'T'));
}

function formatDate(date) {
  const d = parseDateSafe(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateTime(date) {
  const d = parseDateSafe(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

/**
 * 推断工资类型
 * bonus: processName 含 奖金/绩效/补贴
 * hourly: scanType 为 hourly 或 processName 含 计时
 * piecework: 默认
 */
function inferWageType(item) {
  const name = String(item.processName || '').toLowerCase();
  const scanType = String(item.scanType || '').toLowerCase();
  if (name.indexOf('奖金') >= 0 || name.indexOf('绩效') >= 0 || name.indexOf('补贴') >= 0) return 'bonus';
  if (scanType === 'hourly' || name.indexOf('计时') >= 0) return 'hourly';
  return 'piecework';
}

Page({
  data: {
    // 类型筛选
    wageTypeFilter: 'all',

    // 汇总数据
    totalAmount: '0.00',
    pieceworkAmount: '0.00',
    bonusAmount: '0.00',
    momChange: null,
    currentMonthLabel: '',

    // 明细数据
    allRecords: [],
    filteredRecords: [],
    filteredTotalAmount: '0.00',

    // 加载状态
    loading: false,

    // 日期范围（本月）
    startDate: '',
    endDate: '',
  },

  onLoad() {
    this.initDates();
  },

  onShow() {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    if (!hasFeaturePermission('view_payroll')) {
      toast('您没有查看工资的权限');
      wx.navigateBack({ delta: 1, fail: function () { wx.switchTab({ url: '/pages/index/index' }); } });
      return;
    }
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh();
    }).catch(() => { wx.stopPullDownRefresh(); });
  },

  initDates() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    this.setData({
      startDate: `${year}-${month}-01`,
      endDate: `${year}-${month}-${day}`,
      currentMonthLabel: `${year}年${parseInt(month)}月`,
    });
  },

  /**
   * 加载指定时间段 + 上月数据（用于环比）
   * ok() helper 成功时直接返回 resp.data，无需再判 res.code
   */
  async loadData() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    try {
      const { startDate, endDate } = this.data;

      // 当月数据
      const data = await api.payrollSettlement.operatorSummary({
        startTime: `${startDate} 00:00:00`,
        endTime: `${endDate} 23:59:59`,
        includeSettled: true,
      });

      let records = [];
      if (Array.isArray(data)) {
        records = this.processData(data);
      }

      // 计算汇总
      let pieceworkAmount = 0;
      let bonusAmount = 0;
      let totalAmount = 0;
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        totalAmount += r.totalAmountNum;
        if (r.wageType === 'bonus') {
          bonusAmount += r.totalAmountNum;
        } else {
          pieceworkAmount += r.totalAmountNum;
        }
      }

      // 上月数据（环比）— 仅当查询的是本月时才计算环比
      let momChange = null;
      const now = new Date();
      const isCurrentMonth = startDate === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      if (isCurrentMonth) {
        try {
          const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
          const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
          const prevStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
          const prevEnd = formatDate(new Date(prevYear, prevMonth, 0));

          const prevData = await api.payrollSettlement.operatorSummary({
            startTime: `${prevStart} 00:00:00`,
            endTime: `${prevEnd} 23:59:59`,
            includeSettled: true,
          });

          if (Array.isArray(prevData)) {
            let prevTotal = 0;
            for (let i = 0; i < prevData.length; i++) {
              prevTotal += Number(prevData[i].totalAmount) || 0;
            }
            if (prevTotal > 0) {
              momChange = Math.round(((totalAmount - prevTotal) / prevTotal) * 1000) / 10;
            }
          }
        } catch (e) {
          // 上月数据加载失败不影响主流程
        }
      }

      // 更新月份标签
      const startParts = startDate.split('-');
      const endParts = endDate.split('-');
      let label = '';
      if (startParts[0] === endParts[0] && startParts[1] === endParts[1]) {
        label = `${startParts[0]}年${parseInt(startParts[1])}月`;
      } else {
        label = `${startDate} ~ ${endDate}`;
      }

      this.setData({
        allRecords: records,
        totalAmount: totalAmount.toFixed(2),
        pieceworkAmount: pieceworkAmount.toFixed(2),
        bonusAmount: bonusAmount.toFixed(2),
        momChange: momChange,
        currentMonthLabel: label,
      }, () => {
        this.applyFilter();
      });
    } catch (error) {
      console.error('加载工资数据失败:', error);
      toast(error.errMsg || error.message || '加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 日期选择器变更
   */
  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value }, () => {
      this.loadData();
    });
  },

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value }, () => {
      this.loadData();
    });
  },

  /**
   * 处理原始数据
   */
  processData(data) {
    const records = [];
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (!item.startTime) continue;

      const amt = Number(item.totalAmount) || 0;
      const qty = Number(item.quantity) || 0;

      records.push({
        orderNo: item.orderNo || '-',
        styleNo: item.styleNo || '-',
        styleName: item.styleName || '',
        color: item.color || '-',
        size: item.size || '-',
        processName: item.processName || '-',
        wageType: inferWageType(item),
        quantity: qty,
        unitPrice: (Number(item.unitPrice) || 0).toFixed(2),
        totalAmount: amt.toFixed(2),
        totalAmountNum: amt,
        scanTime: item.startTime ? formatDateTime(parseDateSafe(item.startTime)) : '-',
        shortDate: item.startTime ? (function(d) {
          var m = String(d.getMonth() + 1).padStart(2, '0');
          var day = String(d.getDate()).padStart(2, '0');
          return m + '-' + day;
        })(parseDateSafe(item.startTime)) : '-',
        rawScanTime: item.startTime || '',
      });
    }

    // 按时间降序
    records.sort((a, b) => {
      const ta = a.rawScanTime || '';
      const tb = b.rawScanTime || '';
      if (ta > tb) return -1;
      if (ta < tb) return 1;
      return 0;
    });

    return records;
  },

  /**
   * 切换工资类型筛选
   */
  onWageTypeChange(e) {
    const filter = e.currentTarget.dataset.filter;
    this.setData({ wageTypeFilter: filter }, () => {
      this.applyFilter();
    });
  },

  /**
   * 应用筛选
   */
  applyFilter() {
    const { allRecords, wageTypeFilter } = this.data;
    let filtered;
    if (wageTypeFilter === 'all') {
      filtered = allRecords;
    } else {
      filtered = allRecords.filter(function (r) { return r.wageType === wageTypeFilter; });
    }

    let total = 0;
    for (let i = 0; i < filtered.length; i++) {
      total += filtered[i].totalAmountNum;
    }

    this.setData({
      filteredRecords: filtered,
      filteredTotalAmount: total.toFixed(2),
    });
  },
});
