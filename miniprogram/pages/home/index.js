const api = require('../../utils/api');
const { safeNavigate } = require('../../utils/uiHelper');
const { isTokenExpired, isFactoryOwner, getUserInfo } = require('../../utils/storage');
const { eventBus, Events } = require('../../utils/eventBus');
const permission = require('../../utils/permission');

function _hasFn(fn) { return typeof fn === 'function'; }

const DAILY_TIPS = [
  '扫码前请确认菲号与工序匹配，避免扫错扣工资',
  '质检不合格的菲号会自动回到待检列表，需返修后重新扫码',
  '裁剪分扎后菲号自动生成二维码，可直接打印标签',
  '工资结算前请确认所有工序扫码已完成，未完成的不计入',
  '外发转单后可在转单记录中跟踪工厂进度',
  '物料入库前请核对采购单号和实际数量，多退少补',
  '样衣开发完成后BOM配置自动锁定，如需修改请联系主管',
  '预付款申请需上传凭证，审批通过后自动入账',
  '今日待质检的菲号请在下班前完成，避免影响下一道工序',
  '扫码异常（重复扫码/扫错工序）请及时联系主管处理',
  '裁剪损耗超过5%需要填写原因说明，否则无法生成菲号',
  '订单交期前3天系统会自动提醒，请提前安排生产进度',
  '工序模板修改后已扫码的记录不受影响，仅对新扫码生效',
  '退货处理请在3个工作日内完成，逾期自动计入考核',
  '库位扫码后请确认货架信息正确，避免物料错放',
  '生产进度低于50%时系统会标红预警，请及时跟进',
  '月度工资单在次月1号生成，如有异议请在3号前反馈',
  '外发工厂交货延迟超过2天需立即上报，影响订单交期',
  '样衣BOM配置时请填写准确用量，直接影响采购成本计算',
  '质检合格率低于90%的批次需要返检全部菲号',
  '扫码历史可按日期筛选，方便核对当日工作量',
  '采购任务超期3天自动升级提醒，请及时处理',
  '菲号打印前请确认标签尺寸和方向，避免浪费标签纸',
  '工序单价调整需主管审批，审批通过后次日起效',
  '库存预警的物料请优先安排采购，避免停工待料',
  '样衣进度看板可查看各阶段完成率，及时跟进瓶颈工序',
  '转单时请确认目标工厂产能，避免交期延误',
  '工资查询支持按工序筛选，方便核对计件明细',
  '每日下班前请完成当日扫码记录的确认，确保工资准确',
  '财务付款状态实时更新，审批通过后可直接查看付款凭证',
  '平台订单同步后请在24小时内确认，逾期系统自动标记未处理',
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
  returnManage: 'miniprogram.menu.returnManage',
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return '上午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

// 将收藏 ID 数组映射为完整菜单项对象（含 iconClass / circleClass / route / name）
function enrichFavorites(ids) {
  var items = buildMenuItems(null);
  var lookup = {};
  items.forEach(function (item) { lookup[item.id] = item; });
  return ids.map(function (entry) {
    var id = typeof entry === 'string' ? entry : (entry && entry.id);
    return lookup[id];
  }).filter(function (item) { return item; });
}

// 默认收藏（设计稿 7 个核心应用，与 home.html 一致）
function getDefaultFavoriteIds() {
  return ['dashboard', 'scan', 'production', 'wagePayment', 'procurement', 'sampleDev', 'materialScan'];
}

function buildMenuItems(menuVisibility) {
  const visibility = menuVisibility || {};
  const items = [];
  const isFactory = isFactoryOwner();

  // ===== 设计稿 7 个核心应用（顺序/名称/图标/颜色与 home.html 一致）=====

  // 1. 生产管理 — house icon — blue (#007aff)
  if (!isFactory && visibility.dashboard !== false) {
    items.push({ id: 'dashboard', name: '生产管理', iconClass: 'icon-app-dashboard', circleClass: 'menu-icon-circle--blue', route: '/pages/dashboard/index' });
  }
  // 2. 扫码工序 — tag icon — green (#34c759)
  if (visibility.quality !== false) {
    items.push({ id: 'scan', name: '扫码工序', iconClass: 'icon-app-scan', circleClass: 'menu-icon-circle--green', route: '/pages/scan/index' });
  }
  // 3. 质检管理 — checkmark icon — red
  if (!isFactory && visibility.production !== false) {
    items.push({ id: 'production', name: '质检管理', iconClass: 'icon-app-quality', circleClass: 'menu-icon-circle--red', route: '/pages/defect/index' });
  }
  // 4. 工资查询 — file icon — purple (#5856d6)
  if (!isFactory && visibility.wagePayment !== false) {
    items.push({ id: 'wagePayment', name: '工资查询', iconClass: 'icon-app-wage', circleClass: 'menu-icon-circle--purple', route: '/pages/payroll/payroll' });
  }
  // 5. 采购任务 — package icon — blue (#007aff)
  if (!isFactory && visibility.procurement !== false) {
    items.push({ id: 'procurement', name: '采购任务', iconClass: 'icon-app-procurement', circleClass: 'menu-icon-circle--blue', route: '/pages/procurement/task-list/index' });
  }
  // 5.5 菲号单价 — bundle split icon — green
  if (visibility.bundleSplit !== false) {
    items.push({ id: 'bundleSplit', name: '菲号单价', iconClass: 'icon-app-scan', circleClass: 'menu-icon-circle--green', route: '/pages/work/bundle-split/index' });
  }
  // 6. 样衣开发 — pencil icon — magenta (#af52de)
  if (!isFactory && visibility.orderCreate !== false) {
    items.push({ id: 'sampleDev', name: '样衣开发', iconClass: 'icon-app-sample', circleClass: 'menu-icon-circle--magenta', route: '/pages/sample-development/index/index' });
  }
  // 7. 物料入库 — cart icon — light blue (#66abff)
  if (visibility.factoryShipment !== false) {
    items.push({ id: 'materialScan', name: '物料入库', iconClass: 'icon-app-warehouse', circleClass: 'menu-icon-circle--lightblue', route: '/pages/warehouse/material/scan/index' });
  }

  // ===== 其他应用（与 more-apps.html 设计稿一致）=====

  // 生产管理组
  if (!isFactory && visibility.dashboard !== false) {
    items.push({ id: 'processTemplate', name: '工序模板', iconClass: 'icon-app-folder', circleClass: 'menu-icon-circle--lightblue', route: '/pages/dashboard/process-template/index' });
  }
  // 供应链组
  if (visibility.cuttingDetail !== false) {
    items.push({ id: 'cuttingDetail', name: '裁剪任务', iconClass: 'icon-menu-cutting-task', circleClass: 'menu-icon-circle--purple', route: '/pages/cutting/bundle-detail/index' });
  }
  if (visibility.factoryShipment !== false) {
    items.push({ id: 'locationScan', name: '库位扫码', iconClass: 'icon-app-location', circleClass: 'menu-icon-circle--green', route: '/pages/warehouse/location-scan/index' });
    // 外发工厂对所有用户可见，确保收藏能同步到首页
    items.push({ id: 'factoryShipment', name: '外发工厂', iconClass: 'icon-app-send', circleClass: 'menu-icon-circle--indigo', route: '/pages/factory/shipment/index' });
  }
  // 财务销售组
  if (!isFactory && visibility.wagePayment !== false) {
    items.push({ id: 'payroll', name: '财务付款', iconClass: 'icon-app-check-circle', circleClass: 'menu-icon-circle--green', route: '/pages/finance/payment/index' });
  }
  if (!isFactory && visibility.advance !== false) {
    items.push({ id: 'advance', name: '预付款', iconClass: 'icon-app-scan', circleClass: 'menu-icon-circle--magenta', route: '/pages/advance/list/index' });
  }
  if (!isFactory && visibility.salesData !== false) {
    items.push({ id: 'salesData', name: '销售概览', iconClass: 'icon-app-shield', circleClass: 'menu-icon-circle--blue', route: '/pages/sales/overview/index' });
  }
  // 其他组
  if (!isFactory && visibility.smartOps !== false) {
    items.push({ id: 'smartOps', name: '智能运营', iconClass: 'icon-app-help', circleClass: 'menu-icon-circle--purple', route: '/pages/smart-ops/index' });
  }
  if (!isFactory && visibility.returnManage !== false) {
    items.push({ id: 'returnManage', name: '退货管理', iconClass: 'icon-app-arrow-left', circleClass: 'menu-icon-circle--red', route: '/pages/return/list/index' });
  }
  if (!isFactory && visibility.userApproval !== false) {
    items.push({ id: 'userApproval', name: '用户审批', iconClass: 'icon-app-user', circleClass: 'menu-icon-circle--gray', route: '/pages/admin/user-approval/index' });
  }
  if (!isFactory && visibility.feedback !== false) {
    items.push({ id: 'feedback', name: '意见反馈', iconClass: 'icon-app-message', circleClass: 'menu-icon-circle--magenta', route: '/pages/admin/misc/feedback/index' });
  }
  // 额外应用（不在 more-apps 设计稿中，但保留兼容旧收藏）
  if (!isFactory && visibility.orderCreate !== false) {
    items.push({ id: 'orderCreate', name: '下单管理', iconClass: 'icon-menu-order', circleClass: 'menu-icon-circle--blue', route: '/pages/order/create/index' });
  }
  if (visibility.history !== false) {
    items.push({ id: 'history', name: '扫码历史', iconClass: 'icon-menu-history', circleClass: 'menu-icon-circle--indigo', route: '/pages/scan/history/index' });
  }
  if (!isFactory && visibility.platformOrder !== false) {
    items.push({ id: 'platformOrder', name: '平台订单', iconClass: 'icon-menu-order', circleClass: 'menu-icon-circle--purple', route: '/pages/sales/order-list/index' });
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
    // 无收藏时使用默认（前7个菜单项）
    if (localFavorites.length === 0) {
      localFavorites = getDefaultFavoriteIds();
    }
    that.setData({ favoriteApps: enrichFavorites(localFavorites) });
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
      // 服务器返回空：检查本地是否有真实收藏，否则用默认
      if (favorites.length === 0) {
        let stored = [];
        try { stored = wx.getStorageSync('favoriteApps') || []; } catch (e) { /* ignore */ }
        favorites = stored.length > 0 ? stored : getDefaultFavoriteIds();
      }
      // 同步到本地缓存
      try { wx.setStorageSync('favoriteApps', favorites); } catch (e) { /* ignore */ }
      that.setData({ favoriteApps: enrichFavorites(favorites) });
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
    const dailyTip = DAILY_TIPS[dayOfYear % DAILY_TIPS.length];

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

    // P0 修复：不传 data-app 对象（序列化不可靠），改传 data-route / data-id 字符串
    var ds = e.currentTarget.dataset || {};
    var route = String(ds.route || '').trim();
    if (!route) {
      console.warn('[home] onFavoriteTap 缺少 route 参数', ds);
      return;
    }
    safeNavigate({ url: route });
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
    // 从对象数组提取 ID 字符串数组（兼容旧的纯 ID 数组）
    var ids = favorites.map(function (f) {
      return typeof f === 'string' ? f : (f && f.id);
    }).filter(function (id) { return id; });
    try {
      wx.setStorageSync('favoriteApps', ids);
    } catch (e) {
      console.error('Save favorites failed', e);
    }
    // 异步同步到服务端
    try {
      api.system.saveFavoriteApps(JSON.stringify(ids)).catch(function (e) {
        console.warn('[home] sync favorites to server failed:', e.message || e);
      });
    } catch (e) { /* ignore */ }
  },

});
