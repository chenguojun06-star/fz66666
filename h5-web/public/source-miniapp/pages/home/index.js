const api = require('../../utils/api');
const { safeNavigate } = require('../../utils/uiHelper');
const { isTokenExpired, isFactoryOwner, getUserInfo } = require('../../utils/storage');
const { eventBus, Events } = require('../../utils/eventBus');
const permission = require('../../utils/permission');

function _hasFn(fn) { return typeof fn === 'function'; }

const DAILY_FLOWERS = [
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

const MENU_KEY_MAP = {
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
  salesData: 'miniprogram.menu.salesData',
  platformOrder: 'miniprogram.menu.platformOrder',
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return '上午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function buildMenuItems(menuVisibility) {
  const visibility = menuVisibility || {};
  const items = [];

  const isFactory = isFactoryOwner();

  // 运营看板：外发工厂不开放
  if (!isFactory && visibility.smartOps !== false) {
    items.push({ id: 'smartOps', name: '运营看板', iconClass: 'icon-menu-ai', circleClass: 'menu-icon-circle--purple', route: '/pages/smart-ops/index' });
  }
  // 下单管理：外发工厂不开放
  if (!isFactory && visibility.orderCreate !== false) {
    items.push({ id: 'orderCreate', name: '下单管理', iconClass: 'icon-menu-order', circleClass: 'menu-icon-circle--blue', route: '/pages/order/create/index' });
  }
  // 生产管理：外发工厂不开放（改为从外部工厂页面看自己的订单）
  if (!isFactory && visibility.dashboard !== false) {
    items.push({ id: 'dashboard', name: '生产管理', iconClass: 'icon-menu-production', circleClass: 'menu-icon-circle--teal', route: '/pages/dashboard/index' });
  }
  // 质检通知：外发工厂不开放
  if (!isFactory && visibility.production !== false) {
    items.push({ id: 'production', name: '质检通知', iconClass: 'icon-menu-quality-notice', circleClass: 'menu-icon-circle--amber', route: '/pages/defect/index' });
  }
  // 生产扫码：所有用户均可
  if (visibility.quality !== false) {
    items.push({ id: 'quality', name: '生产扫码', iconClass: 'icon-menu-scan', circleClass: 'menu-icon-circle--green', route: '/pages/scan/index' });
  }
  // 菲号单价：外发工厂不开放
  if (!isFactory && visibility.bundleSplit !== false) {
    items.push({ id: 'bundleSplit', name: '菲号单价', iconClass: 'icon-menu-price', circleClass: 'menu-icon-circle--orange', route: '/pages/work/bundle-split/index' });
  }
  // 裁剪明细：外发工厂不开放
  if (!isFactory && visibility.cuttingDetail !== false) {
    items.push({ id: 'cuttingDetail', name: '裁剪明细', iconClass: 'icon-menu-cutting', circleClass: 'menu-icon-circle--rose', route: '/pages/cutting/bundle-detail/index' });
  }
  // 扫码历史：所有用户均可，但外发工厂只看到自己工厂的记录
  if (visibility.history !== false) {
    items.push({ id: 'history', name: '扫码历史', iconClass: 'icon-menu-history', circleClass: 'menu-icon-circle--indigo', route: '/pages/scan/history/index' });
  }
  // 外发工厂：仅外发工厂账号可见
  if (visibility.factoryShipment !== false) {
    // 外发工厂账号 -> 显示为首页看板
    if (isFactory) {
      items.push({ id: 'factoryShipment', name: '工厂看板', iconClass: 'icon-menu-shipment', circleClass: 'menu-icon-circle--cyan', route: '/pages/factory/shipment/index' });
    } else if (visibility.dashboard === false) {
      // 仅当生产管理不可见时才显示
      items.push({ id: 'factoryShipment', name: '外发工厂', iconClass: 'icon-menu-shipment', circleClass: 'menu-icon-circle--cyan', route: '/pages/factory/shipment/index' });
    }
  }
  // 销售数据：外发工厂不开放
  if (!isFactory && visibility.salesData !== false) {
    items.push({ id: 'salesData', name: '销售数据', iconClass: 'icon-menu-ai', circleClass: 'menu-icon-circle--rose', route: '/pages/sales/overview/index' });
  }
  // 平台订单：外发工厂不开放
  if (!isFactory && visibility.platformOrder !== false) {
    items.push({ id: 'platformOrder', name: '平台订单', iconClass: 'icon-menu-order', circleClass: 'menu-icon-circle--blue', route: '/pages/sales/order-list/index' });
  }

  return items;
}

Page({
  data: {
    greeting: '',
    userName: '',
    orgName: '',
    menuItems: [],
    favoriteApps: [],
    unreadNoticeCount: 0,
    dateInfo: { date: '', day: '', season: '', dailyTip: '' },
    draggingIndex: -1,  // 正在拖拽的图标索引
    myTodos: [],        // 我的待办：按职务聚合的采购/裁剪任务
  },

  _menuVisibility: null,

  onLoad: function () {
    this.loadFavorites();
    this.setData({
      greeting: getGreeting(),
      menuItems: buildMenuItems(null),
    });
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._loadUserName();
    this._computeDateInfo();
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
    this._bindWsEvents();
    this._loadMenuVisibility();
    this._loadMyTodos();
    this.loadFavorites();
    // 暂时禁用购物车加载，避免 API 404 导致的问题
    // this._loadCartCount();
  },

  loadFavorites: function () {
    const that = this;
    const isFactory = isFactoryOwner();
    // 先读本地缓存快速渲染，避免服务器异常时空数据覆盖
    let localFavorites = [];
    try { localFavorites = wx.getStorageSync('favoriteApps') || []; } catch (e) { /* ignore */ }
    // 外发工厂过滤掉销售类应用（防止从其他端已收藏绕过权限）
    if (isFactory) {
      localFavorites = localFavorites.filter(id => id !== 'salesData' && id !== 'platformOrder');
    }
    if (localFavorites.length > 0) {
      that.setData({ favoriteApps: localFavorites });
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
      // 外发工厂过滤掉销售类应用
      if (isFactory) {
        favorites = favorites.filter(id => id !== 'salesData' && id !== 'platformOrder');
      }
      // 服务器返回空但本地有数据：保留本地（异步同步可能未完成）
      if (favorites.length === 0 && localFavorites.length > 0) {
        favorites = localFavorites;
      }
      // 同步到本地缓存
      try { wx.setStorageSync('favoriteApps', favorites); } catch (e) { /* ignore */ }
      that.setData({ favoriteApps: favorites });
    }).catch(function () {
      // 网络失败时用本地缓存，已在上面 setData 过
    });
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
    const that = this;
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

  // 按职务聚合"我的待办"：采购员看采购、裁剪员看裁剪、主管以上看全部
  _loadMyTodos: function () {
    const that = this;
    const role = permission.getCurrentRole();
    const isManager = permission.isAdminOrSupervisor();
    const todos = [];
    // 决定加载哪些待办
    const wantProcurement = isManager || role === permission.ROLES.PURCHASER;
    const wantCutting = isManager || role === permission.ROLES.CUTTER;
    if (!wantProcurement && !wantCutting) {
      this.setData({ myTodos: [], aiTodoSummary: { myTasks: 0, procurement: 0, cutting: 0 } });
      return;
    }
    const tasks = [];
    let total = 0, procurement = 0, cutting = 0;
    if (wantProcurement) tasks.push(
      api.production.myProcurementTasks().then(function (res) {
        const list = Array.isArray(res) ? res : (res && res.list) || [];
        const pending = list.filter(function (it) {
          const s = String((it && it.status) || '').toLowerCase();
          return !s || s === 'pending';
        });
        if (pending.length > 0) {
          todos.push({
            key: 'procurement',
            icon: '🛒',
            title: '待领取采购',
            count: pending.length,
            url: '/pages/procurement/task-list/index',
          });
          procurement += pending.length;
          total += pending.length;
        }
      }).catch(function () {})
    );
    if (wantCutting) tasks.push(
      api.production.myCuttingTasks().then(function (res) {
        const list = Array.isArray(res) ? res : (res && res.list) || [];
        const pending = list.filter(function (it) {
          const s = String((it && it.status) || '').toLowerCase();
          return !s || s === 'pending';
        });
        if (pending.length > 0) {
          todos.push({
            key: 'cutting',
            icon: '✂️',
            title: '待领取裁剪',
            count: pending.length,
            url: '/pages/cutting/task-list/index',
          });
          cutting += pending.length;
          total += pending.length;
        }
      }).catch(function () {})
    );
    Promise.all(tasks).then(function () {
      that.setData({
        myTodos: todos,
        aiTodoSummary: { myTasks: total, procurement: procurement, cutting: cutting },
      });
    });
  },

  _loadMenuVisibility: function () {
    const self = this;
    api.system.getMiniprogramMenuConfig().then(function (resp) {
      return resp;
    }).catch(function () {
      return null;
    }).then(function (resp) {
      const flags = (resp && resp.data) || resp || {};
      const visibility = {};
      Object.keys(MENU_KEY_MAP).forEach(function (shortKey) {
        const fullKey = MENU_KEY_MAP[shortKey];
        if (typeof flags[fullKey] === 'boolean') {
          visibility[shortKey] = flags[fullKey];
        }
      });
      self._menuVisibility = visibility;
      self.setData({ menuItems: buildMenuItems(visibility) });
    });
  },

  _loadUserName: function (forceRemote) {
    const app = getApp();
    const globalInfo = (app && app.globalData && app.globalData.userInfo) || {};
    const cacheInfo = wx.getStorageSync('user_info') || wx.getStorageSync('userInfo') || {};
    const info = Object.assign({}, cacheInfo, globalInfo);
    const name = info.realName || info.name || info.nickName || info.nickname || '用户';
    const orgName = info.factoryName || info.tenantName || '';
    const patch = {};
    if (name !== this.data.userName) patch.userName = name;
    if (orgName !== this.data.orgName) patch.orgName = orgName;
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
        const remotePatch = {};
        if (remoteName && remoteName !== that.data.userName) remotePatch.userName = remoteName;
        if (remoteOrgName && remoteOrgName !== that.data.orgName) remotePatch.orgName = remoteOrgName;
        if (Object.keys(remotePatch).length) that.setData(remotePatch);
      })
      .catch(function (e) { console.warn('[home] _loadUserName失败:', e.message || e); });
  },

  _loadUnreadCount: function () {
    const self = this;
    return api.notice.unreadCount()
      .then(function (res) {
        const count = Number(res) || 0;
        self.setData({ unreadNoticeCount: count });
      })
      .catch(function (e) { console.warn('[home] _loadUnreadCount失败:', e.message || e); });
  },

  _computeDateInfo: function () {
    const now = new Date();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const weekDay = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];

    const season = this._computeSeasonBySolarTerms(now);
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const dailyTip = DAILY_FLOWERS[dayOfYear % DAILY_FLOWERS.length];

    this.setData({
      dateInfo: {
        date: m + '月' + d + '日', day: '星期' + weekDay,
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
    safeNavigate({ url: item.route }, isTabPage ? 'switchTab' : undefined);
  },

  _favoriteNavLock: false,

  onFavoriteTap: function (e) {
    // 拖动中不响应点击
    if (this.data.draggingIndex !== -1) return;
    // 防重复点击（200ms 内忽略）
    if (this._favoriteNavLock) return;
    this._favoriteNavLock = true;
    const that = this;
    setTimeout(function () { that._favoriteNavLock = false; }, 200);

    const app = e.currentTarget.dataset.app;
    if (!app || !app.route) return;
    safeNavigate({ url: app.route });
  },

  onMoreAppsTap: function () {
    safeNavigate({ url: '/pages/more-apps/index' });
  },

  // 触摸开始
  onTouchStart: function (e) {
    const index = e.currentTarget.dataset.index;
    this._touchStartTime = Date.now();
    this._touchStartX = e.touches[0].pageX;
    this._touchStartY = e.touches[0].pageY;
    this._touchStartIndex = index;
    this._hasMoved = false;
    this._isDragging = false;
  },

  // 触摸移动
  onTouchMove: function (e) {
    if (this._touchStartIndex === undefined) return;
    
    const currentX = e.touches[0].pageX;
    const currentY = e.touches[0].pageY;
    const deltaX = currentX - this._touchStartX;
    const deltaY = currentY - this._touchStartY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const timePassed = Date.now() - this._touchStartTime;
    
    // 长按300ms或移动超过15px，开始拖动
    if (!this._isDragging && (timePassed > 300 || distance > 15)) {
      this._isDragging = true;
      this._hasMoved = true;
      this.setData({ draggingIndex: this._touchStartIndex });
      wx.vibrateShort({ type: 'light' });
    }
    
    if (this._isDragging && this.data.draggingIndex !== -1) {
      // 计算移动了多少个位置（3列布局）
      const itemWidth = 120;  // 每个图标的宽度（包括间距）
      const itemHeight = 105; // 每个图标的高度（包括间距）
      const cols = 3;
      
      const movedCols = Math.round(deltaX / itemWidth);
      const movedRows = Math.round(deltaY / itemHeight);
      const movedPositions = movedRows * cols + movedCols;
      
      if (movedPositions !== 0) {
        const newIndex = this._touchStartIndex + movedPositions;
        const maxIndex = this.data.favoriteApps.length - 1;
        const targetIndex = Math.max(0, Math.min(newIndex, maxIndex));
        
        if (targetIndex !== this.data.draggingIndex) {
          // 交换位置
          const favorites = this.data.favoriteApps.slice();
          const draggedItem = favorites[this._touchStartIndex];
          favorites.splice(this._touchStartIndex, 1);
          favorites.splice(targetIndex, 0, draggedItem);
          
          this.setData({ 
            favoriteApps: favorites,
            draggingIndex: targetIndex
          });
          this._touchStartIndex = targetIndex;
          this._touchStartX = currentX;
          this._touchStartY = currentY;
        }
      }
    }
  },

  // 触摸结束
  onTouchEnd: function () {
    if (this._isDragging && this.data.draggingIndex !== -1) {
      // 保存排序
      this._saveFavorites(this.data.favoriteApps);
    }
    
    this.setData({ draggingIndex: -1 });
    this._touchStartIndex = undefined;
    this._touchStartTime = undefined;
    this._touchStartX = undefined;
    this._touchStartY = undefined;
    this._hasMoved = false;
    this._isDragging = false;
  },

  _saveFavorites: function (favorites) {
    try {
      wx.setStorageSync('favoriteApps', favorites);
    } catch (e) {
      console.error('Save favorites failed', e);
    }
    // 异步同步到服务端
    try {
      api.system.saveFavoriteApps(JSON.stringify(favorites)).catch(function (e) {
        console.warn('[home] sync favorites to server failed:', e.message || e);
      });
    } catch (e) { /* ignore */ }
  },

});
