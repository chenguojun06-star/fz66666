const api = require('../../utils/api');
const { safeNavigate } = require('../../utils/uiHelper');
const { isTokenExpired } = require('../../utils/storage');
const { eventBus, Events } = require('../../utils/eventBus');
const { getAuthedImageUrl } = require('../../utils/fileUrl');

// 应用ID → 后端菜单权限key 映射（与 more-apps/index.js 对齐）
const APP_ID_TO_MENU_KEY = {
  'dashboard': 'miniprogram.menu.dashboard',
  'orderCreate': 'miniprogram.menu.orderCreate',
  'sampleDev': 'miniprogram.menu.sampleDev',
  'cuttingDetail': 'miniprogram.menu.cuttingDetail',
  'bundleSplit': 'miniprogram.menu.bundleSplit',
  'unitPrice': 'miniprogram.menu.unitPrice',
  'procurement': 'miniprogram.menu.procurement',
  'materialScan': 'miniprogram.menu.materialScan',
  'locationScan': 'miniprogram.menu.locationScan',
  'factoryShipment': 'miniprogram.menu.factoryShipment',
  'materialDatabase': 'miniprogram.menu.materialDatabase',
  'finishedInventory': 'miniprogram.menu.finishedInventory',
  'sampleStock': 'miniprogram.menu.sampleStock',
  'wagePayment': 'miniprogram.menu.wagePayment',
  'financePayment': 'miniprogram.menu.financePayment',
  'advance': 'miniprogram.menu.advance',
  'salesOverview': 'miniprogram.menu.salesOverview',
  'smartOps': 'miniprogram.menu.smartOps',
  'returnList': 'miniprogram.menu.returnList',
  'userApproval': 'miniprogram.menu.userApproval',
  'feedback': 'miniprogram.menu.feedback',
  'quality': 'miniprogram.menu.quality',
  'production': 'miniprogram.menu.production',
  'history': 'miniprogram.menu.history',
};

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

// 全部应用配置（与 more-apps/index.js 的 ALL_APPS 保持一致）
// 主页按6大分类分组显示全部应用，与"编辑app"页面分组逻辑对齐，
// 避免用户收藏多了之后一维平铺看着混乱。
const ALL_APPS = [
  { group: '开发', items: [
    { id: 'sampleDev', name: '样衣开发', iconClass: 'icon-menu-garment', circleClass: 'menu-icon-circle--violet', route: '/pages/sample-development/index/index' },
    { id: 'sampleStock', name: '样衣仓库', iconClass: 'icon-menu-garment', circleClass: 'menu-icon-circle--violet', route: '/pages/warehouse/sample/scan-action/index' },
  ]},
  { group: '生产', items: [
    { id: 'dashboard', name: '生产管理', iconClass: 'icon-menu-progress', circleClass: 'menu-icon-circle--blue', route: '/pages/dashboard/index' },
    { id: 'orderCreate', name: '下单管理', iconClass: 'icon-menu-order', circleClass: 'menu-icon-circle--green', route: '/pages/order/create/index' },
    { id: 'cuttingDetail', name: '裁剪管理', iconClass: 'icon-menu-cutting', circleClass: 'menu-icon-circle--orange', route: '/pages/cutting/bundle-detail/index' },
    { id: 'bundleSplit', name: '菲号管理', iconClass: 'icon-menu-cutting', circleClass: 'menu-icon-circle--red', route: '/pages/work/bundle-split/index' },
    { id: 'unitPrice', name: '资料单价', iconClass: 'icon-menu-wage', circleClass: 'menu-icon-circle--teal', route: '/pages/basic/unit-price/index' },
    { id: 'factoryShipment', name: '外发管理', iconClass: 'icon-menu-shipment', circleClass: 'menu-icon-circle--orange', route: '/pages/factory/shipment/index' },
  ]},
  { group: '仓库', items: [
    { id: 'procurement', name: '采购任务', iconClass: 'icon-menu-cart', circleClass: 'menu-icon-circle--blue', route: '/pages/procurement/task-list/index' },
    { id: 'materialScan', name: '物料入库', iconClass: 'icon-menu-warehouse', circleClass: 'menu-icon-circle--lightblue', route: '/pages/warehouse/material/scan/index' },
    { id: 'locationScan', name: '库位扫码', iconClass: 'icon-menu-location', circleClass: 'menu-icon-circle--green', route: '/pages/warehouse/location-scan/index' },
    { id: 'materialDatabase', name: '物料资料', iconClass: 'icon-menu-material', circleClass: 'menu-icon-circle--teal', route: '/pages/warehouse/material-database/index' },
    { id: 'finishedInventory', name: '成品仓储', iconClass: 'icon-menu-stock-check', circleClass: 'menu-icon-circle--purple', route: '/pages/warehouse/finished-inventory/index' },
  ]},
  { group: '财务', items: [
    { id: 'wagePayment', name: '工资查询', iconClass: 'icon-menu-wage', circleClass: 'menu-icon-circle--red', route: '/pages/payroll/payroll' },
    { id: 'financePayment', name: '财务付款', iconClass: 'icon-menu-finance', circleClass: 'menu-icon-circle--green', route: '/pages/finance/payment/index' },
    { id: 'advance', name: '预付款', iconClass: 'icon-menu-advance', circleClass: 'menu-icon-circle--lightblue', route: '/pages/advance/list/index' },
    { id: 'salesOverview', name: '销售概览', iconClass: 'icon-menu-stats', circleClass: 'menu-icon-circle--violet', route: '/pages/sales/overview/index' },
  ]},
  { group: '个人', items: [
    { id: 'userApproval', name: '用户审批', iconClass: 'icon-menu-user', circleClass: 'menu-icon-circle--gray', route: '/pages/admin/user-approval/index' },
    { id: 'feedback', name: '意见反馈', iconClass: 'icon-menu-feedback', circleClass: 'menu-icon-circle--blue', route: '/pages/admin/misc/feedback/index' },
  ]},
  { group: '其他', items: [
    { id: 'smartOps', name: '智能运营', iconClass: 'icon-menu-ai', circleClass: 'menu-icon-circle--purple', route: '/pages/smart-ops/index' },
    { id: 'returnList', name: '退货管理', iconClass: 'icon-menu-return', circleClass: 'menu-icon-circle--red', route: '/pages/return/list/index' },
  ]},
];

// "更多应用"入口：保留作为管理收藏/搜索/权限配置的入口
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
    // 按分类分组的应用列表（与"编辑app"页面分组逻辑对齐）
    menuGroups: [],
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
      menuGroups: this._buildMenuGroups(null),
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
    // 同时获取收藏和菜单权限配置
    Promise.all([
      api.system.getFavoriteApps().catch(function () { return { favoriteData: '[]' }; }),
      api.system.getMiniprogramMenuConfig().catch(function () { return {}; }),
    ]).then(function (results) {
      let favorites = [];
      try {
        const res = results[0];
        const raw = res && res.favoriteData ? res.favoriteData : (typeof res === 'string' ? res : '[]');
        favorites = JSON.parse(raw);
        if (!Array.isArray(favorites)) favorites = [];
      } catch (e) {
        favorites = [];
      }
      try { wx.setStorageSync('favoriteApps', favorites); } catch (e) { /* ignore */ }
      const menuFlags = results[1] || {};
      that._lastMenuFlags = menuFlags;
      that.setData({ menuGroups: that._buildMenuGroups(favorites, menuFlags) });
    }).catch(function () {
      let favorites = [];
      try { favorites = wx.getStorageSync('favoriteApps') || []; } catch (e) { /* ignore */ }
      that.setData({ menuGroups: that._buildMenuGroups(favorites, {}) });
    });
  },

  /**
   * 构建"按分类分组"的收藏应用列表。
   * - 仅显示用户收藏的应用，但按 ALL_APPS 的6大分类分组归类
   * - 按菜单权限过滤不可见的应用
   * - 空分组（该分类下无任何收藏）会被剔除，避免显示空标题
   * - 没有收藏时退回 DEFAULT_APPS（也按分类归类）
   * - 末尾固定追加"管理"分组，含"更多应用"入口（进入 more-apps 页面编辑收藏）
   *
   * @param favorites 用户收藏应用一维数组 [{id,name,iconClass,circleClass,route,badge?}]
   * @param menuFlags 菜单权限开关对象
   */
  _buildMenuGroups: function (favorites, menuFlags) {
    const flags = menuFlags || {};
    function isVisible(appId) {
      const menuKey = APP_ID_TO_MENU_KEY[appId];
      if (menuKey) {
        return flags[menuKey] !== false;
      }
      return true;
    }

    // 没有收藏（或全部被权限过滤）时退回默认应用
    // 默认应用从 ALL_APPS 自动提取（每个分组取第一项），避免维护两份列表
    let items = [];
    if (favorites && favorites.length > 0) {
      items = favorites.filter(function (f) { return isVisible(f.id); }).map(function (f) {
        return {
          id: f.id,
          name: f.name,
          iconClass: f.iconClass,
          circleClass: f.circleClass,
          route: f.route,
          badge: f.badge,
        };
      });
    }
    if (items.length === 0) {
      const fallback = ALL_APPS.map(function (g) { return g.items[0]; }).filter(Boolean);
      items = fallback.filter(function (a) { return isVisible(a.id); }).map(function (a) {
        return Object.assign({}, a);
      });
    }

    // 把一维收藏列表按 ALL_APPS 的6大分类归组
    const itemMap = {};
    items.forEach(function (it) { itemMap[it.id] = it; });

    const groups = ALL_APPS.map(function (group) {
      return {
        group: group.group,
        items: group.items
          .filter(function (a) { return itemMap[a.id]; })
          .map(function (a) { return itemMap[a.id]; }),
      };
    }).filter(function (g) { return g.items.length > 0; });

    // 末尾固定追加"管理"分组（更多应用入口，用于进入 more-apps 编辑收藏）
    groups.push({
      group: '管理',
      items: [Object.assign({}, MORE_APPS_ENTRY)],
    });

    return groups;
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
    // 用户在 more-apps 页面增删收藏后，主页同步刷新分组显示
    this._onFavoritesChanged = function (favorites) {
      that.setData({ menuGroups: that._buildMenuGroups(favorites, that._lastMenuFlags || {}) });
    };
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

  // 跳转考勤明细页
  onViewAttendance: function () {
    safeNavigate({ url: '/pages/attendance/detail/index' }).catch(function () {});
  },

  // ========== 点击事件 ==========

  onMenuTap: function (e) {
    const route = e.currentTarget.dataset.route;
    if (!route) return;
    const id = e.currentTarget.dataset.id;
    const isTabPage = ['/pages/home/index', '/pages/defect/index', '/pages/scan/index', '/pages/admin/index'].indexOf(route) !== -1;
    // 质检扫码入口默认偏好
    if (id === 'quality') {
      wx.setStorageSync('scan_pref_process', '质检');
    }
    safeNavigate({ url: route }, isTabPage ? 'switchTab' : undefined).catch(() => {});
  },
});
