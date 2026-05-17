var api = require('../../utils/api');
var { safeNavigate } = require('../../utils/uiHelper');
var { isTokenExpired } = require('../../utils/storage');
var { eventBus, Events } = require('../../utils/eventBus');

var DAILY_FLOWERS = [
  '🌸 樱花 — 生命之美，转瞬即永恒',
  '🌹 玫瑰 — 热情与勇气',
  '🌻 向日葵 — 追随阳光，永远热忱',
  '🌷 郁金香 — 优雅与自信',
  '🌺 木槿 — 坚韧温柔，细水长流',
  '💐 康乃馨 — 感恩与温暖',
  '🪻 薰衣草 — 等待一份美好',
  '🌼 雏菊 — 纯真与希望',
  '🏵️ 牡丹 — 雍容大气，不负韶华',
  '🌿 绿萝 — 生生不息，自在生长',
  '🪷 莲花 — 出淤泥而不染',
  '🌾 稻穗 — 越充实，越谦逊',
  '🍀 四叶草 — 幸运藏在坚持里',
  '💮 茉莉 — 清新淡雅，沁人心脾',
  '🪹 蒲公英 — 自由飞翔，落地生根',
  '🌲 松柏 — 四季常青，志存高远',
  '🌵 仙人掌 — 坚强不需要掌声',
  '🎋 竹子 — 虚心有节，宁折不弯',
  '🎍 梅花 — 凌寒独自开',
  '🌱 新芽 — 一切美好，正在生长',
  '🌳 橡树 — 根深才能叶茂',
  '🪴 多肉 — 小而美，也是一种力量',
  '🍃 银杏 — 时光沉淀出金色',
  '🌕 桂花 — 低调芬芳，不言自明',
  '🏔️ 雪莲 — 高处不胜寒，依然盛放',
  '🎐 风铃草 — 感谢每一次相遇',
  '🧊 水仙 — 内心丰盈，自有光芒',
  '🫧 满天星 — 甘做配角，也照亮全场',
  '🌴 椰树 — 面朝大海，从容不迫',
  '🍁 枫叶 — 每一次变化都是成长',
  '🎄 冬青 — 寒冬也有绿意',
];

var MENU_KEY_MAP = {
  smartOps: 'miniprogram.menu.smartOps',
  dashboard: 'miniprogram.menu.dashboard',
  orderCreate: 'miniprogram.menu.orderCreate',
  production: 'miniprogram.menu.production',
  quality: 'miniprogram.menu.quality',
  bundleSplit: 'miniprogram.menu.bundleSplit',
  cuttingDetail: 'miniprogram.menu.cuttingDetail',
  history: 'miniprogram.menu.history',
  factoryShipment: 'miniprogram.menu.factoryShipment',
  advance: 'miniprogram.menu.advance',
  wagePayment: 'miniprogram.menu.wagePayment',
};

function getGreeting() {
  var h = new Date().getHours();
  if (h < 12) return '上午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function buildMenuItems(menuVisibility) {
  var visibility = menuVisibility || {};
  var items = [];

  if (visibility.smartOps !== false) {
    items.push({ id: 'smartOps', name: '运营看板', iconClass: 'icon-menu-ai', circleClass: 'menu-icon-circle--purple', route: '/pages/smart-ops/index', badge: 'AI' });
  }
  if (visibility.orderCreate !== false) {
    items.push({ id: 'orderCreate', name: '下单管理', iconClass: 'icon-menu-order', circleClass: 'menu-icon-circle--blue', route: '/pages/order/create/index' });
  }
  if (visibility.dashboard !== false) {
    items.push({ id: 'dashboard', name: '生产管理', iconClass: 'icon-menu-production', circleClass: 'menu-icon-circle--teal', route: '/pages/dashboard/index' });
  }
  if (visibility.production !== false) {
    items.push({ id: 'production', name: '质检通知', iconClass: 'icon-menu-quality-notice', circleClass: 'menu-icon-circle--amber', route: '/pages/defect/index' });
  }
  if (visibility.quality !== false) {
    items.push({ id: 'quality', name: '生产扫码', iconClass: 'icon-menu-scan', circleClass: 'menu-icon-circle--green', route: '/pages/scan/index' });
  }
  if (visibility.bundleSplit !== false) {
    items.push({ id: 'bundleSplit', name: '菲号单价', iconClass: 'icon-menu-price', circleClass: 'menu-icon-circle--orange', route: '/pages/work/bundle-split/index' });
  }
  if (visibility.cuttingDetail !== false) {
    items.push({ id: 'cuttingDetail', name: '裁剪明细', iconClass: 'icon-menu-cutting', circleClass: 'menu-icon-circle--rose', route: '/pages/cutting/bundle-detail/index' });
  }
  if (visibility.history !== false) {
    items.push({ id: 'history', name: '扫码历史', iconClass: 'icon-menu-history', circleClass: 'menu-icon-circle--indigo', route: '/pages/scan/history/index' });
  }
  if (visibility.factoryShipment !== false) {
    items.push({ id: 'factoryShipment', name: '外发工厂', iconClass: 'icon-menu-shipment', circleClass: 'menu-icon-circle--cyan', route: '/pages/factory/shipment/index' });
  }

  return items;
}

Page({
  data: {
    greeting: '',
    userName: '',
    orgName: '',
    menuItems: [],
    unreadNoticeCount: 0,
    dateInfo: { date: '', day: '', season: '', dailyTip: '' },
  },

  _menuVisibility: null,

  onLoad: function () {
    this.setData({
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

    var season = this._computeSeasonBySolarTerms(now);
    var dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    var dailyTip = DAILY_FLOWERS[dayOfYear % DAILY_FLOWERS.length];

    this.setData({
      dateInfo: {
        date: m + '月' + d + '日', day: '星期' + weekDay,
        season: season, dailyTip: dailyTip,
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
