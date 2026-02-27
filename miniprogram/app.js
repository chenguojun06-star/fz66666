const { getToken, clearToken } = require('./utils/storage');
const reminderManager = require('./utils/reminderManager');
const { DEBUG_MODE } = require('./config');
const { eventBus } = require('./utils/eventBus');
// smartGuide 为非核心模块，防御性加载（避免新文件缓存未更新时崩溃 app）
let resolveSmartGuideByRoute = () => null;
try {
  const _smartGuide = require('./utils/smartGuide');
  if (typeof _smartGuide.resolveSmartGuideByRoute === 'function') {
    resolveSmartGuideByRoute = _smartGuide.resolveSmartGuideByRoute;
  }
} catch (e) {
  console.warn('[smartGuide] 模块加载失败，使用空实现，不影响其他功能', e && e.message);
}

let redirectingToLogin = false;
let redirectResetTimer = null;

App({
  globalData: {
    token: '',
    eventBus, // 全局事件总线（使用utils/eventBus.js中的实现）
    smartGuideResolver: resolveSmartGuideByRoute,
    /** 隐私授权 resolve 函数，由当前页的 privacy-dialog 组件消费 */
    privacyResolve: null,
  },

  onLaunch() {
    // 生产环境禁用 console.log 输出（保留 warn/error）
    if (!DEBUG_MODE) {
      console.log = () => {};
    }

    // ✅ 隐私保护授权监听（基础库 2.32.3+，2023-09-15 微信强制要求）
    // 当用户触发需要隐私授权的 API（扫码/选图等）时，通过 eventBus 通知当前页面弹窗
    if (typeof wx.onNeedPrivacyAuthorization === 'function') {
      wx.onNeedPrivacyAuthorization(resolve => {
        this.globalData.privacyResolve = resolve;
        // 通知当前活跃页面显示隐私弹窗
        eventBus.emit('showPrivacyDialog', resolve);
      });
    }

    // 清理过期提醒（超过7天）
    try {
      reminderManager.cleanupExpiredReminders();
    } catch (e) {
      console.error('清理过期提醒失败', e);
    }
  },

  onShow() {
    // 小程序从后台进入前台时检查提醒
    try {
      setTimeout(() => {
        reminderManager.checkAndShowReminders();
      }, 1000);
    } catch (e) {
      console.error('检查提醒失败', e);
    }
  },

  setTabSelected(page, selected) {
    try {
      const idx = Number(selected);
      if (!Number.isFinite(idx)) {
        return;
      }
      const tab = page && typeof page.getTabBar === 'function' ? page.getTabBar() : null;
      if (tab && typeof tab.setData === 'function') {
        tab.setData({ selected: idx });
      }
    } catch (e) {
      console.warn('[App] setTabSelected failed:', e);
    }
  },

  requireAuth() {
    const token = getToken();
    if (token) {
      return true;
    }
    this.redirectToLogin();
    return false;
  },

  redirectToLogin() {
    if (redirectingToLogin) {
      return;
    }
    redirectingToLogin = true;
    if (redirectResetTimer) {
      clearTimeout(redirectResetTimer);
      redirectResetTimer = null;
    }
    redirectResetTimer = setTimeout(() => {
      redirectingToLogin = false;
      redirectResetTimer = null;
    }, 800);
    wx.reLaunch({ url: '/pages/login/index' });
  },

  logout() {
    clearToken();
    const { clearUserInfo } = require('./utils/storage');
    clearUserInfo();

    // ✅ 清除所有业务缓存，防止跨租户数据泄漏
    const BUSINESS_KEYS = [
      'pending_cutting_task',
      'pending_procurement_task',
      'pending_quality_task',
      'pending_order_hint',
      'highlight_order_no',
      'mp_scan_type_index',
      'work_active_tab',
      'scan_history_v2',
      'pending_reminders',
    ];
    BUSINESS_KEYS.forEach(key => {
      try { wx.removeStorageSync(key); } catch (_) { /* ignore */ }
    });

    this.redirectToLogin();
  },

  toast(title) {
    let raw = '';

    // 处理各种类型的输入
    if (title === null) {
      raw = '提示';
    } else if (typeof title === 'string') {
      raw = title;
    } else if (typeof title === 'object') {
      // 如果是对象，尝试提取有用信息
      raw = title.errMsg || title.message || title.msg || JSON.stringify(title);
    } else {
      raw = String(title);
    }

    const v = raw.length > 18 ? raw.slice(0, 18) : raw;
    wx.showToast({ title: v || '提示', icon: 'none' });
  },

  hasMoreByPage(page) {
    if (!page) {
      return false;
    }
    const total = Number(page.total) || 0;
    const current = Number(page.current) || 1;
    const size = Number(page.size) || 0;
    if (size <= 0) {
      return false;
    }
    return current * size < total;
  },

  async loadPagedList(pageCtx, listKey, reset, fetchPage, mapRecord) {
    const key = listKey !== null ? String(listKey) : '';
    if (!key) {
      return;
    }
    const data = pageCtx && pageCtx.data ? pageCtx.data : null;
    const state = data && data[key] ? data[key] : null;
    if (!state || typeof state !== 'object') {
      return;
    }
    if (state.loading) {
      return;
    }
    if (!reset && state.hasMore === false) {
      return;
    }
    if (typeof fetchPage !== 'function') {
      return;
    }

    const nextPage = reset ? 1 : (Number(state.page) || 1) + 1;
    const pageSize = Number(state.pageSize) || 10;
    if (pageCtx && typeof pageCtx.setData === 'function') {
      pageCtx.setData({ [`${key}.loading`]: true });
    }

    try {
      const page = await fetchPage({ page: nextPage, pageSize });
      const records = page && Array.isArray(page.records) ? page.records : [];
      const prev = Array.isArray(state.list) ? state.list : [];

      // 合并数据并去重（基于 id 字段）
      let mergedRaw;
      if (reset) {
        mergedRaw = records;
      } else {
        // 去重：使用 Map 保留最新的数据
        const idMap = new Map();
        prev.forEach(item => {
          if (item && item.id) idMap.set(item.id, item);
        });
        records.forEach(item => {
          if (item && item.id) idMap.set(item.id, item);
        });
        mergedRaw = Array.from(idMap.values());
      }

      const merged = typeof mapRecord === 'function' ? mergedRaw.map(mapRecord) : mergedRaw;

      if (pageCtx && typeof pageCtx.setData === 'function') {
        pageCtx.setData({
          [key]: {
            ...state,
            loading: false,
            page: nextPage,
            pageSize,
            list: merged,
            hasMore: this.hasMoreByPage(page),
          },
        });
      }
    } catch (e) {
      if (e && e.type === 'auth') {
        return;
      }
      this.toastError(e, '网络异常');
    } finally {
      if (pageCtx && typeof pageCtx.setData === 'function') {
        pageCtx.setData({ [`${key}.loading`]: false });
      }
    }
  },

  resetPagedList(pageCtx, listKey) {
    const key = listKey !== null ? String(listKey) : '';
    if (!key || !pageCtx || typeof pageCtx.setData !== 'function') {
      return;
    }
    const data = pageCtx.data || {};
    const state = data[key] && typeof data[key] === 'object' ? data[key] : {};
    const pageSize = Number(state.pageSize) || 10;
    pageCtx.setData({
      [key]: {
        ...state,
        loading: false,
        page: 1,
        pageSize,
        hasMore: true,
        list: [],
      },
    });
  },

  toastError(e, fallback) {
    let raw = '';

    // 优先级：e.errMsg > e.message > fallback > 默认提示
    if (e && e.errMsg !== null) {
      raw = String(e.errMsg);
    } else if (e && e.message !== null) {
      raw = String(e.message);
    } else if (typeof e === 'string') {
      raw = e;
    } else if (fallback !== null) {
      raw = String(fallback);
    } else {
      raw = '网络异常';
    }

    this.toast(raw);
  },

  /**
   * 全局错误捕获 - 捕获页面脚本错误
   */
  onError(msg) {
    // 防御性处理：框架初始化期间 console 可能未就绪，避免二次崩溃
    try {
      // 静默忽略微信框架内部 setInterval 时序报错（开发工具环境特有，生产不出现）
      if (typeof msg === 'string' && (
        msg.indexOf('__subPageFrameEndTime__') !== -1 ||
        msg.indexOf('__appServiceEngine__') !== -1 ||
        msg.indexOf('__global') !== -1
      )) {
        return;
      }
      // eslint-disable-next-line no-console
      console.error('[App] 全局错误:', msg);
    } catch (_) {
      // 框架初始化阶段 console 未就绪，静默失败
    }
  },

  /**
   * 全局未处理 Promise 拒绝捕获
   */
  onUnhandledRejection(res) {
    console.error('[App] 未处理的Promise拒绝:', res.reason);
  },
});
