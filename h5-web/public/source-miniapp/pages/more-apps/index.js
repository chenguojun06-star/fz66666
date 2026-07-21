const { safeNavigate } = require('../../utils/uiHelper');
const api = require('../../utils/api');
const { eventBus, Events } = require('../../utils/eventBus');
const { isTenantOwner, getUserRole } = require('../../utils/storage');

// 应用ID → 后端菜单权限key 映射
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
};

// 所有应用配置（与设计稿对齐：4组 x 4个 = 16个应用）
const ALL_APPS = [
  { group: '生产模块', items: [
    { id: 'dashboard', name: '生产管理', iconClass: 'icon-menu-progress', circleClass: 'menu-icon-circle--blue', route: '/pages/dashboard/index' },
    { id: 'orderCreate', name: '下单管理', iconClass: 'icon-menu-order', circleClass: 'menu-icon-circle--green', route: '/pages/order/create/index' },
    { id: 'sampleDev', name: '样衣开发', iconClass: 'icon-menu-garment', circleClass: 'menu-icon-circle--violet', route: '/pages/sample-development/index/index' },
    { id: 'cuttingDetail', name: '裁剪管理', iconClass: 'icon-menu-cutting', circleClass: 'menu-icon-circle--orange', route: '/pages/cutting/bundle-detail/index' },
    { id: 'bundleSplit', name: '菲号管理', iconClass: 'icon-menu-cutting', circleClass: 'menu-icon-circle--red', route: '/pages/work/bundle-split/index' },
    { id: 'unitPrice', name: '资料单价', iconClass: 'icon-menu-wage', circleClass: 'menu-icon-circle--teal', route: '/pages/basic/unit-price/index' },
  ]},
  { group: '供应链', items: [
    { id: 'procurement', name: '采购任务', iconClass: 'icon-menu-cart', circleClass: 'menu-icon-circle--blue', route: '/pages/procurement/task-list/index' },
    { id: 'materialScan', name: '物料入库', iconClass: 'icon-menu-warehouse', circleClass: 'menu-icon-circle--lightblue', route: '/pages/warehouse/material/scan/index' },
    { id: 'locationScan', name: '库位扫码', iconClass: 'icon-menu-location', circleClass: 'menu-icon-circle--green', route: '/pages/warehouse/location-scan/index' },
    { id: 'factoryShipment', name: '外发管理', iconClass: 'icon-menu-shipment', circleClass: 'menu-icon-circle--orange', route: '/pages/factory/shipment/index' },
    { id: 'materialDatabase', name: '物料资料', iconClass: 'icon-menu-material', circleClass: 'menu-icon-circle--teal', route: '/pages/warehouse/material-database/index' },
    { id: 'finishedInventory', name: '成品仓储', iconClass: 'icon-menu-stock-check', circleClass: 'menu-icon-circle--purple', route: '/pages/warehouse/finished-inventory/index' },
    { id: 'sampleStock', name: '样衣仓库', iconClass: 'icon-menu-garment', circleClass: 'menu-icon-circle--violet', route: '/pages/warehouse/sample/scan-action/index' },
  ]},
  { group: '财务销售', items: [
    { id: 'wagePayment', name: '工资查询', iconClass: 'icon-menu-wage', circleClass: 'menu-icon-circle--red', route: '/pages/payroll/payroll' },
    { id: 'financePayment', name: '财务付款', iconClass: 'icon-menu-finance', circleClass: 'menu-icon-circle--green', route: '/pages/finance/payment/index' },
    { id: 'advance', name: '预付款', iconClass: 'icon-menu-advance', circleClass: 'menu-icon-circle--lightblue', route: '/pages/advance/list/index' },
    { id: 'salesOverview', name: '销售概览', iconClass: 'icon-menu-stats', circleClass: 'menu-icon-circle--violet', route: '/pages/sales/overview/index' },
  ]},
  { group: '其他', items: [
    { id: 'smartOps', name: '智能运营', iconClass: 'icon-menu-ai', circleClass: 'menu-icon-circle--purple', route: '/pages/smart-ops/index' },
    { id: 'returnList', name: '退货管理', iconClass: 'icon-menu-return', circleClass: 'menu-icon-circle--red', route: '/pages/return/list/index' },
    { id: 'userApproval', name: '用户审批', iconClass: 'icon-menu-user', circleClass: 'menu-icon-circle--gray', route: '/pages/admin/user-approval/index' },
    { id: 'feedback', name: '意见反馈', iconClass: 'icon-menu-feedback', circleClass: 'menu-icon-circle--blue', route: '/pages/admin/misc/feedback/index' },
  ]},
];

Page({
  data: {
    searchKeyword: '',
    allApps: ALL_APPS,
    filteredApps: ALL_APPS,
    favoriteApps: [],
    editing: false,
    menuFlags: {},
    isAdmin: false,
  },

  onLoad: function () {
    this._checkAdmin();
    this.loadMenuConfig();
  },

  onShow: function () {
    this.loadFavorites();
  },

  _checkAdmin: function () {
    const role = getUserRole();
    const admin = isTenantOwner() || /admin|manager|supervisor|merchandiser/i.test(role);
    this.setData({ isAdmin: admin });
  },

  loadMenuConfig: function () {
    const that = this;
    api.system.getMiniprogramMenuConfig().then(function (res) {
      const flags = res || {};
      that.setData({ menuFlags: flags });
      that.loadFavorites();
    }).catch(function () {
      that.setData({ menuFlags: {} });
      that.loadFavorites();
    });
  },

  onBack: function () {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/home/index' });
    }
  },

  loadFavorites: function () {
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
      that.setData({ favoriteApps: favorites });
      that.filterApps(that.data.searchKeyword, favorites);
    }).catch(function () {
      try {
        const favorites = wx.getStorageSync('favoriteApps') || [];
        that.setData({ favoriteApps: favorites });
        that.filterApps(that.data.searchKeyword, favorites);
      } catch (e) {
        console.error('Load favorites failed', e);
      }
    });
  },

  onSearchInput: function (e) {
    let keyword = (e.detail.value || '').trim();
    if (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.clear) keyword = '';
    this.setData({ searchKeyword: keyword });
    this.filterApps(keyword);
  },

  filterApps: function (keyword, favorites) {
    const k = (keyword || '').toLowerCase();
    const favs = favorites || this.data.favoriteApps || [];
    const favIds = new Set(favs.map(function(f) { return f.id; }));
    const flags = this.data.menuFlags || {};

    const filtered = ALL_APPS.map(function (group) {
      return {
        group: group.group,
        items: group.items
          .filter(function (item) {
            // 搜索过滤
            if (item.name.toLowerCase().indexOf(k) === -1) return false;
            // 菜单权限过滤：未配置或配置为true时可见
            const menuKey = APP_ID_TO_MENU_KEY[item.id];
            if (menuKey) {
              return flags[menuKey] !== false;
            }
            return true;
          })
          .map(function (item) {
            return Object.assign({}, item, { isFav: favIds.has(item.id) });
          }),
      };
    }).filter(function (g) { return g.items.length > 0; });
    this.setData({ filteredApps: filtered });
  },

  onAppTap: function (e) {
    // 编辑模式下不跳转，只允许收藏/取消收藏
    if (this.data.editing) return;
    const route = e.currentTarget.dataset.route;
    if (!route) return;
    safeNavigate({ url: route }).catch(function() {});
  },

  onEditToggle: function () {
    this.setData({ editing: !this.data.editing });
  },

  onGotoRoleConfig: function () {
    safeNavigate({ url: '/pages/admin/menu-role-config/index' }).catch(function() {});
  },

  onToggleFavorite: function (e) {
    const appId = e.currentTarget.dataset.id;
    if (!appId) return;

    // 从 ALL_APPS 查找应用完整信息
    var app = null;
    ALL_APPS.forEach(function (group) {
      group.items.forEach(function (item) {
        if (item.id === appId) app = item;
      });
    });
    if (!app) return;

    const favorites = this.data.favoriteApps.slice();
    const existingIndex = favorites.findIndex(function (f) { return f.id === app.id; });

    if (existingIndex >= 0) {
      favorites.splice(existingIndex, 1);
    } else {
      favorites.push({ id: app.id, name: app.name, iconClass: app.iconClass, circleClass: app.circleClass, route: app.route, badge: app.badge });
    }

    try { wx.setStorageSync('favoriteApps', favorites); } catch (e2) { /* ignore */ }
    this.setData({ favoriteApps: favorites });
    this.filterApps(this.data.searchKeyword, favorites);

    // 通知首页更新收藏列表
    eventBus.emit(Events.FAVORITES_CHANGED, favorites);

    // 异步同步到服务端
    this._syncToServer(favorites);
  },

  onClearFavorites: function () {
    const that = this;
    wx.showModal({
      title: '确认清空',
      content: '确定要清空收藏吗？',
      success: function (res) {
        if (res.confirm) {
          const emptyFavorites = [];
          try { wx.setStorageSync('favoriteApps', emptyFavorites); } catch (e) { /* ignore */ }
          that.setData({ favoriteApps: emptyFavorites, editing: false });
          that.filterApps(that.data.searchKeyword, emptyFavorites);
          eventBus.emit(Events.FAVORITES_CHANGED, emptyFavorites);
          that._syncToServer(emptyFavorites);
        }
      },
    });
  },

  _syncToServer: function (favorites) {
    try {
      api.system.saveFavoriteApps(JSON.stringify(favorites)).catch(function (e) {
        console.warn('[more-apps] sync favorites to server failed:', e.message || e);
      });
    } catch (e) { /* ignore */ }
  },
});
