const api = require('../../../utils/api');

/**
 * 考勤明细页
 * 月度汇总 + 日历视图（哪天打了/没打）+ 每日明细列表 + 异常状态标记
 */
Page({
  data: {
    loading: true,
    month: '',          // 当前查询月份 yyyy-MM
    monthLabel: '',     // 月份显示文案 2026年8月
    canPrev: true,      // 是否允许上个月（最早到当月-11）
    canNext: true,      // 是否允许下个月（最晚当月）
    summary: {
      workHours: 0,
      workDays: 0,
      monthMinutes: 0,
      avgHoursPerDay: 0,
      expectedDays: 0,
      absentDays: 0,
    },
    calendar: [],       // 整月日历
    weekHeader: ['一', '二', '三', '四', '五', '六', '日'],
    records: [],        // 每日打卡明细（倒序：最新在前）
    todayDate: '',      // 今日日期 yyyy-MM-dd
  },

  onLoad: function () {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const month = y + '-' + (m < 10 ? '0' + m : m);
    const todayDate = y + '-' + (m < 10 ? '0' + m : m) + '-' + (now.getDate() < 10 ? '0' + now.getDate() : now.getDate());
    this.setData({ month: month, todayDate: todayDate });
    this._loadData();
  },

  onShow: function () {
    if (this._needReload) {
      this._needReload = false;
      this._loadData();
    }
  },

  onPullDownRefresh: function () {
    const self = this;
    this._loadData().finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  // 月份切换
  onPrevMonth: function () {
    if (!this.data.canPrev) return;
    const prev = this._shiftMonth(this.data.month, -1);
    this.setData({ month: prev });
    this._loadData();
  },

  onNextMonth: function () {
    if (!this.data.canNext) return;
    const next = this._shiftMonth(this.data.month, 1);
    this.setData({ month: next });
    this._loadData();
  },

  // 跳转首页去打卡
  onGoClock: function () {
    this._needReload = true;
    wx.switchTab({ url: '/pages/home/index' });
  },

  // ========== 内部方法 ==========

  _loadData: function () {
    const self = this;
    self.setData({ loading: true });
    return api.attendance.monthlyRecords(self.data.month).then(function (res) {
      self._applyData(res || {});
    }).catch(function (e) {
      console.warn('[attendance.detail] _loadData failed:', e && e.errMsg);
      wx.showToast({ title: (e && e.errMsg) || '加载失败', icon: 'none' });
    }).then(function () {
      self.setData({ loading: false });
    });
  },

  _applyData: function (data) {
    const month = data.month || this.data.month;
    const summary = data.summary || {};
    const calendar = data.calendar || [];
    const records = data.records || [];

    // 月显示文案
    const parts = String(month).split('-');
    const monthLabel = parts.length >= 2 ? (parts[0] + '年' + parseInt(parts[1], 10) + '月') : month;

    // 控制按钮可用性（最早当月-11，最晚当月）
    const now = new Date();
    const curMonth = now.getFullYear() + '-' + (now.getMonth() + 1 < 10 ? '0' + (now.getMonth() + 1) : (now.getMonth() + 1));
    const minMonth = this._shiftMonth(curMonth, -11);
    const canPrev = this._compareMonth(month, minMonth) > 0;
    const canNext = this._compareMonth(month, curMonth) < 0;

    // 把日历数据按"周一起始"重新排布：在前面补空格
    const calendarGrid = this._buildCalendarGrid(calendar);

    // 倒序展示明细（最新在前）
    const sortedRecords = records.slice().reverse();

    this.setData({
      month: month,
      monthLabel: monthLabel,
      canPrev: canPrev,
      canNext: canNext,
      summary: {
        workHours: Number(summary.workHours || 0),
        workDays: Number(summary.workDays || 0),
        monthMinutes: Number(summary.monthMinutes || 0),
        avgHoursPerDay: Number(summary.avgHoursPerDay || 0),
        expectedDays: Number(summary.expectedDays || 0),
        absentDays: Number(summary.absentDays || 0),
      },
      calendar: calendarGrid,
      records: sortedRecords,
    });
  },

  /**
   * 把后端返回的日历（按日升序）排成 6 行 7 列的网格（周一起始）
   * 前面补 null 让第一天对齐正确的星期
   */
  _buildCalendarGrid: function (calendar) {
    if (!calendar || !calendar.length) return [];
    const first = calendar[0];
    const parts = String(first.date).split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    // JS getDay(): 0=周日, 1=周一 ... 我们要周一起始
    const firstDay = new Date(y, m - 1, d).getDay();
    const lead = (firstDay + 6) % 7;  // 周一=0, 周日=6
    const grid = [];
    for (let i = 0; i < lead; i++) grid.push(null);
    for (let i = 0; i < calendar.length; i++) grid.push(calendar[i]);
    while (grid.length % 7 !== 0) grid.push(null);
    // 切分成行
    const rows = [];
    for (let i = 0; i < grid.length; i += 7) {
      rows.push(grid.slice(i, i + 7));
    }
    return rows;
  },

  _shiftMonth: function (month, delta) {
    const parts = String(month).split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1 + delta;
    const d = new Date(y, m, 1);
    const yy = d.getFullYear();
    const mm = d.getMonth() + 1;
    return yy + '-' + (mm < 10 ? '0' + mm : mm);
  },

  _compareMonth: function (a, b) {
    const pa = String(a).split('-');
    const pb = String(b).split('-');
    const ya = parseInt(pa[0], 10), ma = parseInt(pa[1], 10);
    const yb = parseInt(pb[0], 10), mb = parseInt(pb[1], 10);
    if (ya !== yb) return ya - yb;
    return ma - mb;
  },
});
