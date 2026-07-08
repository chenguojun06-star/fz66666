/**
 * UI交互工具函数
 * 统一微信API调用，避免重复代码
 */

/**
 * Toast提示
 */
const toast = {
  /**
   * 成功提示
   * @param {string} title - 提示文字
   * @param {number} duration - 持续时间(ms)，默认1500
   */
  success(title, duration = 1500) {
    wx.showToast({
      title,
      icon: 'success',
      duration,
    });
  },

  ok(title, duration = 1500) {
    wx.showToast({
      title,
      icon: 'success',
      duration,
    });
  },

  /**
   * 错误提示（无图标）
   * @param {string} title - 提示文字
   * @param {number} duration - 持续时间(ms)，默认2000
   */
  error(title, duration = 2000) {
    wx.showToast({
      title,
      icon: 'none',
      duration,
    });
  },

  /**
   * 普通提示（无图标）
   */
  info(title, duration = 1500) {
    wx.showToast({
      title,
      icon: 'none',
      duration,
    });
  },

  /**
   * 加载中提示
   * @param {string} title - 提示文字，默认"加载中..."
   */
  loading(title = '加载中...') {
    wx.showLoading({
      title,
      mask: true,
    });
  },

  /**
   * 隐藏loading
   */
  hide() {
    wx.hideLoading();
  },
};

/**
 * 提示后跳转
 * @param {string} message - 提示信息
 * @param {string} url - 跳转路径
 * @param {number} delay - 延迟时间(ms)，默认1500
 * @param {string} method - 跳转方式: redirectTo(默认) | navigateTo | reLaunch
 */
function toastAndRedirect(message, url, delay = 1500, method = 'redirectTo') {
  toast.info(message, delay);
  setTimeout(() => {
    const navigator =
      {
        redirectTo: wx.redirectTo,
        navigateTo: wx.navigateTo,
        reLaunch: wx.reLaunch,
      }[method] || wx.redirectTo;

    navigator({ url });
  }, delay);
}

/**
 * 确认对话框
 * @param {Object} options - 配置项
 * @param {string} options.title - 标题
 * @param {string} options.content - 内容
 * @param {string} options.confirmText - 确认按钮文字，默认"确定"
 * @param {string} options.cancelText - 取消按钮文字，默认"取消"
 * @returns {Promise<boolean>} - 用户是否确认
 */
function confirm({ title = '提示', content, confirmText = '确定', cancelText = '取消' }) {
  return new Promise(resolve => {
    wx.showModal({
      title,
      content,
      confirmText,
      cancelText,
      success: res => {
        resolve(res.confirm);
      },
      fail: () => {
        resolve(false);
      },
    });
  });
}

/**
 * 输入对话框
 * @param {Object} options - 配置项
 * @param {string} options.title - 标题
 * @param {string} options.content - 提示内容
 * @param {string} options.placeholder - 输入框占位符
 * @param {string} options.confirmText - 确认按钮文字
 * @returns {Promise<string|null>} - 用户输入的内容，取消则返回null
 */
function prompt({
  title = '提示',
  content = '',
  placeholder = '请输入',
  confirmText = '确定',
}) {
  return new Promise(resolve => {
    wx.showModal({
      title,
      content,
      editable: true,
      placeholderText: placeholder,
      confirmText,
      success: res => {
        if (res.confirm) {
          resolve(res.content || '');
        } else {
          resolve(null);
        }
      },
      fail: () => {
        resolve(null);
      },
    });
  });
}

/**
 * 全局导航锁（防止快速重复跳转导致路由错误）
 */
let navigating = false;
let navigateTimer = null;
let navigateStartTime = 0;
let currentNavigateUrl = ''; // 当前正在导航的 url，用于判断是否是相同请求
const NAVIGATE_TIMEOUT = 2500; // 导航超时时间(ms)：2.5秒后自动释放锁并主动 redirectTo 兜底
const NAVIGATE_MAX_LOCK = 4000; // 导航锁最大持有时间：4秒兜底释放（防止SDK完全冻结）
const NAVIGATE_UNLOCK_DELAY = 200; // 导航完成后解锁延迟(ms)，减少不必要的等待

// tabBar 页面路径集合（与 app.json tabBar.list 保持一致）
const TAB_BAR_PAGES = new Set([
  '/pages/home/index',
  '/pages/defect/index',
  '/pages/scan/index',
  '/pages/admin/index',
]);

/**
 * 安全导航（带防抖保护 + tabBar 自动检测 + 超时保护）
 * 防止用户快速点击导致 "routeDone with a webviewId xxx is not found" 错误
 * 自动检测 tabBar 页面并切换为 switchTab，避免 navigateTo 报错
 * 自动检测页面栈深度，避免超过10层导致超时
 * @param {Object} options - 导航参数 { url, ... }
 * @param {string} method - 导航方式: navigateTo | switchTab | redirectTo | reLaunch
 * @returns {Promise} - 导航结果
 */
function safeNavigate(options, method = 'navigateTo') {
  const targetUrl = options.url || '';
  const targetPath = targetUrl.split('?')[0];

  // 防抖：相同 url 在导航锁内才忽略；不同 url 强制切换（覆盖旧锁）
  if (navigating) {
    if (currentNavigateUrl === targetUrl) {
      console.warn('[SafeNavigate] 相同导航进行中，忽略:', targetUrl);
      return Promise.resolve();
    }
    // 不同 url：旧导航可能已被 SDK 卡死，强制释放旧锁，开始新导航
    console.warn('[SafeNavigate] 切换导航目标，强制释放旧锁:', currentNavigateUrl, '→', targetUrl);
    navigating = false;
    if (navigateTimer) { try { clearTimeout(navigateTimer); } catch (_e) {} navigateTimer = null; }
  }

  // 自动检测 tabBar 页面：如果目标是 tabBar 页面且当前不是 switchTab，自动纠正
  if (TAB_BAR_PAGES.has(targetPath) && method !== 'switchTab') {
    method = 'switchTab';
  }

  // 页面栈深度检测：如果 navigateTo 页面栈超过8层，自动降级为 redirectTo
  if (method === 'navigateTo') {
    try {
      const pages = getCurrentPages();
      if (pages && pages.length >= 8) {
        console.warn('[SafeNavigate] 页面栈过深(' + pages.length + '层)，自动降级为 redirectTo');
        method = 'redirectTo';
      }
    } catch (e) {
      console.warn('[SafeNavigate] 无法获取页面栈信息:', e);
    }
  }

  navigating = true;
  currentNavigateUrl = targetUrl;
  navigateStartTime = Date.now();

  if (navigateTimer) {
    clearTimeout(navigateTimer);
    navigateTimer = null;
  }
  // 兜底：即使所有定时器都失效，4秒后强制释放锁
  navigateTimer = setTimeout(() => {
    if (navigating && currentNavigateUrl === targetUrl) {
      console.warn('[SafeNavigate] 导航锁兜底释放(' + NAVIGATE_MAX_LOCK + 'ms)：', targetUrl);
      navigating = false;
      currentNavigateUrl = '';
      navigateStartTime = 0;
    }
  }, NAVIGATE_MAX_LOCK);

  const navigator = {
    navigateTo: wx.navigateTo,
    switchTab: wx.switchTab,
    redirectTo: wx.redirectTo,
    reLaunch: wx.reLaunch,
  }[method] || wx.navigateTo;

  let timeoutTimer = null;
  let finished = false;

  function unlock() {
    if (finished) return;
    finished = true;
    if (timeoutTimer) { try { clearTimeout(timeoutTimer); } catch (_e) {} timeoutTimer = null; }
    if (navigateTimer) { try { clearTimeout(navigateTimer); } catch (_e) {} navigateTimer = null; }
    try { navigating = false; } catch (_e) {}
    currentNavigateUrl = '';
    navigateStartTime = 0;
  }

  function safeFallback() {
    if (finished) return;
    try {
      wx.redirectTo({
        url: targetUrl,
        success: () => { unlock(); },
        fail: () => {
          if (finished) return;
          try {
            wx.reLaunch({ url: '/pages/home/index', complete: () => { unlock(); } });
          } catch (_e) { unlock(); }
        },
      });
    } catch (_e) {
      unlock();
    }
  }

  return new Promise((resolve) => {
    // 超时保护：2.5秒后释放锁，并主动 redirectTo 兜底（防止SDK卡死让点击丢失）
    timeoutTimer = setTimeout(() => {
      if (finished) return;
      console.warn('[SafeNavigate] 导航超时(' + NAVIGATE_TIMEOUT + 'ms)，主动 redirectTo 兜底:', targetUrl);
      // 不立即 unlock，先尝试 redirectTo 兜底（兜底成功后 unlock）
      safeFallback();
      // 兜底也卡死的极端情况：再等 NAVIGATE_MAX_LOCK - NAVIGATE_TIMEOUT 由 navigateTimer 兜底
      resolve();
    }, NAVIGATE_TIMEOUT);

    try {
      navigator({
        ...options,
        success: () => {
          if (finished) return;
          if (timeoutTimer) { try { clearTimeout(timeoutTimer); } catch (_e) {} timeoutTimer = null; }
          navigateTimer = setTimeout(() => { unlock(); }, NAVIGATE_UNLOCK_DELAY);
          resolve();
        },
        fail: (err) => {
          if (finished) return;
          console.warn('[SafeNavigate] 导航失败，降级为 redirectTo:', err && err.errMsg);
          safeFallback();
          resolve();
        },
      });
    } catch (e) {
      console.warn('[SafeNavigate] 导航API调用异常:', e);
      unlock();
      resolve();
    }
  });
}

module.exports = { toast, toastAndRedirect, confirm, prompt, safeNavigate };
