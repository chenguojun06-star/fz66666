const { safeNavigate, toast } = require('../../utils/uiHelper');
const api = require('../../utils/api');

// 所有应用配置
const ALL_APPS = [
  { group: '📝 开发下单', items: [
    { id: 'orderCreate', name: '下单管理', iconClass: 'icon-menu-order', circleClass: 'menu-icon-circle--blue', route: '/pages/order/create/index' },
    { id: 'smartOps', name: '运营看板', iconClass: 'icon-menu-stats', circleClass: 'menu-icon-circle--purple', route: '/pages/smart-ops/index' },
  ]},
  { group: '🏭 生产模块', items: [
    { id: 'dashboard', name: '生产管理', iconClass: 'icon-menu-progress', circleClass: 'menu-icon-circle--teal', route: '/pages/dashboard/index' },
    { id: 'processEdit', name: '生产进度', iconClass: 'icon-menu-production', circleClass: 'menu-icon-circle--blue', route: '/pages/dashboard/process-edit/index' },
    { id: 'sampleDev', name: '样衣开发', iconClass: 'icon-menu-garment', circleClass: 'menu-icon-circle--teal', route: '/pages/sample-development/index/index' },
    { id: 'cuttingTask', name: '裁剪任务', iconClass: 'icon-menu-cutting', circleClass: 'menu-icon-circle--rose', route: '/pages/cutting/task-list/index' },
    { id: 'cuttingDetail', name: '裁剪明细', iconClass: 'icon-menu-cutting', circleClass: 'menu-icon-circle--rose', route: '/pages/cutting/bundle-detail/index' },
    { id: 'procurement', name: '采购任务', iconClass: 'icon-menu-cart', circleClass: 'menu-icon-circle--orange', route: '/pages/procurement/task-list/index' },
    { id: 'factoryShipment', name: '外发工厂', iconClass: 'icon-menu-shipment', circleClass: 'menu-icon-circle--cyan', route: '/pages/factory/shipment/index' },
    { id: 'bundleSplit', name: '菲号单价', iconClass: 'icon-menu-price', circleClass: 'menu-icon-circle--orange', route: '/pages/work/bundle-split/index' },
  ]},
  { group: '📷 扫码管理', items: [
    { id: 'scan', name: '生产扫码', iconClass: 'icon-menu-scan', circleClass: 'menu-icon-circle--green', route: '/pages/scan/index' },
    { id: 'history', name: '扫码历史', iconClass: 'icon-menu-history', circleClass: 'menu-icon-circle--indigo', route: '/pages/scan/history/index' },
    { id: 'patternScan', name: '样衣扫码', iconClass: 'icon-menu-garment', circleClass: 'menu-icon-circle--teal', route: '/pages/scan/pattern/index' },
    { id: 'scanQuality', name: '质检扫码', iconClass: 'icon-menu-quality-scan', circleClass: 'menu-icon-circle--amber', route: '/pages/scan/quality/index' },
  ]},
  { group: '🔍 质检管理', items: [
    { id: 'production', name: '质检通知', iconClass: 'icon-menu-quality-notice', circleClass: 'menu-icon-circle--amber', route: '/pages/defect/index' },
    { id: 'qualityDetail', name: '质检明细', iconClass: 'icon-menu-quality-detail', circleClass: 'menu-icon-circle--green', route: '/pages/quality-detail/index' },
  ]},
  { group: '📦 库存管理', items: [
    { id: 'materialScan', name: '物料扫码', iconClass: 'icon-menu-warehouse', circleClass: 'menu-icon-circle--cyan', route: '/pages/warehouse/material/scan/index' },
    { id: 'sampleStock', name: '样衣仓库', iconClass: 'icon-menu-garment', circleClass: 'menu-icon-circle--indigo', route: '/pages/warehouse/sample/scan-action/index' },
  ]},
  { group: '💰 财务管理', items: [
    { id: 'wagePayment', name: '工资发放', iconClass: 'icon-menu-wage', circleClass: 'menu-icon-circle--orange', route: '/pages/finance/payment/index' },
    { id: 'payroll', name: '工资单', iconClass: 'icon-menu-wage', circleClass: 'menu-icon-circle--teal', route: '/pages/payroll/payroll' },
    { id: 'payrollFeedback', name: '工资反馈', iconClass: 'icon-menu-payroll-feedback', circleClass: 'menu-icon-circle--blue', route: '/pages/payroll/feedback/index' },
    { id: 'advance', name: '预付款', iconClass: 'icon-menu-advance', circleClass: 'menu-icon-circle--green', route: '/pages/advance/list/index' },
  ]},
  { group: '👥 人员管理', items: [
    { id: 'userApproval', name: '用户审批', iconClass: 'icon-menu-user', circleClass: 'menu-icon-circle--purple', route: '/pages/admin/user-approval/index' },
    { id: 'invite', name: '邀请成员', iconClass: 'icon-menu-invite', circleClass: 'menu-icon-circle--rose', route: '/pages/admin/misc/invite/index' },
    { id: 'feedback', name: '意见反馈', iconClass: 'icon-menu-feedback', circleClass: 'menu-icon-circle--amber', route: '/pages/admin/misc/feedback/index' },
  ]},
  { group: '⚙️ 系统设置', items: [
    { id: 'changePassword', name: '修改密码', iconClass: 'icon-menu-password', circleClass: 'menu-icon-circle--indigo', route: '/pages/admin/misc/change-password/index' },
  ]},
];

Page({
  data: {
    searchKeyword: '',
    allApps: ALL_APPS,
    filteredApps: ALL_APPS,
    favoriteApps: [],
    editing: false,
  },

  onLoad: function () {
    this.loadFavorites();
  },

  onShow: function () {
    this.loadFavorites();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  loadFavorites: function () {
    const that = this;
    // 优先从服务端加载，失败则用本地缓存
    api.system.getFavoriteApps().then(function (res) {
      let favorites = [];
      try {
        // request.js resolve(body)，body = { code: 200, data: { favoriteData: "..." } }
        const raw = res && res.data && res.data.favoriteData ? res.data.favoriteData : (res && res.favoriteData ? res.favoriteData : (typeof res === 'string' ? res : '[]'));
        favorites = JSON.parse(raw);
        if (!Array.isArray(favorites)) favorites = [];
      } catch (e) {
        favorites = [];
      }
      // 同步到本地缓存
      try { wx.setStorageSync('favoriteApps', favorites); } catch (e) { /* ignore */ }
      that.setData({ favoriteApps: favorites });
      that.filterApps(that.data.searchKeyword, favorites);
    }).catch(function () {
      // 网络失败时用本地缓存
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

    const filtered = ALL_APPS.map(function (group) {
      return {
        group: group.group,
        items: group.items
          .filter(function (item) {
            return item.name.toLowerCase().indexOf(k) !== -1;
          })
          .map(function (item) {
            return {
              ...item,
              isFav: favIds.has(item.id)
            };
          }),
      };
    }).filter(function (g) { return g.items.length > 0; });
    this.setData({ filteredApps: filtered });
  },

  onAppTap: function (e) {
    const app = e.currentTarget.dataset.app;
    if (!app) return;
    safeNavigate({ url: app.route });
  },

  onEditToggle: function () {
    this.setData({ editing: !this.data.editing });
  },

  onToggleFavorite: function (e) {
    const app = e.currentTarget.dataset.app;
    if (!app) return;

    const favorites = this.data.favoriteApps.slice();
    const existingIndex = favorites.findIndex(function (f) { return f.id === app.id; });

    if (existingIndex >= 0) {
      favorites.splice(existingIndex, 1);
    } else {
      favorites.push({ id: app.id, name: app.name, iconClass: app.iconClass, circleClass: app.circleClass, route: app.route, badge: app.badge });
    }

    // 先更新UI和本地缓存
    try {
      wx.setStorageSync('favoriteApps', favorites);
    } catch (e) { /* ignore */ }
    this.setData({ favoriteApps: favorites });
    this.filterApps(this.data.searchKeyword, favorites);

    // 异步同步到服务端
    this._syncToServer(favorites);
  },

  isFavorite: function (id) {
    return this.data.favoriteApps.some(function (f) { return f.id === id; });
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
