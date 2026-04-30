const api = require('../../utils/api');
const { safeNavigate } = require('../../utils/uiHelper');
const { isAdminOrSupervisor } = require('../../utils/permission');
const { isTenantOwner } = require('../../utils/storage');
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
    if (name !== this.data.userName) {
      this.setData({ userName: name });
    }

    if (!forceRemote && this._loadedUserNameFromRemote) return;
    // 无 token 时跳过远程接口，防止 onLoad 阶段（token 未就绪）触发 401
    if (!(wx.getStorageSync('auth_token') || '')) return;
    this._loadedUserNameFromRemote = true;
    api.system.getMe()
      .then(res => {
        const me = (res && res.data) || res || {};
        const remoteName = me.realName || me.name || me.nickName || me.nickname;
        if (remoteName && remoteName !== this.data.userName) {
          this.setData({ userName: remoteName });
        }
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

    // 季节 + 图标
    let season, icon;
    if (m >= 3 && m <= 5) { season = '春'; icon = '🌸'; }
    else if (m >= 6 && m <= 8) { season = '夏'; icon = '☀️'; }
    else if (m >= 9 && m <= 11) { season = '秋'; icon = '🍂'; }
    else { season = '冬'; icon = '❄️'; }

    // 每日花语（按日期轮换）
    const flowers = [
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
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const dailyTip = flowers[dayOfYear % flowers.length];

    this.setData({
      dateInfo: { icon, date: m + '月' + d + '日', day: '星期' + weekDay, season, dailyTip },
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
