const api = require('../../utils/api');
const { safeNavigate } = require('../../utils/uiHelper');
const { isAdminOrSupervisor } = require('../../utils/permission');
const { isTenantOwner, isTokenExpired } = require('../../utils/storage');
const { eventBus, Events } = require('../../utils/eventBus');

/**
 * 根据当前小时返回问候语
 */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return '上午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

/**
 * 构建首页菜单（进度看板仅对租户老板/管理员/主管/跟单角色显示）
 */
function buildMenuItems() {
  const canSeeDashboard = isTenantOwner() || isAdminOrSupervisor();
  const canSeeSmartOps = isTenantOwner();
  return [
    canSeeSmartOps ? { id: 'smartOps', name: '运营看板', iconClass: 'icon-dashboard', circleClass: 'menu-icon-circle--indigo', route: '/pages/smart-ops/index', badge: 'AI' } : null,
    canSeeDashboard ? { id: 'dashboard', name: '进度看板', iconClass: 'icon-dashboard', circleClass: 'menu-icon-circle--indigo', route: '/pages/dashboard/index' } : null,
    { id: 'production', name: '生产', iconClass: 'icon-progress', circleClass: 'menu-icon-circle--blue', route: '/pages/work/index', tab: 'sewing' },
    { id: 'quality', name: '扫码质检', iconClass: 'icon-quality', circleClass: 'menu-icon-circle--green', route: '/pages/scan/index' },
    { id: 'bundleSplit', name: '菲号单价', iconClass: 'icon-cutting', circleClass: 'menu-icon-circle--orange', route: '/pages/work/bundle-split/index' },
    { id: 'history', name: '历史记录', iconClass: 'icon-history', circleClass: 'menu-icon-circle--purple', route: '/pages/scan/history/index' },
    { id: 'payroll', name: '当月工资', iconClass: 'icon-payroll', circleClass: 'menu-icon-circle--teal', route: '/pages/payroll/payroll' },
  ].filter(Boolean);
}



Page({
  data: {
    statusBarHeight: 0,
    greeting: '',
    userName: '',
    orgName: '',      // 工厂名（工厂账号）或公司名（租户主），用于首页欢迎语
    menuItems: [],
    unreadNoticeCount: 0,
    dateInfo: { icon: '', date: '', day: '', season: '', dailyTip: '' },
  },

  onLoad() {
    const sysInfo = wx.getWindowInfo();
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 44,
      greeting: getGreeting(),
      menuItems: buildMenuItems(),
    });
    // requireAuth 在 onLoad 阶段提前守卫：有 token 且未过期才初始化用户信息
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._loadUserName();
    this._computeDateInfo();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this.setData({ greeting: getGreeting() });
    this._loadUserName(true);
    this._refreshHomeData();
    this._bindWsEvents();
  },

  onHide() {
    this._unbindWsEvents();
  },

  onUnload() {
    this._unbindWsEvents();
  },

  onPullDownRefresh() {
    this._refreshHomeData().finally(() => wx.stopPullDownRefresh());
  },

  /* ---- 私有方法 ---- */

  _refreshHomeData() {
    return Promise.allSettled([this._loadUnreadCount()]);
  },

  _bindWsEvents() {
    if (this._wsBound) return;
    this._wsBound = true;
    this._onDataChanged = () => { this._refreshHomeData(); };
    this._onOrderProgress = () => { this._refreshHomeData(); };
    this._onWarehouseIn = () => { this._refreshHomeData(); };
    eventBus.on(Events.DATA_CHANGED, this._onDataChanged);
    eventBus.on(Events.ORDER_PROGRESS_CHANGED, this._onOrderProgress);
    eventBus.on(Events.WAREHOUSE_IN, this._onWarehouseIn);
  },

  _unbindWsEvents() {
    if (!this._wsBound) return;
    this._wsBound = false;
    if (this._onDataChanged) eventBus.off(Events.DATA_CHANGED, this._onDataChanged);
    if (this._onOrderProgress) eventBus.off(Events.ORDER_PROGRESS_CHANGED, this._onOrderProgress);
    if (this._onWarehouseIn) eventBus.off(Events.WAREHOUSE_IN, this._onWarehouseIn);
  },

  _loadUserName(forceRemote = false) {
    const app = getApp();
    const globalInfo = (app && app.globalData && app.globalData.userInfo) || {};
    const cacheInfo = wx.getStorageSync('user_info') || wx.getStorageSync('userInfo') || {};
    const info = Object.assign({}, cacheInfo, globalInfo);
    const name = info.realName || info.name || info.nickName || info.nickname || '用户';
    // 工厂账号优先显示工厂名，其次显示租户/公司名
    const orgName = info.factoryName || info.tenantName || '';
    const patch = {};
    if (name !== this.data.userName) patch.userName = name;
    if (orgName !== this.data.orgName) patch.orgName = orgName;
    if (Object.keys(patch).length) this.setData(patch);

    if (!forceRemote && this._loadedUserNameFromRemote) return;
    // 无 token 或 token 已过期时跳过远程接口，防止 onLoad 阶段触发 401
    const authToken = wx.getStorageSync('auth_token') || '';
    if (!authToken || isTokenExpired()) return;
    this._loadedUserNameFromRemote = true;
    api.system.getMe()
      .then(res => {
        const me = (res && res.data) || res || {};
        const remoteName = me.realName || me.name || me.nickName || me.nickname;
        const remoteOrgName = me.factoryName || me.tenantName || '';
        const remotePatch = {};
        if (remoteName && remoteName !== this.data.userName) remotePatch.userName = remoteName;
        if (remoteOrgName !== this.data.orgName) remotePatch.orgName = remoteOrgName;
        if (Object.keys(remotePatch).length) this.setData(remotePatch);
      })
      .catch(e => { console.warn('[home] _loadUserName失败:', e.message || e); });
  },

  _loadUnreadCount() {
    return api.notice.unreadCount()
      .then(res => {
        const count = (res && res.data != null) ? Number(res.data) : (Number(res) || 0);
        this.setData({ unreadNoticeCount: count });
      })
      .catch(e => { console.warn('[home] _loadUnreadCount失败:', e.message || e); });
  },

  /* ---- 日期卡片（纯本地计算，无需外部 API） ---- */

  _computeDateInfo() {
    const now = new Date();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const weekDay = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];

    // 每月花语（中国传统月花）
    var monthFlowers = [
      { icon: '🎍', name: '梅花', saying: '凌寒独自开，暗香浮动' },      // 1月
      { icon: '🌺', name: '杏花', saying: '满园春色关不住' },            // 2月
      { icon: '🌸', name: '桃花', saying: '人面桃花相映红' },            // 3月
      { icon: '🏵️', name: '牡丹', saying: '花开时节动京城' },           // 4月
      { icon: '🌷', name: '石榴花', saying: '蕊珠如火一时开' },         // 5月
      { icon: '🪷', name: '荷花', saying: '出淤泥而不染，濯清涟而不妖' },  // 6月
      { icon: '🌻', name: '蜀葵', saying: '向阳而生，永远热忱' },        // 7月
      { icon: '🌕', name: '桂花', saying: '低调芬芳，不言自明' },        // 8月
      { icon: '💮', name: '菊花', saying: '宁可枝头抱香死' },            // 9月
      { icon: '🌺', name: '芙蓉', saying: '一日三变，愈晚愈红' },        // 10月
      { icon: '🌼', name: '山茶花', saying: '唯有山茶偏耐久' },          // 11月
      { icon: '🧊', name: '水仙', saying: '凌波仙子，自有光芒' },        // 12月
    ];
    var flower = monthFlowers[m - 1];
    var season;
    if (m >= 3 && m <= 5) { season = '春'; }
    else if (m >= 6 && m <= 8) { season = '夏'; }
    else if (m >= 9 && m <= 11) { season = '秋'; }
    else { season = '冬'; }

    this.setData({
      dateInfo: {
        icon: flower.icon, date: m + '月' + d + '日', day: '星期' + weekDay,
        season: season, flowerName: flower.name, dailyTip: flower.icon + ' ' + flower.name + ' — ' + flower.saying,
      },
    });
  },

  /* ---- 菜单与导航 ---- */

  onMenuTap(e) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.menuItems[idx];
    if (!item) return;

    if (item.tab) {
      wx.setStorageSync('work_active_tab', item.tab);
    }

    if (item.id === 'quality') {
      wx.setStorageSync('scan_pref_process', '质检');
    }

    const isTabPage = ['/pages/home/index', '/pages/work/index', '/pages/scan/index', '/pages/admin/index'].includes(item.route);
    safeNavigate({ url: item.route }, isTabPage ? 'switchTab' : undefined);
  },

});
