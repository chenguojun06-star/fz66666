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
    { id: 'dashboard', name: '进度看板', iconClass: 'icon-dashboard', circleClass: 'menu-icon-circle--indigo', route: '/pages/dashboard/index' },
    { id: 'production', name: '生产', iconClass: 'icon-progress', circleClass: 'menu-icon-circle--blue', route: '/pages/work/index', tab: 'sewing' },
    { id: 'quality', name: '扫码质检', iconClass: 'icon-quality', circleClass: 'menu-icon-circle--green', route: '/pages/scan/index' },
    { id: 'bundleSplit', name: '菲号单价', iconClass: 'icon-cutting', circleClass: 'menu-icon-circle--orange', route: '/pages/work/bundle-split/index' },
    { id: 'history', name: '历史记录', iconClass: 'icon-history', circleClass: 'menu-icon-circle--purple', route: '/pages/scan/history/index' },
    { id: 'payroll', name: '当月工资', iconClass: 'icon-payroll', circleClass: 'menu-icon-circle--teal', route: '/pages/payroll/payroll' },
  ];
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
      primaryTasks.push(this._loadMonthlyStats());
      return Promise.allSettled(primaryTasks);
    }

    const secondaryTasks = [
      setTimeout(() => this._loadMonthlyStats(), 80),
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
      .catch(e => { console.warn('[home] _loadUserName失败:', e.message || e); });
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
      .catch(e => { console.warn('[home] _loadTodayStats失败:', e.message || e); });
  },

  _loadUnreadCount() {
    return api.notice.unreadCount()
      .then(res => {
        const count = (res && res.data != null) ? Number(res.data) : (Number(res) || 0);
        this.setData({ unreadNoticeCount: count });
      })
      .catch(e => { console.warn('[home] _loadUnreadCount失败:', e.message || e); });
  },

  _loadMonthlyStats() {
    return api.production.personalScanStats({ period: 'month' })
      .then(stats => {
        this.setData({ monthlyStats: stats || null });
      })
      .catch(e => { console.warn('[home] _loadMonthlyStats失败:', e.message || e); });
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

    const isTabPage = ['/pages/home/index', '/pages/scan/index', '/pages/admin/index'].includes(item.route);
    safeNavigate({ url: item.route }, isTabPage ? 'switchTab' : undefined);
  },

});
