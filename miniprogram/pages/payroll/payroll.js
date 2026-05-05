// pages/payroll/payroll.js
const { request } = require('../../utils/request');
const { toast } = require('../../utils/uiHelper');

// 日期格式化工具函数（重构版 - 消除重复代码）

/**
 * 解析日期字符串（兼容 iOS）
 * iOS 不支持 "yyyy-MM-dd HH:mm:ss"，需要使用 "yyyy-MM-ddTHH:mm:ss"
 */
function parseDateSafe(dateStr) {
  if (!dateStr) return new Date(NaN);
  if (dateStr instanceof Date) return dateStr;
  // 将空格分隔符替换为 T，兼容 iOS
  return new Date(String(dateStr).replace(' ', 'T'));
}

/**
 * 提取日期组件（公共函数）
 */
function extractDateComponents(date) {
  const d = parseDateSafe(date);
  return {
    year: d.getFullYear(),
    month: String(d.getMonth() + 1).padStart(2, '0'),
    day: String(d.getDate()).padStart(2, '0'),
    hours: String(d.getHours()).padStart(2, '0'),
    minutes: String(d.getMinutes()).padStart(2, '0'),
  };
}

/**
 * 格式化为日期（YYYY-MM-DD）
 */
function formatDate(date) {
  const { year, month, day } = extractDateComponents(date);
  return `${year}-${month}-${day}`;
}

/**
 * 格式化为日期时间（YYYY-MM-DD HH:mm）
 */
function formatDateTime(date) {
  const { year, month, day, hours, minutes } = extractDateComponents(date);
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function _scanTypeText(raw) {
  const v = String(raw || '').trim();
  if (!v) return '-';
  if (v === 'production') return '生产';
  if (v === 'cutting') return '裁剪';
  if (v === 'procurement') return '采购';
  if (v === 'quality') return '质检';
  if (v === 'pressing') return '大烫';
  if (v === 'packaging') return '包装';
  if (v === 'warehousing') return '入库';
  if (v === 'sewing' || v === 'carSewing') return '车缝';
  return v;
}

function _orderStatusText(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') return '已完成';
  if (s === 'closed') return '已关单';
  if (s === 'archived') return '已归档';
  if (s === 'production') return '生产中';
  if (s === 'pending') return '待生产';
  if (s === 'delayed') return '已逾期';
  if (s === 'scrapped') return '已报废';
  if (s === 'cancelled' || s === 'canceled') return '已取消';
  if (s === 'paused') return '已暂停';
  if (s === 'returned') return '已退回';
  return s || '-';
}

function _paymentStatusText(status) {
  if (!status) return '未发放';
  if (status === 'success') return '已发放';
  if (status === 'pending') return '待支付';
  return status;
}

Page({
  data: {
    // 筛选条件
    timeFilter: 'month', // week, month, custom
    startDate: '',
    endDate: '',

    // 汇总数据
    totalAmount: '0.00',
    totalQuantity: 0,
    recordCount: 0,
    orderCount: 0,

    // 明细数据
    records: [],
    filteredTotalAmount: '0.00',

    // 加载状态
    loading: false,

    // 排序状态
    sortField: 'time', // 'amount' 或 'time'
    sortOrder: 'desc', // desc:降序(从高到低), asc:升序(从低到高)
    summaryItems: [],
  },

  onLoad() {
    this.initDates();
    // 数据加载由 onShow 统一处理（onLoad 后立即触发 onShow，首次也会加载）
  },

  // 每次进入页面（包括首次、从子页面返回）都刷新最新工资数据
  onShow() {
    // 未登录时拒绝访问：工资数据属于敏感个人信息，必须验证身份后才能加载
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh();
    }).catch(() => { wx.stopPullDownRefresh(); });
  },

  /**
   * 初始化日期
   */
  initDates() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    // 默认本月第一天到今天
    this.setData({
      startDate: `${year}-${month}-01`,
      endDate: `${year}-${month}-${day}`,
    });
  },

  /**
   * 切换筛选条件
   */
  onFilterChange(e) {
    const filter = e.currentTarget.dataset.filter;
    const now = new Date();

    let startDate = '';
    let endDate = formatDate(now);

    if (filter === 'week') {
      // 本周：周一到今天
      const day = now.getDay() || 7; // 周日为0，转换为7
      const monday = new Date(now);
      monday.setDate(now.getDate() - day + 1);
      startDate = formatDate(monday);
    } else if (filter === 'month') {
      // 本月：1号到今天
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      startDate = `${year}-${month}-01`;
    } else {
      // 自定义：保持当前日期
      startDate = this.data.startDate;
      endDate = this.data.endDate;
    }

    this.setData(
      {
        timeFilter: filter,
        startDate,
        endDate,
      },
      () => {
        if (filter !== 'custom') {
          this.loadData();
        }
      }
    );
  },

  /**
   * 选择开始日期
   */
  onStartDateChange(e) {
    this.setData(
      {
        startDate: e.detail.value,
      },
      () => {
        this.loadData();
      }
    );
  },

  /**
   * 选择结束日期
   */
  onEndDateChange(e) {
    this.setData(
      {
        endDate: e.detail.value,
      },
      () => {
        this.loadData();
      }
    );
  },

  /**
   * 加载数据
   */
  async loadData() {
    if (this.data.loading) {
      return;
    }

    this.setData({ loading: true });

    try {
      const { startDate, endDate } = this.data;

      const res = await request({
        url: '/api/finance/payroll-settlement/operator-summary',
        method: 'POST',
        data: {
          startTime: `${startDate} 00:00:00`,
          endTime: `${endDate} 23:59:59`,
          includeSettled: true,
        },
      });

      if (res.code === 200 && Array.isArray(res.data)) {
        this.processData(res.data);
      } else {
        toast.error('加载失败');
      }
    } catch (error) {
      console.error('加载工资数据失败:', error);
      toast.error(error.errMsg || error.message || '加载失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 处理数据
   */
  processData(data) {
    const filterStart = this.data.startDate ? new Date(this.data.startDate + 'T00:00:00') : null;
    const filterEnd = this.data.endDate ? new Date(this.data.endDate + 'T23:59:59') : null;

    let totalAmount = 0;
    let totalQuantity = 0;
    const orderNoSet = new Set();
    const records = [];

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (!item.startTime) continue;
      const time = parseDateSafe(item.startTime);
      if ((filterStart && time < filterStart) || (filterEnd && time > filterEnd)) continue;

      const amt = Number(item.totalAmount) || 0;
      const qty = Number(item.quantity) || 0;
      totalAmount += amt;
      totalQuantity += qty;
      if (item.orderNo) orderNoSet.add(item.orderNo);

      records.push({
        orderNo: item.orderNo || '-',
        styleNo: item.styleNo || '-',
        color: item.color || '-',
        size: item.size || '-',
        cuttingBundleNo: item.cuttingBundleNo != null ? String(item.cuttingBundleNo) : '',
        processName: item.processName || '-',
        operatorName: item.operatorName || '',
        scanType: item.scanType || '',
        scanTypeText: _scanTypeText(item.scanType),
        delegateTargetType: item.delegateTargetType || '',
        delegateTargetName: item.delegateTargetName || '',
        actualOperatorName: item.actualOperatorName || '',
        orderStatus: item.orderStatus || '',
        orderStatusText: _orderStatusText(item.orderStatus),
        paymentStatus: item.paymentStatus || '',
        paymentStatusText: _paymentStatusText(item.paymentStatus),
        settlementId: item.settlementId || '',
        quantity: qty,
        unitPrice: (Number(item.unitPrice) || 0).toFixed(2),
        totalAmount: amt.toFixed(2),
        totalAmountNum: amt,
        scanTime: item.startTime ? formatDateTime(parseDateSafe(item.startTime)) : '-',
        rawScanTime: item.startTime || '',
      });
    }

    this._sortRecords(records);

    let filteredTotalAmount = 0;
    for (let i = 0; i < records.length; i++) {
      filteredTotalAmount += records[i].totalAmountNum;
    }

    this.setData({
      records,
      filteredTotalAmount: filteredTotalAmount.toFixed(2),
      summaryItems: [
        { label: '本月总金额', value: '¥' + totalAmount.toFixed(2), highlight: true },
        { label: '本月数量',   value: totalQuantity + ' 件' },
        { label: '扫码次数',   value: records.length + ' 次' },
        { label: '参与订单',   value: orderNoSet.size + ' 个' },
      ],
    });
  },

  /**
   * 排序记录（内部方法）
   */
  _sortRecords(records) {
    const { sortField, sortOrder } = this.data;
    const dir = sortOrder === 'desc' ? -1 : 1;
    if (sortField === 'time') {
      records.sort((a, b) => {
        const ta = a.rawScanTime || '';
        const tb = b.rawScanTime || '';
        if (ta > tb) return -1 * dir;
        if (ta < tb) return 1 * dir;
        return 0;
      });
    } else {
      records.sort((a, b) => dir * (b.totalAmountNum - a.totalAmountNum));
    }
  },

  /**
   * 切换排序字段（金额 / 时间）
   */
  toggleSort() {
    const { sortField } = this.data;
    const newField = sortField === 'amount' ? 'time' : 'amount';
    this.setData({ sortField: newField, sortOrder: 'desc' }, () => {
      const records = [...this.data.records];
      this._sortRecords(records);
      this.setData({ records });
    });
  },

  /**
   * 切换排序方向
   */
  toggleSortOrder() {
    const newOrder = this.data.sortOrder === 'desc' ? 'asc' : 'desc';
    this.setData({ sortOrder: newOrder }, () => {
      const records = [...this.data.records];
      this._sortRecords(records);
      this.setData({ records });
    });
  },

  goFeedback() {
    wx.navigateTo({ url: '/pages/payroll/feedback/index' });
  },
});
