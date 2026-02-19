// pages/payroll/payroll.js
const { request } = require('../../utils/request');
const { toast } = require('../../utils/uiHelper');

// 日期格式化工具函数（重构版 - 消除重复代码）

/**
 * 提取日期组件（公共函数）
 */
function extractDateComponents(date) {
  const d = new Date(date);
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
    sortOrder: 'desc', // desc:降序(从高到低), asc:升序(从低到高)
  },

  onLoad() {
    this.initDates();
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh();
    });
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
    // 计算汇总数据（本月总计）
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59);

    const monthData = data.filter(item => {
      if (!item.startTime) {
        return false;
      }
      const time = new Date(item.startTime);
      return time >= monthStart && time <= monthEnd;
    });

    const totalAmount = monthData.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
    const totalQuantity = monthData.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const orderNos = new Set(monthData.map(item => item.orderNo).filter(Boolean));

    // 处理明细数据（当前筛选）
    const records = data.map(item => ({
      orderNo: item.orderNo || '-',
      styleNo: item.styleNo || '-',
      color: item.color || '-',
      size: item.size || '-',
      processName: item.processName || '-',
      quantity: item.quantity || 0,
      unitPrice: (item.unitPrice || 0).toFixed(2),
      totalAmount: (item.totalAmount || 0).toFixed(2),
      totalAmountNum: item.totalAmount || 0, // 用于排序
      scanTime: item.startTime ? formatDateTime(new Date(item.startTime)) : '-',
    }));

    // 按总金额排序
    const { sortOrder } = this.data;
    records.sort((a, b) => {
      if (sortOrder === 'desc') {
        return b.totalAmountNum - a.totalAmountNum; // 降序
      } else {
        return a.totalAmountNum - b.totalAmountNum; // 升序
      }
    });

    const filteredTotalAmount = records.reduce(
      (sum, item) => sum + parseFloat(item.totalAmount),
      0
    );

    this.setData({
      totalAmount: totalAmount.toFixed(2),
      totalQuantity,
      recordCount: monthData.length,
      orderCount: orderNos.size,
      records,
      filteredTotalAmount: filteredTotalAmount.toFixed(2),
    });
  },

  /**
   * 切换排序
   */
  toggleSort() {
    const newSortOrder = this.data.sortOrder === 'desc' ? 'asc' : 'desc';
    this.setData({ sortOrder: newSortOrder }, () => {
      // 重新排序当前数据
      const records = [...this.data.records];
      records.sort((a, b) => {
        if (newSortOrder === 'desc') {
          return b.totalAmountNum - a.totalAmountNum;
        } else {
          return a.totalAmountNum - b.totalAmountNum;
        }
      });
      this.setData({ records });
    });
  },
});
