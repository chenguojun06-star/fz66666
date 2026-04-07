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
 * 构建首页菜单（去掉已被小云吸收的重复入口）
 */
function buildMenuItems() {
  return [
    { id: 'order', name: '订单', iconClass: 'icon-order', circleClass: 'menu-icon-circle--cool', route: '/pages/order/index' },
    { id: 'progress', name: '工序进度', iconClass: 'icon-progress', circleClass: 'menu-icon-circle--warm', route: '/pages/work/index', tab: 'sewing' },
    { id: 'quality', name: '扫码质检', iconClass: 'icon-quality', circleClass: 'menu-icon-circle--cool', route: '/pages/scan/index' },
    { id: 'history', name: '历史记录', iconClass: 'icon-history', circleClass: 'menu-icon-circle--warm', route: '/pages/scan/history/index' },
    { id: 'payroll', name: '当月工资', iconClass: 'icon-payroll', circleClass: 'menu-icon-circle--cool', route: '/pages/payroll/payroll' },
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
    statCards: [
      { key: 'todayProcessCount', label: '今日完成工序', unit: '次', iconClass: 'icon-activity', cardClass: 'stat-card--cool', iconWrapClass: 'stat-icon-wrap--cool' },
      { key: 'todayWorkHours', label: '今日工作时长', unit: 'h', iconClass: 'icon-clock', cardClass: 'stat-card--warm', iconWrapClass: 'stat-icon-wrap--warm' },
    ],
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
    this._loadUserName(true);
    this._refreshHomeData(true);
  },

  onPullDownRefresh() {
    this._refreshHomeData(false).finally(() => wx.stopPullDownRefresh());
  },

  onHide() {
    this._clearDeferredTasks();
  },

  onUnload() {
    this._clearDeferredTasks();
  },

  /* ---- 私有方法 ---- */

  _refreshHomeData(useDeferredSecondaryLoad = false) {
    this._clearDeferredTasks();
    const primaryTasks = [this._loadTodayStats(), this._loadUnreadCount()];
    if (!useDeferredSecondaryLoad) {
      primaryTasks.push(this._loadMonthlyStats(), this._loadRecentScans());
      return Promise.allSettled(primaryTasks);
    }

    const secondaryTasks = [
      setTimeout(() => this._loadMonthlyStats(), 80),
      setTimeout(() => this._loadRecentScans(), 180),
    ];
    this._deferredTaskTimers = secondaryTasks;
    return Promise.allSettled(primaryTasks);
  },

  _clearDeferredTasks() {
    if (!Array.isArray(this._deferredTaskTimers)) return;
    this._deferredTaskTimers.forEach(timer => clearTimeout(timer));
    this._deferredTaskTimers = [];
  },

  _loadUserName(forceRemote = false) {
    const app = getApp();
    const globalInfo = (app && app.globalData && app.globalData.userInfo) || {};
    const cacheInfo = wx.getStorageSync('user_info') || wx.getStorageSync('userInfo') || {};
    const info = Object.assign({}, cacheInfo, globalInfo);
    const name = info.realName || info.username || info.nickName || info.nickname || '用户';
    if (name !== this.data.userName) {
      this.setData({ userName: name });
    }

    if (!forceRemote && this._loadedUserNameFromRemote) return;
    this._loadedUserNameFromRemote = true;
    api.system.getMe()
      .then(res => {
        const me = (res && res.data) || res || {};
        const remoteName = me.realName || me.username || me.nickName || me.nickname;
        if (remoteName && remoteName !== this.data.userName) {
          this.setData({ userName: remoteName });
        }
      })
      .catch(() => {});
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

    if (item.id === 'quality') {
      wx.setStorageSync('scan_pref_process', '质检');
    }

    const isTabPage = ['/pages/home/index', '/pages/work/index', '/pages/scan/index', '/pages/admin/index'].includes(item.route);
    safeNavigate({ url: item.route }, isTabPage ? 'switchTab' : undefined);
  },

  onGoHistory() {
    safeNavigate({ url: '/pages/scan/history/index' });
  },
});
