const api = require('../../utils/api');
const { safeNavigate } = require('../../utils/uiHelper');

/**
 * 根据当前小时返回问候语
 */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return '上午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

/**
 * 构建菜单项（8 个固定入口）
 */
function buildMenuItems() {
  return [
    { id: 'sample',   name: '样板单',   icon: '👗', bgColor: 'rgba(139,92,246,0.12)',  route: '/pages/work/index' },
    { id: 'order',    name: '订单',     icon: '📋', bgColor: 'rgba(59,130,246,0.12)',   route: '/pages/work/index', tab: 'all' },
    { id: 'task',     name: '待办任务', icon: '✅', bgColor: 'rgba(245,158,11,0.12)',   route: '/pages/work/index', tab: 'cutting' },
    { id: 'progress', name: '工序进度', icon: '📊', bgColor: 'rgba(16,185,129,0.12)',   route: '/pages/work/index', tab: 'sewing' },
    { id: 'quality',  name: '工序质检', icon: '🔍', bgColor: 'rgba(239,68,68,0.12)',    route: '/pages/scan/index' },
    { id: 'history',  name: '历史记录', icon: '📜', bgColor: 'rgba(20,184,166,0.12)',   route: '/pages/scan/history/index' },
    { id: 'notice',   name: '消息通知', icon: '🔔', bgColor: 'rgba(234,179,8,0.12)',    route: '/pages/admin/notification/index' },
    { id: 'payroll',  name: '我的薪资', icon: '💰', bgColor: 'rgba(99,102,241,0.12)',   route: '/pages/payroll/payroll' },
  ];
}

/**
 * 格式化扫码时间为简短显示
 */
function formatScanTime(timeStr) {
  if (!timeStr) return '';
  const d = new Date(timeStr.replace(/-/g, '/'));
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const pad = n => String(n).padStart(2, '0');
  if (isToday) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    statusBarHeight: 0,
    greeting: '',
    userName: '',
    todayProcessCount: 0,
    todayWorkHours: 0,
    menuItems: [],
    unreadNoticeCount: 0,
    monthlyStats: null,
    recentScans: [],
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 44,
      greeting: getGreeting(),
      menuItems: buildMenuItems(),
    });
    this._loadUserName();
  },

  onShow() {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this.setData({ greeting: getGreeting() });
    this._loadUserName();
    this._loadTodayStats();
    this._loadUnreadCount();
    this._loadMonthlyStats();
    this._loadRecentScans();
  },

  onPullDownRefresh() {
    Promise.all([
      this._loadTodayStats(),
      this._loadUnreadCount(),
      this._loadMonthlyStats(),
      this._loadRecentScans(),
    ]).finally(() => wx.stopPullDownRefresh());
  },

  /* ---- 私有方法 ---- */

  _loadUserName() {
    const app = getApp();
    const info = (app && app.globalData && app.globalData.userInfo) || {};
    const name = info.realName || info.username || info.nickName || '用户';
    if (name !== this.data.userName) {
      this.setData({ userName: name });
    }
  },

  _loadTodayStats() {
    return api.dashboard.get()
      .then(res => {
        const d = (res && res.data) || res || {};
        this.setData({
          todayProcessCount: Number(d.todayScanCount) || 0,
          todayWorkHours: Number(d.todayWorkHours) || 0,
        });
      })
      .catch(() => {});
  },

  _loadUnreadCount() {
    return api.notice.unreadCount()
      .then(res => {
        const count = (res && res.data != null) ? Number(res.data) : (Number(res) || 0);
        this.setData({ unreadNoticeCount: count });
      })
      .catch(() => {});
  },

  _loadMonthlyStats() {
    return api.production.personalScanStats({ period: 'month' })
      .then(stats => {
        this.setData({ monthlyStats: stats || null });
      })
      .catch(() => {});
  },

  _loadRecentScans() {
    return api.production.myScanHistory({ page: 1, pageSize: 5 })
      .then(res => {
        const records = (res && res.records) || [];
        const list = records
          .filter(r => r.scanResult !== 'failure')
          .map(r => ({
            id: r.id || r.scanCode || Math.random(),
            stageName: r.processName || r.progressStage || '生产',
            orderNo: r.orderNo || '-',
            quantity: r.quantity || 0,
            timeDisplay: formatScanTime(r.scanTime),
          }));
        this.setData({ recentScans: list });
      })
      .catch(() => {});
  },

  /* ---- 菜单与导航 ---- */

  onMenuTap(e) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.menuItems[idx];
    if (!item) return;

    if (item.tab) {
      wx.setStorageSync('work_active_tab', item.tab);
    }

    const isTabPage = ['/pages/home/index', '/pages/work/index', '/pages/scan/index', '/pages/admin/index'].includes(item.route);
    safeNavigate({ url: item.route }, isTabPage ? 'switchTab' : undefined);
  },

  onGoHistory() {
    safeNavigate({ url: '/pages/scan/history/index' });
  },
});
