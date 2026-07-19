const api = require('../../utils/api');
const { safeNavigate } = require('../../utils/uiHelper');
const { isTokenExpired } = require('../../utils/storage');
const { eventBus, Events } = require('../../utils/eventBus');
const { getAuthedImageUrl } = require('../../utils/fileUrl');

const DAILY_TIPS = [
  '及时扫码可以确保生产进度数据准确，方便后续工资结算。',
  '质检不合格时请拍照留存，便于后续返修追溯。',
  '裁剪分扎后请及时打印菲号，避免混扎影响后续工序。',
  '物料到货后请第一时间扫码入库，确保库存数据实时。',
  '工序单价调整后记得通知相关操作人员，避免工资差异。',
  '交期临近的订单请优先处理，延期会影响客户满意度。',
  '返修完成后需要复检扫码，确保质量合格才能入库。',
  '每道工序完成后请及时扫码确认，方便进度追踪。',
  '样衣开发阶段请完善 BOM 清单，影响后续采购准确度。',
  '发货前请核对颜色尺码数量，避免发错货造成退货。',
];

// 默认应用（用户没有收藏时显示）
const DEFAULT_APPS = [
  { id: 'dashboard', name: '生产管理', iconClass: 'icon-menu-progress', circleClass: 'menu-icon-circle--blue', route: '/pages/dashboard/index' },
  { id: 'quality', name: '扫码工序', iconClass: 'icon-menu-scan', circleClass: 'menu-icon-circle--green', route: '/pages/scan/index' },
  { id: 'production', name: '质检管理', iconClass: 'icon-menu-quality-notice', circleClass: 'menu-icon-circle--orange', route: '/pages/defect/index' },
  { id: 'wagePayment', name: '工资查询', iconClass: 'icon-menu-wage', circleClass: 'menu-icon-circle--purple', route: '/pages/payroll/payroll' },
  { id: 'procurement', name: '采购任务', iconClass: 'icon-menu-cart', circleClass: 'menu-icon-circle--blue', route: '/pages/procurement/task-list/index' },
  { id: 'sampleDev', name: '样衣开发', iconClass: 'icon-menu-garment', circleClass: 'menu-icon-circle--violet', route: '/pages/sample-development/index/index' },
  { id: 'materialScan', name: '物料入库', iconClass: 'icon-menu-warehouse', circleClass: 'menu-icon-circle--lightblue', route: '/pages/warehouse/material/scan/index' },
];

const MORE_APPS_ENTRY = {
  id: 'moreApps',
  name: '更多应用',
  iconClass: 'icon-menu-more',
  circleClass: 'menu-icon-circle--gray',
  route: '/pages/more-apps/index',
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return '上午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

Page({
  data: {
    greeting: '',
    userName: '',
    orgName: '',
    avatarImgUrl: '',
    menuItems: [],
    unreadNoticeCount: 0,
    dateInfo: { date: '', day: '', season: '', dailyTip: '' },
    // 考勤打卡
    attendanceStatusText: '今日未打卡',
    attendanceStatusClass: 'attendance-status--idle',
    attendanceClockInText: '--:--',
    attendanceClockOutText: '--:--',
    monthlyHoursText: '0.0',
    monthlyDaysText: '0',
    clockInBtnActive: true,
    clockOutBtnActive: false,
  },

  onLoad: function () {
    this.setData({
      greeting: getGreeting(),
      menuItems: this._buildMenuItems(null),
    });
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._loadUserName();
    this._computeDateInfo();
    this._loadFavorites();
  },

  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this.setData({ greeting: getGreeting() });
    this._computeDateInfo();
    this._loadUserName(true);
    this._refreshHomeData();
    this._loadFavorites();
    this._loadAttendance();
    this._bindEvents();
  },

  onHide: function () {
    this._unbindEvents();
  },

  onUnload: function () {
    this._unbindEvents();
  },

  onPullDownRefresh: function () {
    this._refreshHomeData().finally(function () { wx.stopPullDownRefresh(); });
  },

  // ========== 收藏应用 ==========

  _loadFavorites: function () {
    const that = this;
    api.system.getFavoriteApps().then(function (res) {
      let favorites = [];
      try {
        const raw = res && res.favoriteData ? res.favoriteData : (typeof res === 'string' ? res : '[]');
        favorites = JSON.parse(raw);
        if (!Array.isArray(favorites)) favorites = [];
      } catch (e) {
        favorites = [];
      }
      try { wx.setStorageSync('favoriteApps', favorites); } catch (e) { /* ignore */ }
      that.setData({ menuItems: that._buildMenuItems(favorites) });
    }).catch(function () {
      let favorites = [];
      try {
        favorites = wx.getStorageSync('favoriteApps') || [];
      } catch (e) { /* ignore */ }
      that.setData({ menuItems: that._buildMenuItems(favorites) });
    });
  },

  _buildMenuItems: function (favorites) {
    var items = [];
    if (favorites && favorites.length > 0) {
      // 用户有收藏：显示收藏的应用
      items = favorites.map(function (f) {
        return {
          id: f.id,
          name: f.name,
          iconClass: f.iconClass,
          circleClass: f.circleClass,
          route: f.route,
          badge: f.badge,
        };
      });
    } else {
      // 没有收藏：显示默认应用
      items = DEFAULT_APPS.map(function (a) {
        return Object.assign({}, a);
      });
    }
    // 末尾固定加"更多应用"入口
    items.push(Object.assign({}, MORE_APPS_ENTRY));
    return items;
  },

  // ========== 事件 ==========

  _bindEvents: function () {
    if (this._eventsBound) return;
    this._eventsBound = true;
    const that = this;
    this._onDataChanged = function () { that._refreshHomeData(); };
    this._onOrderProgress = function () { that._refreshHomeData(); };
    this._onWarehouseIn = function () { that._refreshHomeData(); };
    this._onRefreshAll = function () { that._loadFavorites(); that._refreshHomeData(); };
    this._onFavoritesChanged = function (favorites) { that.setData({ menuItems: that._buildMenuItems(favorites) }); };
    eventBus.on(Events.DATA_CHANGED, this._onDataChanged);
    eventBus.on(Events.ORDER_PROGRESS_CHANGED, this._onOrderProgress);
    eventBus.on(Events.WAREHOUSE_IN, this._onWarehouseIn);
    eventBus.on(Events.REFRESH_ALL, this._onRefreshAll);
    eventBus.on(Events.FAVORITES_CHANGED, this._onFavoritesChanged);
  },

  _unbindEvents: function () {
    if (!this._eventsBound) return;
    this._eventsBound = false;
    if (this._onDataChanged) eventBus.off(Events.DATA_CHANGED, this._onDataChanged);
    if (this._onOrderProgress) eventBus.off(Events.ORDER_PROGRESS_CHANGED, this._onOrderProgress);
    if (this._onWarehouseIn) eventBus.off(Events.WAREHOUSE_IN, this._onWarehouseIn);
    if (this._onRefreshAll) eventBus.off(Events.REFRESH_ALL, this._onRefreshAll);
    if (this._onFavoritesChanged) eventBus.off(Events.FAVORITES_CHANGED, this._onFavoritesChanged);
  },

  // ========== 数据刷新 ==========

  _refreshHomeData: function () {
    return Promise.resolve();
  },

  _loadUserName: function (forceRemote) {
    const app = getApp();
    const globalInfo = (app && app.globalData && app.globalData.userInfo) || {};
    const cacheInfo = wx.getStorageSync('user_info') || wx.getStorageSync('userInfo') || {};
    const info = Object.assign({}, cacheInfo, globalInfo);
    const name = info.realName || info.name || info.nickName || info.nickname || '用户';
    const orgName = info.factoryName || info.tenantName || '';
    const rawAvatar = info.avatarUrl || info.avatar || info.headUrl || '';
    const avatarImgUrl = rawAvatar ? getAuthedImageUrl(rawAvatar) : '';
    const patch = {};
    if (name !== this.data.userName) patch.userName = name;
    if (orgName !== this.data.orgName) patch.orgName = orgName;
    if (avatarImgUrl !== this.data.avatarImgUrl) patch.avatarImgUrl = avatarImgUrl;
    if (Object.keys(patch).length) this.setData(patch);

    if (!forceRemote && this._loadedUserNameFromRemote) return;
    const authToken = wx.getStorageSync('auth_token') || '';
    if (!authToken || isTokenExpired()) return;
    this._loadedUserNameFromRemote = true;
    const that = this;
    api.system.getMe()
      .then(function (res) {
        const me = res || {};
        const remoteName = me.realName || me.name || me.nickName || me.nickname;
        const remoteOrgName = me.factoryName || me.tenantName || '';
        const remoteRawAvatar = me.avatarUrl || me.avatar || me.headUrl || '';
        const remoteAvatarImgUrl = remoteRawAvatar ? getAuthedImageUrl(remoteRawAvatar) : '';
        const remotePatch = {};
        if (remoteName && remoteName !== that.data.userName) remotePatch.userName = remoteName;
        if (remoteOrgName && remoteOrgName !== that.data.orgName) remotePatch.orgName = remoteOrgName;
        if (remoteAvatarImgUrl && remoteAvatarImgUrl !== that.data.avatarImgUrl) remotePatch.avatarImgUrl = remoteAvatarImgUrl;
        if (Object.keys(remotePatch).length) that.setData(remotePatch);
      })
      .catch(function (e) { console.warn('[home] _loadUserName failed:', e.message || e); });
  },

  onAvatarError: function () {
    // 真实头像加载失败（如 token 过期/文件丢失），降级到首字符占位
    if (this.data.avatarImgUrl) this.setData({ avatarImgUrl: '' });
  },

  _loadUnreadCount: function () {
    // 已废弃：ai-assistant 组件从首页移除，悬浮入口仍由全局组件提供
    return Promise.resolve();
  },

  _computeDateInfo: function () {
    const now = new Date();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const weekDay = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
    const season = this._computeSeasonBySolarTerms(now);
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const dailyTip = DAILY_TIPS[dayOfYear % DAILY_TIPS.length];
    this.setData({
      dateInfo: {
        date: now.getFullYear() + '年' + m + '月' + d + '日', day: '星期' + weekDay,
        season: season, dailyTip: dailyTip,
      },
    });
  },

  _computeSeasonBySolarTerms: function (now) {
    const y = now.getFullYear();
    const yy = y % 100;
    const dayOfTerm = function (C) {
      return Math.floor(yy * 0.2422 + C) - Math.floor(yy / 4);
    };
    const liChun = new Date(y, 1, dayOfTerm(4.81));
    const liXia = new Date(y, 4, dayOfTerm(5.52));
    const liQiu = new Date(y, 7, dayOfTerm(7.57));
    const liDong = new Date(y, 10, dayOfTerm(7.44));
    if (now < liChun) return '冬';
    if (now < liXia) return '春';
    if (now < liQiu) return '夏';
    if (now < liDong) return '秋';
    return '冬';
  },

  // ========== 考勤打卡 ==========

  _loadAttendance: function () {
    const self = this;
    Promise.allSettled([
      api.attendance.todayStatus(),
      api.attendance.monthlyStats(),
    ]).then(function (results) {
      const statusRes = results[0].status === 'fulfilled' ? results[0].value : null;
      const statsRes = results[1].status === 'fulfilled' ? results[1].value : null;
      self._applyAttendanceStatus(statusRes);
      self._applyMonthlyStats(statsRes);
    }).catch(function (e) {
      console.warn('[home] _loadAttendance failed:', e && e.errMsg);
    });
  },

  _applyAttendanceStatus: function (res) {
    if (!res) return;
    const clockIn = res.clockInTime;
    const clockOut = res.clockOutTime;
    const hasClockedIn = !!res.hasClockedIn || !!clockIn;
    const hasClockedOut = !!res.hasClockedOut || !!clockOut;
    let statusText = '今日未打卡';
    let statusClass = 'attendance-status--idle';
    if (hasClockedIn && !hasClockedOut) {
      statusText = '上班中';
      statusClass = 'attendance-status--working';
    } else if (hasClockedIn && hasClockedOut) {
      statusText = '今日已下班';
      statusClass = 'attendance-status--done';
    } else if (!hasClockedIn) {
      statusText = '今日未打卡';
      statusClass = 'attendance-status--idle';
    }
    this.setData({
      attendanceStatusText: statusText,
      attendanceStatusClass: statusClass,
      attendanceClockInText: clockIn ? this._formatTime(clockIn) : '--:--',
      attendanceClockOutText: clockOut ? this._formatTime(clockOut) : '--:--',
      clockInBtnActive: !hasClockedIn,
      clockOutBtnActive: hasClockedIn && !hasClockedOut,
    });
  },

  _applyMonthlyStats: function (res) {
    if (!res) return;
    const hours = Number(res.workHours || 0);
    const days = Number(res.workDays || 0);
    this.setData({
      monthlyHoursText: hours.toFixed(1),
      monthlyDaysText: String(days),
    });
  },

  _formatTime: function (t) {
    if (!t) return '--:--';
    const s = String(t);
    // 后端返回 "2026-07-19T09:12:34" 或 "2026-07-19 09:12:34"
    const m = s.match(/(\d{2}):(\d{2})/);
    return m ? (m[1] + ':' + m[2]) : '--:--';
  },

  onClockIn: function () {
    const self = this;
    wx.showLoading({ title: '打卡中', mask: true });
    api.attendance.clockIn().then(function (res) {
      wx.hideLoading();
      wx.showToast({ title: (res && res.message) || '上班打卡成功', icon: 'success' });
      self._applyAttendanceStatus(res);
      return api.attendance.monthlyStats();
    }).then(function (stats) {
      self._applyMonthlyStats(stats);
    }).catch(function (e) {
      wx.hideLoading();
      const msg = (e && e.errMsg) || '上班打卡失败';
      wx.showToast({ title: msg, icon: 'none' });
    });
  },

  onClockOut: function () {
    const self = this;
    wx.showLoading({ title: '打卡中', mask: true });
    api.attendance.clockOut().then(function (res) {
      wx.hideLoading();
      wx.showToast({ title: (res && res.message) || '下班打卡成功', icon: 'success' });
      self._applyAttendanceStatus(res);
      return api.attendance.monthlyStats();
    }).then(function (stats) {
      self._applyMonthlyStats(stats);
    }).catch(function (e) {
      wx.hideLoading();
      const msg = (e && e.errMsg) || '下班打卡失败';
      wx.showToast({ title: msg, icon: 'none' });
    });
  },

  // ========== 点击事件 ==========

  onMenuTap: function (e) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.menuItems[idx];
    if (!item) return;

    if (item.tab) {
      wx.setStorageSync('work_active_tab', item.tab);
    }
    if (item.id === 'quality') {
      wx.setStorageSync('scan_pref_process', '质检');
    }

    const isTabPage = ['/pages/home/index', '/pages/defect/index', '/pages/scan/index', '/pages/admin/index'].indexOf(item.route) !== -1;
    safeNavigate({ url: item.route }, isTabPage ? 'switchTab' : undefined).catch(() => {});
  },
});
