const api = require('../../utils/api');
const { safeNavigate } = require('../../utils/uiHelper');
const { isTokenExpired } = require('../../utils/storage');
const { eventBus, Events } = require('../../utils/eventBus');
const { getAuthedImageUrl } = require('../../utils/fileUrl');
const i18n = require('../../utils/i18n/index');

/** 本页 i18n 命名空间前缀 */
const NS = 'mp.home.';

// 应用ID → 后端菜单权限key 映射（与 more-apps/index.js 对齐）
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

/** 今日小贴士：只存 i18n 键后缀，正文按当前语言取 */
const DAILY_TIP_KEYS = ['tip1', 'tip2', 'tip3', 'tip4', 'tip5', 'tip6', 'tip7', 'tip8', 'tip9', 'tip10'];

// 全部应用配置（与 more-apps/index.js 的 ALL_APPS 保持一致）
// 主页按7大分类分组显示全部应用（开发/生产/物料/成品/财务/系统/其他，分组对齐PC端菜单：
// 下单归开发、物料/成品分列，对齐 PC"样衣管理/物料管理/成品管理"），
// 避免用户收藏多了之后一维平铺看着混乱。
/**
 * ⚠️ `id` 与 `route` 是**路由/权限契约**（`APP_ID_TO_MENU_KEY` 还拿 id 去查后端菜单权限），
 *    绝不能跟着语言变；这里只把 `group` / `name` 换成 i18n 键后缀。
 */
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

// "更多应用"入口：保留作为管理收藏/搜索/权限配置的入口
const MORE_APPS_ENTRY = {
  id: 'moreApps',
  nameKey: 'appMoreApps',
  iconClass: 'icon-menu-more',
  circleClass: 'menu-icon-circle--gray',
  route: '/pages/more-apps/index',
};

/**
 * id → 应用定义（含 nameKey）。收藏数据是用户存在本地/后端的，
 * 里面的 name 是**存进去那一刻的语言**，所以要按 id 反查 nameKey 重新翻译，
 * 不能直接拿 favorites 里的 name。
 */
const APP_INDEX = {};
ALL_APPS.forEach(function (g) {
  g.items.forEach(function (a) { APP_INDEX[a.id] = a; });
});
APP_INDEX[MORE_APPS_ENTRY.id] = MORE_APPS_ENTRY;

/** 时段 → 问候语键后缀 */
const GREETING_KEYS = ['greetingMorning', 'greetingAfternoon', 'greetingEvening'];

function getGreetingKey() {
  const h = new Date().getHours();
  if (h < 12) return GREETING_KEYS[0];
  if (h < 18) return GREETING_KEYS[1];
  return GREETING_KEYS[2];
}

/** 考勤状态 → i18n 键后缀（库里存的是状态，文案前端派生） */
const ATTENDANCE_KEYS = {
  notClocked: 'attendanceNotClocked',
  working: 'attendanceWorking',
  clockedOut: 'attendanceClockedOut',
};

/** 季节 → i18n 键后缀 */
const SEASON_KEYS = {
  spring: 'seasonSpring', summer: 'seasonSummer', autumn: 'seasonAutumn', winter: 'seasonWinter',
};

/** 星期 → i18n 键后缀（中英文结构不同，整词各存一份，不拼「星期」前缀） */
const WEEKDAY_KEYS = ['weekdaySun', 'weekdayMon', 'weekdayTue', 'weekdayWed', 'weekdayThu', 'weekdayFri', 'weekdaySat'];

/**
 * 把一个应用对象按语言本地化。
 * ⚠️ 未知 id（历史收藏 / 后端新增）在 APP_INDEX 里查不到 —— 此时**原样返回它的 name**，
 *    不能返回空串或键名，否则用户会看到空白或 `mp.home.xxx`。
 */
function localizeApp(it, lang) {
  const def = APP_INDEX[it && it.id];
  return {
    id: it.id,
    name: def && def.nameKey ? i18n.t(NS + def.nameKey, lang) : (it.name || ''),
    iconClass: it.iconClass,
    circleClass: it.circleClass,
    route: it.route,
    badge: it.badge,
  };
}

Page({
  data: {
    greeting: '',
    // 「问候语，用户名」整句（中英文标点不同，不能在 wxml 里拼）
    greetingText: '',
    userName: '',
    orgName: '',
    avatarImgUrl: '',
    // 按分类分组的应用列表（与"编辑app"页面分组逻辑对齐）
    menuRows: [],
    unreadNoticeCount: 0,
    dateInfo: { date: '', day: '', season: '', dailyTip: '' },
    // 考勤打卡
    attendanceStatusText: i18n.t(NS + ATTENDANCE_KEYS.notClocked, i18n.getLanguage()),
    attendanceStatusClass: 'attendance-status--idle',
    attendanceClockInText: '--:--',
    attendanceClockOutText: '--:--',
    monthlyHoursText: '0.0',
    monthlyDaysText: '0',
    clockInBtnActive: true,
    clockOutBtnActive: false,
    // i18n：当前语言文案（由 applyLanguage 一次性写入，wxml 用 {{t.xxx}}）
    t: {},
  },

  onLoad: function () {
    this.applyLanguage(i18n.getLanguage());
    this.setData({ menuRows: this._buildMenuGroups(null) });
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._loadUserName();
    this._computeDateInfo();
    this._loadFavorites();
  },

  onShow: function () {
    // 🔴 每次回页都重刷语言（用户可能在"我的"页切了语言）
    this.applyLanguage(i18n.getLanguage());
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._computeDateInfo();
    this._loadUserName(true);
    this._refreshHomeData();
    this._loadFavorites();
    this._loadAttendance();
    this._bindEvents();
  },

  /**
   * 应用语言：一次性写入 t，并重算所有与语言相关的派生数据。
   * ⚠️ 本页大部分文案不是静态的（菜单名、日期、打卡状态、统计），
   *    所以这里必须把它们全部重新生成一遍，否则切语言后界面只有一半变。
   */
  applyLanguage: function (language) {
    const lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;

    // 导航栏标题只能运行时设（json 里是静态兜底）
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'title', lang) });

    this.setData({
      t: {
        defaultAvatarLetter: i18n.t(NS + 'defaultAvatarLetter', lang),
        welcomeFallback: i18n.t(NS + 'welcomeFallback', lang),
        dailyTipTitle: i18n.t(NS + 'dailyTipTitle', lang),
        attendanceTitle: i18n.t(NS + 'attendanceTitle', lang),
        detailLink: i18n.t(NS + 'detailLink', lang),
        clockInLabel: i18n.t(NS + 'clockInLabel', lang),
        clockOutLabel: i18n.t(NS + 'clockOutLabel', lang),
        thisMonthLabel: i18n.t(NS + 'thisMonthLabel', lang),
        clockInBtn: i18n.t(NS + 'clockInBtn', lang),
        clockOutBtn: i18n.t(NS + 'clockOutBtn', lang),
      },
      greeting: i18n.t(NS + getGreetingKey(), lang),
      dateInfo: this._buildDateInfo(lang),
      attendanceStatusText: i18n.t(NS + ATTENDANCE_KEYS[this._attendanceState || 'notClocked'], lang),
      // 菜单：名称与分组标题都按新语言重生成
      menuRows: this._buildMenuGroups(this._lastFavorites || null, this._lastMenuFlags || {}),
    });
    this._refreshGreetingText(lang);
    this._refreshMonthlyStatsText(lang);
    // 底栏四个 tab 文字跟着语言走（app.json 里是静态中文兜底）
    i18n.applyTabBar(lang);
  },

  /** 「问候语，用户名」整句（逗号在中英文里不同，故走模板） */
  _refreshGreetingText: function (lang) {
    const l = lang || this._lang;
    this.setData({
      greetingText: i18n.tf(NS + 'greetingWithName', {
        greeting: i18n.t(NS + getGreetingKey(), l),
        name: this.data.userName || i18n.t(NS + 'defaultUserName', l),
      }, l),
    });
  },

  /** 本月工时/天数（带两个参数，列表变化与切语言都要重算） */
  _refreshMonthlyStatsText: function (lang) {
    const l = lang || this._lang;
    this.setData({
      't.monthlyStatsText': i18n.tf(NS + 'monthlyStats', {
        hours: this._monthlyHours || '0.0',
        days: this._monthlyDays || '0',
      }, l),
    });
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
      // 记住收藏快照：切语言时要用它重建菜单（否则会退回默认应用）
      that._lastFavorites = favorites;
      that.setData({ menuRows: that._buildMenuGroups(favorites, menuFlags) });
    }).catch(function () {
      let favorites = [];
      try { favorites = wx.getStorageSync('favoriteApps') || []; } catch (e) { /* ignore */ }
      that._lastFavorites = favorites;
      that.setData({ menuRows: that._buildMenuGroups(favorites, {}) });
    });
  },

  /**
   * 构建"按分类分组"的收藏应用列表。
   * - 仅显示用户收藏的应用，但按 ALL_APPS 的7大分类分组归类
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

    // 把一维收藏列表按 ALL_APPS 的7大分类归组
    const itemMap = {};
    items.forEach(function (it) { itemMap[it.id] = it; });

    const lang = this._lang;
    const groups = ALL_APPS.map(function (group) {
      return {
        groupKey: group.groupKey,
        // 名称在这里按当前语言生成（收藏里存的 name 是存进去那一刻的语言）
        items: group.items
          .filter(function (a) { return itemMap[a.id]; })
          .map(function (a) { return localizeApp(itemMap[a.id], lang); }),
      };
    }).filter(function (g) { return g.items.length > 0; });

    // 收藏里可能有 ALL_APPS 之外的 id（后端新下发的应用/历史遗留），不能静默丢掉，
    // 否则用户会发现"我收藏的应用不见了"——归入末尾的「管理」分组展示
    const KNOWN_IDS = {};
    ALL_APPS.forEach(function (g) { g.items.forEach(function (a) { KNOWN_IDS[a.id] = true; }); });
    const leftovers = items.filter(function (it) { return !KNOWN_IDS[it.id]; });

    // 末尾固定追加"管理"分组（更多应用入口，用于进入 more-apps 编辑收藏）
    groups.push({
      groupKey: 'groupManage',
      items: leftovers.map(function (l) { return localizeApp(l, lang); })
        .concat([localizeApp(MORE_APPS_ENTRY, lang)]),
    });

    // 分组标题与「N个」计数同样是文案，一并本地化
    groups.forEach(function (g) {
      g.group = i18n.t(NS + g.groupKey, lang);
      g._countText = i18n.tf(NS + 'appCount', { count: g.items.length }, lang);
    });

    // D-204v2：≤2个应用的小类目两两配对一行显示，大类目独占一行
    // 🔴 wx:key 用 groupKey（稳定），不用本地化后的 group（会随语言变）
    const menuRows = [];
    let pendingSmall = null;
    groups.forEach(function (g) {
      const isSmall = g.items.length <= 2;
      if (!isSmall) {
        if (pendingSmall) {
          menuRows.push({ key: pendingSmall.groupKey, layout: 'pair', groups: [pendingSmall] });
          pendingSmall = null;
        }
        menuRows.push({ key: g.groupKey, layout: 'full', groups: [g] });
      } else if (pendingSmall) {
        menuRows.push({ key: pendingSmall.groupKey + '_' + g.groupKey, layout: 'pair', groups: [pendingSmall, g] });
        pendingSmall = null;
      } else {
        pendingSmall = g;
      }
    });
    if (pendingSmall) {
      menuRows.push({ key: pendingSmall.groupKey + '_tail', layout: 'pair', groups: [pendingSmall] });
    }

    return menuRows;
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
      that._lastFavorites = favorites;
      that.setData({ menuRows: that._buildMenuGroups(favorites, that._lastMenuFlags || {}) });
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
    const name = info.realName || info.name || info.nickName || info.nickname
      || i18n.t(NS + 'defaultUserName', this._lang);
    const orgName = info.factoryName || info.tenantName || '';
    const rawAvatar = info.avatarUrl || info.avatar || info.headUrl || '';
    const avatarImgUrl = rawAvatar ? getAuthedImageUrl(rawAvatar) : '';
    const patch = {};
    if (name !== this.data.userName) patch.userName = name;
    if (orgName !== this.data.orgName) patch.orgName = orgName;
    if (avatarImgUrl !== this.data.avatarImgUrl) patch.avatarImgUrl = avatarImgUrl;
    if (Object.keys(patch).length) this.setData(patch);
    // 用户名进到「问候语，用户名」整句里，名字变了要重算
    if (patch.userName) this._refreshGreetingText();

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
        let remoteAvatar = remoteAvatarImgUrl;
        if (remoteAvatar) {
          // D-212：PC 端换头像后文件路径可能相同，加时间戳破 <image> 缓存，保证与 PC 同步
          const sep2 = remoteAvatar.indexOf('?') !== -1 ? '&' : '?';
          remoteAvatar = remoteAvatar + sep2 + 't=' + Date.now();
        }
        const remotePatch = {};
        if (remoteName && remoteName !== that.data.userName) remotePatch.userName = remoteName;
        if (remoteOrgName && remoteOrgName !== that.data.orgName) remotePatch.orgName = remoteOrgName;
        if (remoteAvatar && remoteAvatar !== that.data.avatarImgUrl) remotePatch.avatarImgUrl = remoteAvatar;
        if (Object.keys(remotePatch).length) that.setData(remotePatch);
        if (remotePatch.userName) that._refreshGreetingText();
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
    this.setData({ dateInfo: this._buildDateInfo(this._lang) });
  },

  /**
   * 日期卡片：年月日 / 星期 / 季节 / 今日小贴士。
   * ⚠️ 中英文的日期与星期结构完全不同（2026年9月25日 vs 9/25/2026、星期五 vs Friday），
   *    所以星期与日期都走各自语言的模板，不能拼字符串。
   */
  _buildDateInfo: function (lang) {
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const tipKey = DAILY_TIP_KEYS[dayOfYear % DAILY_TIP_KEYS.length];
    return {
      date: i18n.tf(NS + 'dateFormat', { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }, lang),
      day: i18n.t(NS + WEEKDAY_KEYS[now.getDay()], lang),
      season: i18n.t(NS + SEASON_KEYS[this._computeSeasonBySolarTerms(now)], lang),
      dailyTip: i18n.t(NS + tipKey, lang),
    };
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
    // 返回的是**季节枚举**（给 SEASON_KEYS 用），不是文案
    if (now < liChun) return 'winter';
    if (now < liXia) return 'spring';
    if (now < liQiu) return 'summer';
    if (now < liDong) return 'autumn';
    return 'winter';
  },

  // ========== 考勤打卡 ==========

  _loadAttendance: function () {
    const self = this;
    // 返回 Promise：调用方（含测试）需要等状态真正落进 data 再读
    return Promise.allSettled([
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
    let state = 'notClocked';
    let statusClass = 'attendance-status--idle';
    if (hasClockedIn && !hasClockedOut) {
      state = 'working';
      statusClass = 'attendance-status--working';
    } else if (hasClockedIn && hasClockedOut) {
      state = 'clockedOut';
      statusClass = 'attendance-status--done';
    } else if (!hasClockedIn) {
      state = 'notClocked';
      statusClass = 'attendance-status--idle';
    }
    // 记住状态枚举（不是文案）—— 切语言时用它重新取文案
    this._attendanceState = state;
    this.setData({
      attendanceStatusText: i18n.t(NS + ATTENDANCE_KEYS[state], this._lang),
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
    this._monthlyHours = hours.toFixed(1);
    this._monthlyDays = String(days);
    this.setData({
      monthlyHoursText: this._monthlyHours,
      monthlyDaysText: this._monthlyDays,
    });
    this._refreshMonthlyStatsText(this._lang);
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
    const lang = this._lang;
    wx.showLoading({ title: i18n.t(NS + 'clocking', lang), mask: true });
    api.attendance.clockIn().then(function (res) {
      wx.hideLoading();
      wx.showToast({ title: (res && res.message) || i18n.t(NS + 'clockInSuccess', lang), icon: 'success' });
      self._applyAttendanceStatus(res);
      return api.attendance.monthlyStats();
    }).then(function (stats) {
      self._applyMonthlyStats(stats);
    }).catch(function (e) {
      wx.hideLoading();
      const msg = (e && e.errMsg) || i18n.t(NS + 'clockInFailed', lang);
      wx.showToast({ title: msg, icon: 'none' });
    });
  },

  onClockOut: function () {
    const self = this;
    const lang = this._lang;
    wx.showLoading({ title: i18n.t(NS + 'clocking', lang), mask: true });
    api.attendance.clockOut().then(function (res) {
      wx.hideLoading();
      wx.showToast({ title: (res && res.message) || i18n.t(NS + 'clockOutSuccess', lang), icon: 'success' });
      self._applyAttendanceStatus(res);
      return api.attendance.monthlyStats();
    }).then(function (stats) {
      self._applyMonthlyStats(stats);
    }).catch(function (e) {
      wx.hideLoading();
      const msg = (e && e.errMsg) || i18n.t(NS + 'clockOutFailed', lang);
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
    // ⚠️ '质检' 是**工序名**（后端业务数据，与「默认仓」同类），扫码页拿它去匹配数据库里的工序，
    //    改成英文会匹配不上 → 这里必须保持原值，不能 i18n。
    if (id === 'quality') {
      wx.setStorageSync('scan_pref_process', '质检');
    }
    safeNavigate({ url: route }, isTabPage ? 'switchTab' : undefined).catch(() => {});
  },
});
