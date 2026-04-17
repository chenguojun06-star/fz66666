const { getToken, clearToken, isTokenExpired } = require('./utils/storage');
const reminderManager = require('./utils/reminderManager');
const { DEBUG_MODE } = require('./config');
const { eventBus } = require('./utils/eventBus');
const { wsManager } = require('./utils/websocketManager');
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

function getCurrentRoutePath() {
  try {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    const currentPage = pages && pages.length ? pages[pages.length - 1] : null;
    return currentPage && currentPage.route ? `/${currentPage.route}` : '';
  } catch (e) {
    return '';
  }
}

function navigateToLoginSafely() {
  const loginUrl = '/pages/login/index';
  const run = () => {
    const currentRoute = getCurrentRoutePath();
    if (currentRoute === loginUrl) {
      return;
    }

    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    if (pages && pages.length > 0) {
      wx.redirectTo({
        url: loginUrl,
        fail: () => {
          wx.reLaunch({ url: loginUrl });
        },
      });
      return;
    }

    wx.reLaunch({ url: loginUrl });
  };

  setTimeout(run, 120);
}

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
        eventBus.emit('showPrivacyDialog', resolve);
        setTimeout(function () {
          if (getApp().globalData.privacyResolve === resolve) {
            try { resolve({ buttonAction: 'disagree' }); } catch (_e) {}
            getApp().globalData.privacyResolve = null;
          }
        }, 10000);
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
    try {
      if (this._reminderTimerId) { clearTimeout(this._reminderTimerId); }
      this._reminderTimerId = setTimeout(() => {
        reminderManager.checkAndShowReminders();
      }, 1000);
    } catch (e) {
      console.error('检查提醒失败', e);
    }
    try {
      wsManager.onAppShow();
    } catch (_e) {}
  },

  onHide() {
    if (this._reminderTimerId) {
      clearTimeout(this._reminderTimerId);
      this._reminderTimerId = null;
    }
    try {
      wsManager.onAppHide();
    } catch (_e) {}
  },

  onPageNotFound(res) {
    console.warn('[App] 页面不存在:', res.path);
    wx.reLaunch({ url: '/pages/home/index' });
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
    if (token && !isTokenExpired()) {
      return true;
    }
    if (token && isTokenExpired()) {
      clearToken();
    }
    this.redirectToLogin();
    return false;
  },

  redirectToLogin() {
    if (redirectingToLogin) {
      return;
    }
    if (getCurrentRoutePath() === '/pages/login/index') {
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
    }, 1000);
    navigateToLoginSafely();
  },

  logout() {
    clearToken();
    try { wsManager.disconnect(); } catch (_e) {}
    const { clearUserInfo } = require('./utils/storage');
    clearUserInfo();

    // ✅ 清除所有业务缓存，防止跨租户数据泄漏
    const BUSINESS_KEYS = [
      'pending_cutting_task',
      'pending_procurement_task',
      'pending_quality_task',
      'pending_repair_task',
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
    if (e && e.errMsg != null) {
      raw = String(e.errMsg);
    } else if (e && e.message != null) {
      raw = String(e.message);
    } else if (typeof e === 'string') {
      raw = e;
    } else if (fallback != null) {
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
    try {
      if (typeof msg === 'string' && (
        msg.indexOf('__subPageFrameEndTime__') !== -1 ||
        msg.indexOf('__appServiceEngine__') !== -1 ||
        msg.indexOf('__global') !== -1
      )) {
        return;
      }
      console.error('[App] 全局错误:', msg);
      this._reportError('onError', typeof msg === 'string' ? msg : String(msg));
    } catch (_) {
    }
  },

  onUnhandledRejection(res) {
    const reason = res && res.reason ? String(res.reason) : 'unknown';
    console.error('[App] 未处理的Promise拒绝:', reason);
    this._reportError('unhandledRejection', reason);
  },

  _reportError(type, detail) {
    try {
      const token = getToken();
      if (!token) return;
      wx.request({
        url: require('./config').getBaseUrl() + '/api/system/error-report',
        method: 'POST',
        header: { Authorization: 'Bearer ' + token },
        data: {
          type,
          detail: (detail || '').substring(0, 500),
          timestamp: Date.now(),
        },
        success(res) {
          if (res.statusCode === 404) {
            console.warn('[App] error-report端点未部署，跳过上报');
          }
        },
        fail() {},
      });
    } catch (_) {}
  },
});
