// pages/payroll/payroll.js
const api = require('../../utils/api');
const { toast, safeNavigate } = require('../../utils/uiHelper');
const { hasFeaturePermission } = require('../../utils/permission');
const { bindPageEvents, unbindPageEvents } = require('../../utils/pageEventBinder');

// ===== Date helpers =====
function parseDateSafe(dateStr) {
  if (!dateStr) return null;
  if (typeof dateStr === 'string') {
    // LocalDateTime array format: [2026,7,10,14,30,0,0]
    var trimmed = dateStr.replace(/^\[|\]$/g, '');
    var parts = trimmed.split(',').map(function (s) { return parseInt(s, 10); });
    if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return new Date(parts[0], parts[1] - 1, parts[2],
        parts[3] || 0, parts[4] || 0, parts[5] || 0);
    }
    var parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  if (dateStr instanceof Date) return dateStr;
  return null;
}

function extractDateComponents(dateStr) {
  var d = parseDateSafe(dateStr);
  if (!d) return { year: '', month: '', day: '', hours: '', minutes: '' };
  return {
    year: String(d.getFullYear()),
    month: ('0' + (d.getMonth() + 1)).slice(-2),
    day: ('0' + d.getDate()).slice(-2),
    hours: ('0' + d.getHours()).slice(-2),
    minutes: ('0' + d.getMinutes()).slice(-2),
  };
}

function formatMonthDay(dateStr) {
  var c = extractDateComponents(dateStr);
  return c.month + '-' + c.day;
}

// ===== Amount formatting =====
function formatAmount(num) {
  var n = Number(num) || 0;
  var parts = n.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

// ===== Record type classification =====
function classifyRecordType(item) {
  var pn = String(item.processName || '').toLowerCase();
  if (pn.indexOf('奖金') !== -1 || pn.indexOf('绩效') !== -1 || pn.indexOf('bonus') !== -1) {
    return 'bonus';
  }
  return 'piecework';
}

function _scanTypeText(raw) {
  if (!raw) return '其他';
  var t = String(raw).toLowerCase();
  var map = {
    cutting: '裁剪', cut: '裁剪',
    sewing: '缝制', carsewing: '缝制', 'car_sewing': '缝制',
    pressing: '后整理', iron: '后整理',
    packaging: '包装', package: '包装',
    quality: '质检', qc: '质检', qualitycheck: '质检',
    warehousing: '入库', warehouse: '入库',
    production: '生产', produce: '生产',
    procurement: '采购', purchase: '采购',
  };
  return map[t] || '其他';
}

// ===== Empty state messages =====
var EMPTY_TEXTS = {
  all: '暂无工资记录',
  piecework: '暂无计件记录',
  hourly: '暂无计时记录',
  bonus: '暂无奖金记录',
};

Page({
  data: {
    // Date range (for API calls)
    startDate: '',
    endDate: '',

    // Summary
    monthLabel: '',
    totalAmount: '0.00',
    pieceworkTotal: '0.00',
    bonusTotal: '0.00',
    momText: '',
    momIsUp: true,

    // Filter
    typeFilter: 'all',
    emptyText: '暂无工资记录',

    // Records
    records: [],
    filteredRecords: [],
    filteredTotal: '0.00',

    // State
    loading: false,

    // Date picker
    dateQuick: 'thisMonth',
    todayStr: '',
  },

  onLoad: function () {
    this.initDates();
    bindPageEvents(this, function () { this.loadData(); }.bind(this));
  },

  onUnload: function () {
    unbindPageEvents(this);
  },

  onShow: function () {
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    if (!hasFeaturePermission('view_payroll')) {
      toast('您没有查看工资的权限');
      wx.navigateBack({
        delta: 1,
        fail: function () { wx.switchTab({ url: '/pages/index/index' }); },
      });
      return;
    }
    this.loadData();
  },

  onPullDownRefresh: function () {
    var self = this;
    this.loadData().then(function () {
      wx.stopPullDownRefresh();
    }).catch(function () {
      wx.stopPullDownRefresh();
    });
  },

  initDates: function () {
    var now = new Date();
    var year = now.getFullYear();
    var month = ('0' + (now.getMonth() + 1)).slice(-2);
    var day = ('0' + now.getDate()).slice(-2);

    this.setData({
      startDate: year + '-' + month + '-01',
      endDate: year + '-' + month + '-' + day,
      monthLabel: year + '年' + (now.getMonth() + 1) + '月',
      dateQuick: 'thisMonth',
      todayStr: year + '-' + month + '-' + day,
    });
  },

  // ===== Date picker handlers =====
  onQuickDateChange: function (e) {
    var quick = e.currentTarget.dataset.quick;
    var now = new Date();
    var start, end, label;

    if (quick === 'thisMonth') {
      var y = now.getFullYear();
      var m = ('0' + (now.getMonth() + 1)).slice(-2);
      var d = ('0' + now.getDate()).slice(-2);
      start = y + '-' + m + '-01';
      end = y + '-' + m + '-' + d;
      label = y + '年' + (now.getMonth() + 1) + '月';
    } else if (quick === 'lastMonth') {
      var lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      var ly = lm.getFullYear();
      var lm2 = ('0' + (lm.getMonth() + 1)).slice(-2);
      var ld = ('0' + new Date(lm.getFullYear(), lm.getMonth() + 1, 0).getDate()).slice(-2);
      start = ly + '-' + lm2 + '-01';
      end = ly + '-' + lm2 + '-' + ld;
      label = ly + '年' + (lm.getMonth() + 1) + '月';
    } else if (quick === 'last3Months') {
      var tm = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      var ty = tm.getFullYear();
      var tm2 = ('0' + (tm.getMonth() + 1)).slice(-2);
      var td = ('0' + now.getDate()).slice(-2);
      start = ty + '-' + tm2 + '-01';
      end = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + td;
      label = '近三月';
    }

    this.setData({
      dateQuick: quick,
      startDate: start,
      endDate: end,
      monthLabel: label,
    }, function () {
      this.loadData();
    }.bind(this));
  },

  onStartDateChange: function (e) {
    var newStart = e.detail.value;
    this.setData({
      startDate: newStart,
      dateQuick: '',
      monthLabel: newStart + ' ~ ' + this.data.endDate,
    }, function () {
      this.loadData();
    }.bind(this));
  },

  onEndDateChange: function (e) {
    var newEnd = e.detail.value;
    this.setData({
      endDate: newEnd,
      dateQuick: '',
      monthLabel: this.data.startDate + ' ~ ' + newEnd,
    }, function () {
      this.loadData();
    }.bind(this));
  },

  // ===== Type filter =====
  onTypeFilterChange: function (e) {
    var filter = e.currentTarget.dataset.filter;
    this.setData({
      typeFilter: filter,
      emptyText: EMPTY_TEXTS[filter] || '暂无工资记录',
    }, function () {
      this.applyTypeFilter();
    }.bind(this));
  },

  applyTypeFilter: function () {
    var records = this.data.records;
    var filter = this.data.typeFilter;
    var filtered;

    if (filter === 'all') {
      filtered = records;
    } else {
      filtered = records.filter(function (r) {
        return r.recordType === filter;
      });
    }

    var total = 0;
    for (var i = 0; i < filtered.length; i++) {
      total += filtered[i].totalAmountNum;
    }

    this.setData({
      filteredRecords: filtered,
      filteredTotal: formatAmount(total),
    });
  },

  // ===== Data loading =====
  loadData: function () {
    if (this.data.loading) return Promise.resolve();
    this.setData({ loading: true });

    var self = this;
    var startDate = this.data.startDate;
    var endDate = this.data.endDate;
    var prevRange = this.getPreviousMonthRange();

    return Promise.all([
      api.payrollSettlement.operatorSummary({
        startTime: startDate + ' 00:00:00',
        endTime: endDate + ' 23:59:59',
        includeSettled: true,
      }),
      api.payrollSettlement.operatorSummary({
        startTime: prevRange.start + ' 00:00:00',
        endTime: prevRange.end + ' 23:59:59',
        includeSettled: true,
      }).catch(function () { return []; }),
    ]).then(function (results) {
      var currentData = results[0];
      var prevData = results[1];

      if (Array.isArray(currentData)) {
        var prevTotal = 0;
        if (Array.isArray(prevData)) {
          for (var i = 0; i < prevData.length; i++) {
            prevTotal += Number(prevData[i].totalAmount) || 0;
          }
        }
        self.processData(currentData, prevTotal);
      } else {
        toast.error('加载失败');
      }
    }).catch(function (error) {
      console.error('加载工资数据失败:', error);
      toast.error(error.errMsg || error.message || '加载失败');
    }).then(function () {
      self.setData({ loading: false });
    });
  },

  getPreviousMonthRange: function () {
    // Dynamic: compute the previous period of same length as the selected range
    var sParts = this.data.startDate.split('-');
    var eParts = this.data.endDate.split('-');
    var start = new Date(parseInt(sParts[0]), parseInt(sParts[1]) - 1, parseInt(sParts[2]));
    var end = new Date(parseInt(eParts[0]), parseInt(eParts[1]) - 1, parseInt(eParts[2]));
    var rangeMs = end.getTime() - start.getTime() + 86400000; // include end day
    var prevEnd = new Date(start.getTime() - 86400000); // day before selected start
    var prevStart = new Date(prevEnd.getTime() - rangeMs + 86400000);
    function fmt(d) {
      return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }
    return { start: fmt(prevStart), end: fmt(prevEnd) };
  },

  processData: function (data, prevTotal) {
    var totalAmount = 0;
    var pieceworkTotal = 0;
    var bonusTotal = 0;
    var records = [];

    for (var i = 0; i < data.length; i++) {
      var item = data[i];
      if (!item.startTime) continue;

      var amt = Number(item.totalAmount) || 0;
      var qty = Number(item.quantity) || 0;
      var unitPrice = Number(item.unitPrice) || 0;
      var recordType = classifyRecordType(item);

      totalAmount += amt;
      if (recordType === 'bonus') {
        bonusTotal += amt;
      } else {
        pieceworkTotal += amt;
      }

      var dateText = formatMonthDay(item.startTime);
      var processTag = recordType === 'bonus'
        ? '绩效奖金'
        : (item.processName && item.processName !== '-' ? item.processName : _scanTypeText(item.scanType));
      var productName = recordType === 'bonus'
        ? '-'
        : (item.styleNo && item.styleNo !== '-' ? item.styleNo : '-');
      var orderNoText = item.orderNo || '-';
      var calcText = recordType === 'bonus'
        ? (qty + ' × ¥' + formatAmount(unitPrice))
        : (qty + '件 × ¥' + formatAmount(unitPrice));

      records.push({
        recordType: recordType,
        processTag: processTag,
        isBonus: recordType === 'bonus',
        productName: productName,
        metaText: orderNoText + ' · ' + dateText,
        calcText: calcText,
        totalAmount: formatAmount(amt),
        totalAmountNum: amt,
        rawScanTime: item.startTime || '',
      });
    }

    // Sort by time descending (newest first)
    records.sort(function (a, b) {
      var ta = a.rawScanTime || '';
      var tb = b.rawScanTime || '';
      if (ta > tb) return -1;
      if (ta < tb) return 1;
      return 0;
    });

    // Compute MoM (month-over-month)
    var momText = '';
    var momIsUp = true;
    if (prevTotal > 0) {
      var diff = ((totalAmount - prevTotal) / prevTotal) * 100;
      momIsUp = diff >= 0;
      momText = (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%';
    } else if (totalAmount > 0) {
      momText = '新增';
      momIsUp = true;
    }

    this.setData({
      records: records,
      totalAmount: formatAmount(totalAmount),
      pieceworkTotal: formatAmount(pieceworkTotal),
      bonusTotal: formatAmount(bonusTotal),
      momText: momText,
      momIsUp: momIsUp,
    }, function () {
      this.applyTypeFilter();
    }.bind(this));
  },

  goFeedback: function () {
    safeNavigate({ url: '/pages/payroll/feedback/index' }).catch(function () {});
  },
});
