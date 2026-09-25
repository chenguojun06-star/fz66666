const { safeNavigate } = require('../../utils/uiHelper');
const api = require('../../utils/api');
const { eventBus, Events } = require('../../utils/eventBus');
const { isTenantOwner, getUserRole } = require('../../utils/storage');
const i18n = require('../../utils/i18n/index');

const NS = 'mp.moreApps.';
/**
 * 菜单项/分组名**复用首页的那一套键** —— 本页的 ALL_APPS 本来就是
 * 「与 home/index.js 保持一致」的同一份配置，没必要再造 29 个重复键。
 */
const MENU_NS = 'mp.home.';
const LANGS = ['zh-CN', 'en-US', 'vi-VN', 'km-KH'];

// 应用ID → 后端菜单权限key 映射（与 home/index.js 的 APP_ID_TO_MENU_KEY 对齐）
const APP_ID_TO_MENU_KEY = {
  'dashboard': 'miniprogram.menu.dashboard',
  'orderCreate': 'miniprogram.menu.orderCreate',
  'sampleDev': 'miniprogram.menu.sampleDev',
  'cuttingDetail': 'miniprogram.menu.cuttingDetail',
  'bundleSplit': 'miniprogram.menu.bundleSplit',
  'unitPrice': 'miniprogram.menu.unitPrice',
  'procurement': 'miniprogram.menu.procurement',
  'materialInbound': 'miniprogram.menu.materialInbound',
  'materialOutbound': 'miniprogram.menu.materialOutbound',
  'materialInventory': 'miniprogram.menu.materialInventory',
  'materialPicking': 'miniprogram.menu.materialPicking',
  'materialScan': 'miniprogram.menu.materialScan',
  'finishedInbound': 'miniprogram.menu.finishedInbound',
  'finishedOutbound': 'miniprogram.menu.finishedOutbound',
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
  // D-417：手机端新增「可办事」独立页（按职务可控）
  'materialRecon': 'miniprogram.menu.materialRecon',
  'expenseReimburse': 'miniprogram.menu.expenseReimburse',
  'payrollApproval': 'miniprogram.menu.payrollApproval',
  'exceptionReport': 'miniprogram.menu.exceptionReport',
  'collabTask': 'miniprogram.menu.collabTask',
};

// 所有应用配置（7大分类：开发/生产/物料/成品/财务/系统/其他，分组对齐PC端菜单）
const ALL_APPS = [
  { groupKey: 'groupDevelopment', items: [
    { id: 'sampleDev', nameKey: 'appSampleDev', iconClass: 'icon-menu-garment', circleClass: 'menu-icon-circle--violet', route: '/pages/sample-development/index/index' },
    { id: 'sampleStock', nameKey: 'appSampleStock', iconClass: 'icon-menu-garment', circleClass: 'menu-icon-circle--violet', route: '/pages/warehouse/sample/scan-action/index' },
    { id: 'orderCreate', nameKey: 'appOrderCreate', iconClass: 'icon-menu-order', circleClass: 'menu-icon-circle--green', route: '/pages/order/create/index' },
  ]},
  { groupKey: 'groupProduction', items: [
    { id: 'dashboard', nameKey: 'appDashboard', iconClass: 'icon-menu-progress', circleClass: 'menu-icon-circle--blue', route: '/pages/dashboard/index' },
    { id: 'cuttingDetail', nameKey: 'appCuttingDetail', iconClass: 'icon-menu-cutting', circleClass: 'menu-icon-circle--orange', route: '/pages/cutting/bundle-detail/index' },
    { id: 'bundleSplit', nameKey: 'appBundleSplit', iconClass: 'icon-menu-cutting', circleClass: 'menu-icon-circle--red', route: '/pages/work/bundle-split/index' },
    { id: 'unitPrice', nameKey: 'appUnitPrice', iconClass: 'icon-menu-wage', circleClass: 'menu-icon-circle--teal', route: '/pages/basic/unit-price/index' },
    { id: 'factoryShipment', nameKey: 'appFactoryShipment', iconClass: 'icon-menu-shipment', circleClass: 'menu-icon-circle--orange', route: '/pages/factory/shipment/index' },
    { id: 'exceptionReport', nameKey: 'appExceptionReport', iconClass: 'icon-menu-ai', circleClass: 'menu-icon-circle--orange', route: '/pages/smart-ops/exception-detail/index' },
  ]},
  { groupKey: 'groupMaterial', items: [
    { id: 'procurement', nameKey: 'appProcurement', iconClass: 'icon-menu-cart', circleClass: 'menu-icon-circle--blue', route: '/pages/procurement/task-list/index' },
    // D-514 物料瘦身：物料入库/出库/领料/料卷/库存 5 个图标合并为 1 个「物料中心」
    // 物料中心页内含 tab 切换（库存/入库/出库/领料/料卷），搜索栏带扫码按钮
    { id: 'materialCenter', nameKey: 'appMaterialCenter', iconClass: 'icon-menu-warehouse', circleClass: 'menu-icon-circle--lightblue', route: '/pages/warehouse/material-center/index' },
    { id: 'materialDatabase', nameKey: 'appMaterialDatabase', iconClass: 'icon-menu-material', circleClass: 'menu-icon-circle--teal', route: '/pages/warehouse/material-database/index' },
  ]},
  { groupKey: 'groupFinished', items: [
    { id: 'finishedInbound', nameKey: 'appFinishedInbound', iconClass: 'icon-menu-inbound', circleClass: 'menu-icon-circle--purple', route: '/pages/warehouse/finished-inbound/index' },
    { id: 'finishedInventory', nameKey: 'appFinishedInventory', iconClass: 'icon-menu-stock-check', circleClass: 'menu-icon-circle--purple', route: '/pages/warehouse/finished-inventory/index' },
    { id: 'finishedOutbound', nameKey: 'appFinishedOutbound', iconClass: 'icon-menu-outbound', circleClass: 'menu-icon-circle--purple', route: '/pages/warehouse/finished-outbound/index' },
    { id: 'locationScan', nameKey: 'appLocationScan', iconClass: 'icon-menu-location', circleClass: 'menu-icon-circle--green', route: '/pages/warehouse/location-scan/index' },
  ]},
  { groupKey: 'groupFinance', items: [
    { id: 'wagePayment', nameKey: 'appWagePayment', iconClass: 'icon-menu-wage', circleClass: 'menu-icon-circle--red', route: '/pages/payroll/payroll' },
    { id: 'payrollApproval', nameKey: 'appPayrollApproval', iconClass: 'icon-menu-wage', circleClass: 'menu-icon-circle--red', route: '/pages/finance/payroll-approval/index' },
    { id: 'financePayment', nameKey: 'appFinancePayment', iconClass: 'icon-menu-finance', circleClass: 'menu-icon-circle--green', route: '/pages/finance/payment/index' },
    { id: 'materialRecon', nameKey: 'appMaterialRecon', iconClass: 'icon-menu-finance', circleClass: 'menu-icon-circle--green', route: '/pages/finance/reconciliation/index' },
    { id: 'expenseReimburse', nameKey: 'appExpenseReimburse', iconClass: 'icon-menu-advance', circleClass: 'menu-icon-circle--green', route: '/pages/finance/reimbursement/index' },
    { id: 'advance', nameKey: 'appAdvance', iconClass: 'icon-menu-advance', circleClass: 'menu-icon-circle--lightblue', route: '/pages/advance/list/index' },
    { id: 'salesOverview', nameKey: 'appSalesOverview', iconClass: 'icon-menu-stats', circleClass: 'menu-icon-circle--violet', route: '/pages/sales/overview/index' },
  ]},
  { groupKey: 'groupSystem', items: [
    { id: 'userApproval', nameKey: 'appUserApproval', iconClass: 'icon-menu-user', circleClass: 'menu-icon-circle--gray', route: '/pages/admin/user-approval/index' },
    { id: 'feedback', nameKey: 'appFeedback', iconClass: 'icon-menu-feedback', circleClass: 'menu-icon-circle--blue', route: '/pages/admin/misc/feedback/index' },
  ]},
  { groupKey: 'groupOther', items: [
    { id: 'smartOps', nameKey: 'appSmartOps', iconClass: 'icon-menu-ai', circleClass: 'menu-icon-circle--purple', route: '/pages/smart-ops/index' },
    { id: 'collabTask', nameKey: 'appCollabTask', iconClass: 'icon-menu-user', circleClass: 'menu-icon-circle--violet', route: '/pages/collab-task/list/index' },
    { id: 'returnList', nameKey: 'appReturnList', iconClass: 'icon-menu-return', circleClass: 'menu-icon-circle--red', route: '/pages/return/list/index' },
  ]},
];

/** id → 应用定义（含 nameKey） */
const APP_INDEX = {};
ALL_APPS.forEach(function (g) {
  g.items.forEach(function (a) { APP_INDEX[a.id] = a; });
});

/**
 * 搜索源：把**四个语言**的应用名都拼进去。
 * 只按当前语言搜的话，用户切了语言后用另一种语言搜就搜不到（数据里存的是中文原名）。
 */
const SEARCH_TEXT = {};
Object.keys(APP_INDEX).forEach(function (id) {
  SEARCH_TEXT[id] = LANGS.map(function (l) {
    return i18n.t(MENU_NS + APP_INDEX[id].nameKey, l);
  }).join(' ').toLowerCase();
});

/**
 * 按语言本地化一个应用。
 * ⚠️ 查不到 id 时原样返回它的 name（不能返回空串或键名）。
 */
function localizeApp(it, lang) {
  const def = APP_INDEX[it && it.id];
  return {
    id: it.id,
    name: def && def.nameKey ? i18n.t(MENU_NS + def.nameKey, lang) : (it.name || ''),
    iconClass: it.iconClass,
    circleClass: it.circleClass,
    route: it.route,
    badge: it.badge,
    isFav: it.isFav,
  };
}

Page({
  data: {
    searchKeyword: '',
    allApps: ALL_APPS,
    filteredApps: ALL_APPS,
    favoriteApps: [],
    editing: false,
    menuFlags: {},
    isAdmin: false,
    // i18n：当前语言文案
    t: {},
  },

  onLoad: function () {
    this.applyLanguage(i18n.getLanguage());
    this._checkAdmin();
    this.loadMenuConfig();
  },

  onShow: function () {
    this.applyLanguage(i18n.getLanguage());
    this.loadFavorites();
  },

  /**
   * 应用语言：写入 t，并把「全部应用」列表按新语言重新生成。
   * 导航栏标题复用首页的 appMoreApps（本页就是那个入口的目标页）。
   */
  applyLanguage: function (language) {
    const lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    wx.setNavigationBarTitle({ title: i18n.t(MENU_NS + 'appMoreApps', lang) });
    this.setData({
      t: {
        searchPlaceholder: i18n.t(NS + 'searchPlaceholder', lang),
        // 编辑按钮的「编辑」用 common.edit（已有通用词），「完成」是本页专有
        edit: i18n.t('common.edit', lang),
        done: i18n.t(NS + 'done', lang),
        roleConfig: i18n.t(NS + 'roleConfig', lang),
        myFavorites: i18n.t(NS + 'myFavorites', lang),
        clear: i18n.t('common.clear', lang),
      },
      // 收藏区显示的名字也要跟着变（按 id 反查，收藏里存的是存进去那一刻的语言）
      favoriteApps: (this.data.favoriteApps || []).map(function (f) {
        return localizeApp(f, lang);
      }),
    });
    this.filterApps(this.data.searchKeyword);
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

    const lang = this._lang;
    const filtered = ALL_APPS.map(function (group) {
      return {
        groupKey: group.groupKey,
        items: group.items
          .filter(function (item) {
            // 搜索过滤：按**四种语言**的应用名匹配（用户切语言后仍能用原语言搜到）
            if ((SEARCH_TEXT[item.id] || '').indexOf(k) === -1) return false;
            // 菜单权限过滤：未配置或配置为true时可见
            const menuKey = APP_ID_TO_MENU_KEY[item.id];
            if (menuKey) {
              return flags[menuKey] !== false;
            }
            return true;
          })
          .map(function (item) {
            return localizeApp(Object.assign({}, item, { isFav: favIds.has(item.id) }), lang);
          }),
      };
    }).filter(function (g) { return g.items.length > 0; });

    // 分组标题与「N个」计数同样是文案
    filtered.forEach(function (g) {
      g.group = i18n.t(MENU_NS + g.groupKey, lang);
      g._countText = i18n.tf(MENU_NS + 'appCount', { count: g.items.length }, lang);
    });
    this.setData({
      filteredApps: filtered,
      't.noResultText': i18n.tf(NS + 'noResultText', { kw: keyword || '' }, lang),
    });
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
      // ⚠️ ALL_APPS 里已没有 `name` 字段（改成 nameKey 了）——这里必须取本地化后的名字，
      //    直接写 app.name 会把 undefined 存进收藏，首页 fallback 就显示空白。
      favorites.push({
        id: app.id,
        name: i18n.t(MENU_NS + app.nameKey, this._lang),
        iconClass: app.iconClass,
        circleClass: app.circleClass,
        route: app.route,
        badge: app.badge,
      });
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
      title: i18n.t(NS + 'confirmClearTitle', this._lang),
      content: i18n.t(NS + 'confirmClearContent', this._lang),
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
