const { safeNavigate } = require('../../utils/uiHelper');
const { isFactoryOwner } = require('../../utils/storage');
const api = require('../../utils/api');

// 所有应用配置 — 全部 21 个应用（与 home/index.js 完全一致）
const ALL_APPS = [
  { group: '生产管理', items: [
    { id: 'dashboard', name: '生产管理', iconClass: 'icon-app-dashboard', circleClass: 'menu-icon-circle--blue', route: '/pages/dashboard/index' },
    { id: 'scan', name: '扫码工序', iconClass: 'icon-app-scan', circleClass: 'menu-icon-circle--green', route: '/pages/scan/index' },
    { id: 'production', name: '质检管理', iconClass: 'icon-app-quality', circleClass: 'menu-icon-circle--red', route: '/pages/defect/index' },
    { id: 'processTemplate', name: '工序模板', iconClass: 'icon-app-folder', circleClass: 'menu-icon-circle--lightblue', route: '/pages/dashboard/process-template/index' },
    { id: 'sampleDev', name: '样衣开发', iconClass: 'icon-app-sample', circleClass: 'menu-icon-circle--magenta', route: '/pages/sample-development/index/index' },
    { id: 'cuttingDetail', name: '裁剪任务', iconClass: 'icon-menu-cutting-task', circleClass: 'menu-icon-circle--purple', route: '/pages/cutting/bundle-detail/index' },
    { id: 'bundleSplit', name: '菲号单价', iconClass: 'icon-app-scan', circleClass: 'menu-icon-circle--green', route: '/pages/work/bundle-split/index' },
  ]},
  { group: '供应链', items: [
    { id: 'procurement', name: '采购任务', iconClass: 'icon-app-procurement', circleClass: 'menu-icon-circle--blue', route: '/pages/procurement/task-list/index' },
    { id: 'materialScan', name: '物料入库', iconClass: 'icon-app-warehouse', circleClass: 'menu-icon-circle--lightblue', route: '/pages/warehouse/material/scan/index' },
    { id: 'locationScan', name: '库位扫码', iconClass: 'icon-app-location', circleClass: 'menu-icon-circle--green', route: '/pages/warehouse/location-scan/index' },
    { id: 'factoryShipment', name: '外发工厂', iconClass: 'icon-app-send', circleClass: 'menu-icon-circle--indigo', route: '/pages/factory/shipment/index' },
  ]},
  { group: '财务销售', items: [
    { id: 'wagePayment', name: '工资查询', iconClass: 'icon-app-wage', circleClass: 'menu-icon-circle--purple', route: '/pages/payroll/payroll' },
    { id: 'payroll', name: '财务付款', iconClass: 'icon-app-check-circle', circleClass: 'menu-icon-circle--green', route: '/pages/finance/payment/index' },
    { id: 'advance', name: '预付款', iconClass: 'icon-app-scan', circleClass: 'menu-icon-circle--magenta', route: '/pages/advance/list/index' },
    { id: 'salesData', name: '销售概览', iconClass: 'icon-app-shield', circleClass: 'menu-icon-circle--blue', route: '/pages/sales/overview/index' },
    { id: 'orderCreate', name: '下单管理', iconClass: 'icon-menu-order', circleClass: 'menu-icon-circle--indigo', route: '/pages/order/create/index' },
    { id: 'platformOrder', name: '平台订单', iconClass: 'icon-menu-order', circleClass: 'menu-icon-circle--purple', route: '/pages/sales/order-list/index' },
  ]},
  { group: '其他', items: [
    { id: 'smartOps', name: '智能运营', iconClass: 'icon-app-help', circleClass: 'menu-icon-circle--purple', route: '/pages/smart-ops/index' },
    { id: 'returnManage', name: '退货管理', iconClass: 'icon-app-arrow-left', circleClass: 'menu-icon-circle--red', route: '/pages/return/list/index' },
    { id: 'userApproval', name: '用户审批', iconClass: 'icon-app-user', circleClass: 'menu-icon-circle--gray', route: '/pages/admin/user-approval/index' },
    { id: 'feedback', name: '意见反馈', iconClass: 'icon-app-message', circleClass: 'menu-icon-circle--magenta', route: '/pages/admin/misc/feedback/index' },
    { id: 'history', name: '扫码历史', iconClass: 'icon-menu-history', circleClass: 'menu-icon-circle--indigo', route: '/pages/scan/history/index' },
  ]},
];

// 外发工厂不可见的应用分组
const FACTORY_HIDDEN_GROUPS = ['财务销售'];

// 根据 id 从 ALL_APPS 查找完整应用对象
function findAppById(id) {
  for (var i = 0; i < ALL_APPS.length; i++) {
    var items = ALL_APPS[i].items;
    for (var j = 0; j < items.length; j++) {
      if (items[j].id === id) return items[j];
    }
  }
  return null;
}

// 从任意格式的收藏项提取 ID（兼容 string / object）
function extractId(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object' && entry.id) return entry.id;
  return null;
}

// 将收藏数组统一转换为 ID 字符串数组（用于存储和同步）
function toIdArray(favorites) {
  if (!Array.isArray(favorites)) return [];
  return favorites.map(extractId).filter(function (id) { return !!id; });
}

// 将收藏 ID 数组映射为完整应用对象（用于渲染）
function enrichFavorites(favorites) {
  if (!Array.isArray(favorites)) return [];
  var result = [];
  for (var i = 0; i < favorites.length; i++) {
    var id = extractId(favorites[i]);
    if (!id) continue;
    var app = findAppById(id);
    if (app) result.push(app);
  }
  return result;
}

// 根据角色过滤应用列表
function filterAppsByRole(apps) {
  const isFactory = isFactoryOwner();
  if (!isFactory) return apps;
  return apps.filter(g => !FACTORY_HIDDEN_GROUPS.includes(g.group));
}

Page({
  data: {
    searchKeyword: '',
    allApps: ALL_APPS,
    filteredApps: ALL_APPS,
    favoriteApps: [],
    editing: false,
  },

  onLoad: function () {
    const visibleApps = filterAppsByRole(ALL_APPS);
    this.setData({ allApps: visibleApps, filteredApps: visibleApps });
    this.loadFavorites();
  },

  onShow: function () {
    const visibleApps = filterAppsByRole(ALL_APPS);
    this.setData({ allApps: visibleApps });
    this.loadFavorites();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  loadFavorites: function () {
    const that = this;
    const isFactory = isFactoryOwner();
    // 先读本地缓存快速渲染
    let localFavorites = [];
    try { localFavorites = wx.getStorageSync('favoriteApps') || []; } catch (e) { /* ignore */ }
    // 统一提取 ID，外发工厂过滤掉销售类应用
    var localIds = toIdArray(localFavorites);
    if (isFactory) {
      localIds = localIds.filter(function (id) { return id !== 'salesData' && id !== 'platformOrder'; });
    }
    if (localIds.length > 0) {
      var enriched = enrichFavorites(localIds);
      that.setData({ favoriteApps: enriched });
      that.filterApps(that.data.searchKeyword, enriched);
    }
    // 再从服务端加载最新数据
    api.system.getFavoriteApps().then(function (data) {
      let favorites = [];
      try {
        const raw = data && data.favoriteData ? data.favoriteData : (typeof data === 'string' ? data : '[]');
        favorites = JSON.parse(raw);
        if (!Array.isArray(favorites)) favorites = [];
      } catch (e) {
        favorites = [];
      }
      // 统一提取 ID
      var favIds = toIdArray(favorites);
      // 外发工厂过滤掉销售类应用
      if (isFactory) {
        favIds = favIds.filter(function (id) { return id !== 'salesData' && id !== 'platformOrder'; });
      }
      // 服务器返回空但本地有数据：保留本地
      if (favIds.length === 0 && localIds.length > 0) {
        favIds = localIds;
      }
      // 存储统一用 ID 数组（与 home/index.js 一致）
      try { wx.setStorageSync('favoriteApps', favIds); } catch (e) { /* ignore */ }
      var enriched = enrichFavorites(favIds);
      that.setData({ favoriteApps: enriched });
      that.filterApps(that.data.searchKeyword, enriched);
    }).catch(function () {
      // 网络失败时用本地缓存，已在上面 setData 过
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
    // 统一提取 ID 用于判断是否已收藏
    const favIds = new Set(toIdArray(favs));

    const filtered = ALL_APPS.map(function (group) {
      return {
        group: group.group,
        items: group.items
          .filter(function (item) {
            return item.name.toLowerCase().indexOf(k) !== -1;
          })
          .map(function (item) {
            return Object.assign({}, item, { isFav: favIds.has(item.id) });
          }),
      };
    }).filter(function (g) { return g.items.length > 0; });
    this.setData({ filteredApps: filtered });
  },

  onAppTap: function (e) {
    var ds = e.currentTarget.dataset || {};
    var route = String(ds.route || '').trim();
    if (!route) {
      console.warn('[more-apps] onAppTap 缺少 route', ds);
      return;
    }
    safeNavigate({ url: route });
  },

  onEditToggle: function () {
    this.setData({ editing: !this.data.editing });
  },

  onToggleFavorite: function (e) {
    var ds = e.currentTarget.dataset || {};
    var appId = String(ds.id || '').trim();
    if (!appId) return;
    var app = findAppById(appId);
    if (!app) return;

    // 从当前收藏中提取 ID 数组
    var currentIds = toIdArray(this.data.favoriteApps);
    var existingIndex = currentIds.indexOf(appId);

    if (existingIndex >= 0) {
      currentIds.splice(existingIndex, 1);
    } else {
      currentIds.push(appId);
    }

    // 存储用 ID 数组（与 home/index.js 一致）
    try {
      wx.setStorageSync('favoriteApps', currentIds);
    } catch (e) { /* ignore */ }

    // 渲染用完整对象
    var enriched = enrichFavorites(currentIds);
    this.setData({ favoriteApps: enriched });
    this.filterApps(this.data.searchKeyword, enriched);

    // 同步到服务端用 ID 数组
    this._syncToServer(currentIds);
  },

  isFavorite: function (id) {
    return toIdArray(this.data.favoriteApps).indexOf(id) !== -1;
  },

  onClearFavorites: function () {
    const that = this;
    wx.showModal({
      title: '确认清空',
      content: '确定要清空收藏吗？',
      success: function (res) {
        if (res.confirm) {
          try { wx.setStorageSync('favoriteApps', []); } catch (e) { /* ignore */ }
          that.setData({ favoriteApps: [], editing: false });
          that.filterApps(that.data.searchKeyword, []);
          that._syncToServer([]);
        }
      },
    });
  },

  _syncToServer: function (favIds) {
    try {
      api.system.saveFavoriteApps(JSON.stringify(favIds)).catch(function (e) {
        console.warn('[more-apps] sync favorites to server failed:', e.message || e);
      });
    } catch (e) { /* ignore */ }
  },
});
