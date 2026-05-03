var api = require('../../utils/api');
var { safeNavigate } = require('../../utils/uiHelper');
var { isAdminOrSupervisor } = require('../../utils/permission');
var { isTenantOwner, isFactoryOwner, isTokenExpired } = require('../../utils/storage');
var { eventBus, Events } = require('../../utils/eventBus');

var MONTH_FLOWERS = [
  { icon: '🎍', name: '梅花' },
  { icon: '🌺', name: '杏花' },
  { icon: '🌸', name: '桃花' },
  { icon: '🏵️', name: '牡丹' },
  { icon: '🌷', name: '石榴花' },
  { icon: '🪷', name: '荷花' },
  { icon: '🌻', name: '蜀葵' },
  { icon: '🌕', name: '桂花' },
  { icon: '💮', name: '菊花' },
  { icon: '🌺', name: '芙蓉' },
  { icon: '🌼', name: '山茶花' },
  { icon: '🧊', name: '水仙' },
];

var DAILY_SAYINGS = [
  '凌寒独自开，暗香浮动',
  '满园春色关不住',
  '人面桃花相映红',
  '花开时节动京城',
  '蕊珠如火一时开',
  '出淤泥而不染，濯清涟而不妖',
  '向阳而生，永远热忱',
  '低调芬芳，不言自明',
  '宁可枝头抱香死',
  '一日三变，愈晚愈红',
  '唯有山茶偏耐久',
  '凌波仙子，自有光芒',
  '采菊东篱下，悠然见南山',
  '疏影横斜水清浅',
  '接天莲叶无穷碧',
  '映日荷花别样红',
  '人闲桂花落，夜静春山空',
  '不是花中偏爱菊',
  '此花开尽更无花',
  '桃之夭夭，灼灼其华',
  '唯有牡丹真国色',
  '小荷才露尖尖角',
  '稻花香里说丰年',
  '待到山花烂漫时',
  '她在丛中笑',
  '落红不是无情物',
  '化作春泥更护花',
  '乱花渐欲迷人眼',
  '浅草才能没马蹄',
  '黄四娘家花满蹊',
  '千朵万朵压枝低',
];

var MENU_KEY_MAP = {
  smartOps: 'miniprogram.menu.smartOps',
  dashboard: 'miniprogram.menu.dashboard',
  orderCreate: 'miniprogram.menu.orderCreate',
  bundleSplit: 'miniprogram.menu.bundleSplit',
  cuttingDetail: 'miniprogram.menu.cuttingDetail',
};

function getGreeting() {
  var h = new Date().getHours();
  if (h < 12) return '上午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function buildMenuItems(menuVisibility) {
  var visibility = menuVisibility || {};
  var canSeeDashboard = isTenantOwner() || isAdminOrSupervisor();
  var canSeeSmartOps = isTenantOwner();
  var canCreateOrder = isAdminOrSupervisor() || isFactoryOwner();
  var items = [];

  if (canSeeSmartOps && visibility.smartOps !== false) {
    items.push({ id: 'smartOps', name: '运营看板', iconClass: 'icon-dashboard', circleClass: 'menu-icon-circle--indigo', route: '/pages/smart-ops/index', badge: 'AI' });
  }
  if (canCreateOrder && visibility.orderCreate !== false) {
    items.push({ id: 'orderCreate', name: '下单管理', iconClass: 'icon-order', circleClass: 'menu-icon-circle--blue', route: '/pages/order/create/index' });
  }
  if (canSeeDashboard && visibility.dashboard !== false) {
    items.push({ id: 'dashboard', name: '生产管理', iconClass: 'icon-dashboard', circleClass: 'menu-icon-circle--indigo', route: '/pages/dashboard/index' });
  }
  if (visibility.production !== false) {
    items.push({ id: 'production', name: '质检通知', iconClass: 'icon-progress', circleClass: 'menu-icon-circle--blue', route: '/pages/defect/index' });
  }
  if (visibility.quality !== false) {
    items.push({ id: 'quality', name: '生产扫码', iconClass: 'icon-quality', circleClass: 'menu-icon-circle--green', route: '/pages/scan/index' });
  }
  if (visibility.bundleSplit !== false) {
    items.push({ id: 'bundleSplit', name: '菲号单价', iconClass: 'icon-cutting', circleClass: 'menu-icon-circle--orange', route: '/pages/work/bundle-split/index' });
  }
  if (visibility.cuttingDetail !== false) {
    items.push({ id: 'cuttingDetail', name: '裁剪明细', iconClass: 'icon-cutting', circleClass: 'menu-icon-circle--blue', route: '/pages/cutting/bundle-detail/index' });
  }
  if (visibility.history !== false) {
    items.push({ id: 'history', name: '历史记录', iconClass: 'icon-history', circleClass: 'menu-icon-circle--purple', route: '/pages/scan/history/index' });
  }
  if (visibility.payroll !== false) {
    items.push({ id: 'payroll', name: '当月工资', iconClass: 'icon-payroll', circleClass: 'menu-icon-circle--teal', route: '/pages/payroll/payroll' });
  }

  return items;
}

Page({
  data: {
    statusBarHeight: 0,
    greeting: '',
    userName: '',
    orgName: '',
    menuItems: [],
    unreadNoticeCount: 0,
    dateInfo: { icon: '', date: '', day: '', season: '', dailyTip: '' },
  },

  _menuVisibility: null,

  onLoad: function () {
    var sysInfo = wx.getWindowInfo();
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 44,
      greeting: getGreeting(),
      menuItems: buildMenuItems(null),
    });
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._loadUserName();
    this._computeDateInfo();
  },

  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this.setData({ greeting: getGreeting() });
    this._computeDateInfo();
    this._loadUserName(true);
    this._refreshHomeData();
    this._bindWsEvents();
    this._loadMenuVisibility();
  },

  onHide: function () {
    this._unbindWsEvents();
  },

  onUnload: function () {
    this._unbindWsEvents();
  },

  onPullDownRefresh: function () {
    this._refreshHomeData().finally(function () { wx.stopPullDownRefresh(); });
  },

  _refreshHomeData: function () {
    return Promise.allSettled([this._loadUnreadCount()]);
  },

  _bindWsEvents: function () {
    if (this._wsBound) return;
    this._wsBound = true;
    var that = this;
    this._onDataChanged = function () { that._refreshHomeData(); };
    this._onOrderProgress = function () { that._refreshHomeData(); };
    this._onWarehouseIn = function () { that._refreshHomeData(); };
    this._onRefreshAll = function () { that._loadMenuVisibility(); that._refreshHomeData(); };
    eventBus.on(Events.DATA_CHANGED, this._onDataChanged);
    eventBus.on(Events.ORDER_PROGRESS_CHANGED, this._onOrderProgress);
    eventBus.on(Events.WAREHOUSE_IN, this._onWarehouseIn);
    eventBus.on(Events.REFRESH_ALL, this._onRefreshAll);
  },

  _unbindWsEvents: function () {
    if (!this._wsBound) return;
    this._wsBound = false;
    if (this._onDataChanged) eventBus.off(Events.DATA_CHANGED, this._onDataChanged);
    if (this._onOrderProgress) eventBus.off(Events.ORDER_PROGRESS_CHANGED, this._onOrderProgress);
    if (this._onWarehouseIn) eventBus.off(Events.WAREHOUSE_IN, this._onWarehouseIn);
    if (this._onRefreshAll) eventBus.off(Events.REFRESH_ALL, this._onRefreshAll);
  },

  _loadMenuVisibility: function () {
    var self = this;
    api.system.getMiniprogramMenuConfig().then(function (resp) {
      return resp;
    }).catch(function () {
      return null;
    }).then(function (resp) {
      var flags = (resp && resp.data) || resp || {};
      var visibility = {};
      Object.keys(MENU_KEY_MAP).forEach(function (shortKey) {
        var fullKey = MENU_KEY_MAP[shortKey];
        if (typeof flags[fullKey] === 'boolean') {
          visibility[shortKey] = flags[fullKey];
        }
      });
      self._menuVisibility = visibility;
      self.setData({ menuItems: buildMenuItems(visibility) });
    });
  },

  _loadUserName: function (forceRemote) {
    var app = getApp();
    var globalInfo = (app && app.globalData && app.globalData.userInfo) || {};
    var cacheInfo = wx.getStorageSync('user_info') || wx.getStorageSync('userInfo') || {};
    var info = Object.assign({}, cacheInfo, globalInfo);
    var name = info.realName || info.name || info.nickName || info.nickname || '用户';
    var orgName = info.factoryName || info.tenantName || '';
    var patch = {};
    if (name !== this.data.userName) patch.userName = name;
    if (orgName !== this.data.orgName) patch.orgName = orgName;
    if (Object.keys(patch).length) this.setData(patch);

    if (!forceRemote && this._loadedUserNameFromRemote) return;
    var authToken = wx.getStorageSync('auth_token') || '';
    if (!authToken || isTokenExpired()) return;
    this._loadedUserNameFromRemote = true;
    var that = this;
    api.system.getMe()
      .then(function (res) {
        var me = res || {};
        var remoteName = me.realName || me.name || me.nickName || me.nickname;
        var remoteOrgName = me.factoryName || me.tenantName || '';
        var remotePatch = {};
        if (remoteName && remoteName !== that.data.userName) remotePatch.userName = remoteName;
        if (remoteOrgName && remoteOrgName !== that.data.orgName) remotePatch.orgName = remoteOrgName;
        if (Object.keys(remotePatch).length) that.setData(remotePatch);
      })
      .catch(function (e) { console.warn('[home] _loadUserName失败:', e.message || e); });
  },

  _loadUnreadCount: function () {
    var self = this;
    return api.notice.unreadCount()
      .then(function (res) {
        var count = Number(res) || 0;
        self.setData({ unreadNoticeCount: count });
      })
      .catch(function (e) { console.warn('[home] _loadUnreadCount失败:', e.message || e); });
  },

  _computeDateInfo: function () {
    var now = new Date();
    var m = now.getMonth() + 1;
    var d = now.getDate();
    var weekDay = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];

    var flower = MONTH_FLOWERS[m - 1];
    var season = this._computeSeasonBySolarTerms(now);
    var saying = DAILY_SAYINGS[(d - 1) % DAILY_SAYINGS.length];

    this.setData({
      dateInfo: {
        icon: flower.icon, date: m + '月' + d + '日', day: '星期' + weekDay,
        season: season, flowerName: flower.name, dailyTip: flower.icon + ' ' + flower.name + ' — ' + saying,
      },
    });
  },

  _computeSeasonBySolarTerms: function (now) {
    var y = now.getFullYear();
    var yy = y % 100;
    var dayOfTerm = function (C) {
      return Math.floor(yy * 0.2422 + C) - Math.floor(yy / 4);
    };
    var liChun = new Date(y, 1, dayOfTerm(4.81));
    var liXia = new Date(y, 4, dayOfTerm(5.52));
    var liQiu = new Date(y, 7, dayOfTerm(7.57));
    var liDong = new Date(y, 10, dayOfTerm(7.44));
    if (now < liChun) return '冬';
    if (now < liXia) return '春';
    if (now < liQiu) return '夏';
    if (now < liDong) return '秋';
    return '冬';
  },

  onMenuTap: function (e) {
    var idx = e.currentTarget.dataset.index;
    var item = this.data.menuItems[idx];
    if (!item) return;

    if (item.tab) {
      wx.setStorageSync('work_active_tab', item.tab);
    }

    if (item.id === 'quality') {
      wx.setStorageSync('scan_pref_process', '质检');
    }

    var isTabPage = ['/pages/home/index', '/pages/defect/index', '/pages/scan/index', '/pages/admin/index'].indexOf(item.route) !== -1;
    safeNavigate({ url: item.route }, isTabPage ? 'switchTab' : undefined);
  },

});
