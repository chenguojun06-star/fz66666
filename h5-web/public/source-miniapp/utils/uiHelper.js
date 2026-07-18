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
 *
 * 设计要点：
 * - navigating 锁防止并发 navigateTo（避免 routeDone webviewId not found 错误）
 * - pendingNavigate 记录被防抖拦截的最后一次导航意图，当前导航结束后自动重试一次
 *   （历史教训：2026-07-13 之前被拦截时直接 return，导致用户疯狂点击全部丢失，
 *    5 秒超时后用户已离开，UI 看似卡死）
 * - NAVIGATE_TIMEOUT=3s（5s 太长，用户会以为卡死开始疯狂点击）
 */
let navigating = false;
let navigateTimer = null;
let pendingNavigate = null; // 被防抖拦截的最后一次导航意图 { options, method }
const NAVIGATE_TIMEOUT = 8000; // 导航超时时间(ms)，分包首次加载需要更长时间
const NAVIGATE_UNLOCK_DELAY = 800; // 导航完成后解锁延迟(ms)
const DEBUG_NAVIGATE = false; // 调试日志开关（生产环境保持 false）

// tabBar 页面路径集合（与 app.json tabBar.list 保持一致）
const TAB_BAR_PAGES = new Set([
  '/pages/home/index',
  '/pages/defect/index',
  '/pages/scan/index',
  '/pages/admin/index',
]);

/**
 * 安全导航（带防抖保护 + tabBar 自动检测 + 超时保护 + 待执行队列）
 * 防止用户快速点击导致 "routeDone with a webviewId xxx is not found" 错误
 * 自动检测 tabBar 页面并切换为 switchTab，避免 navigateTo 报错
 * 自动检测页面栈深度，避免超过10层导致超时
 *
 * 防抖策略：
 * - 导航进行中被拦截时，记录最后一次意图到 pendingNavigate
 * - 当前导航结束（success/fail/timeout）后，若有 pendingNavigate，自动重试一次
 * - 重试也走完整的防抖/超时流程，避免无限递归
 *
 * @param {Object} options - 导航参数 { url, ... }
 * @param {string} method - 导航方式: navigateTo | switchTab | redirectTo | reLaunch
 * @returns {Promise} - 导航结果（注意：被拦截的调用返回已 resolve 的 Promise，
 *                      真实结果通过重试 Promise 传递，调用方应 .catch(() => {}) 兜底）
 */
function safeNavigate(options, method = 'navigateTo') {
  if (navigating) {
    // 记录最后一次被拦截的意图，当前导航结束后自动重试一次
    // 不打印 warn（避免日志噪音），仅保留 pendingNavigate 供后续重试
    pendingNavigate = { options: { ...options }, method };
    return Promise.resolve();
  }

  return doNavigate(options, method, false);
}

/**
 * 实际执行导航（内部函数）
 * @param {Object} options - 导航参数
 * @param {string} method - 导航方式
 * @param {boolean} isRetry - 是否为重试调用（重试不再入队 pendingNavigate，避免无限递归）
 */
function doNavigate(options, method, isRetry) {
  const urlPath = (options.url || '').split('?')[0];

  // 自动检测 tabBar 页面：如果目标是 tabBar 页面且当前不是 switchTab，自动纠正
  if (TAB_BAR_PAGES.has(urlPath) && method !== 'switchTab') {
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

  if (navigateTimer) {
    clearTimeout(navigateTimer);
  }

  const navigator = {
    navigateTo: wx.navigateTo,
    switchTab: wx.switchTab,
    redirectTo: wx.redirectTo,
    reLaunch: wx.reLaunch,
  }[method] || wx.navigateTo;

  let timeoutTimer = null;
  let settled = false; // 防止 timeout 和 fail/success 双重触发 finalize

  /**
   * 导航结束后的清理与重试逻辑（仅执行一次）
   * @param {boolean} success - 是否成功
   */
  const finalize = (success) => {
    if (settled) return; // 防止双重触发（timeout + fail 都可能回调）
    settled = true;
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
    if (success) {
      // success 分支：延迟解锁，防止页面切换动画期间被新的 navigateTo 触发 routeDone 错误
      navigateTimer = setTimeout(() => {
        navigating = false;
        navigateTimer = null;
        retryPendingIfNeeded();
      }, NAVIGATE_UNLOCK_DELAY);
    } else {
      // fail/timeout 分支：立即解锁，并尝试重试 pendingNavigate
      navigating = false;
      navigateTimer = null;
      retryPendingIfNeeded();
    }
  };

  /**
   * 如果有被拦截的 pendingNavigate，自动重试一次
   * 重试不再入队 pendingNavigate（isRetry=true），避免无限递归
   */
  const retryPendingIfNeeded = () => {
    if (!pendingNavigate) return;
    const pending = pendingNavigate;
    pendingNavigate = null; // 清空，避免重试失败时再次触发
    if (DEBUG_NAVIGATE) {
      console.log('[SafeNavigate] 自动重试被拦截的导航:', pending.options.url);
    }
    // 重试不返回 Promise（原调用方已返回，无法传递结果）
    doNavigate(pending.options, pending.method, true).catch(() => {});
  };

  return new Promise((resolve, reject) => {
    // 设置超时保护
    timeoutTimer = setTimeout(() => {
      const err = { errMsg: 'navigateTo:fail timeout' };
      console.error('[SafeNavigate] 导航超时:', options.url, err);
      finalize(false);
      reject(err);
    }, NAVIGATE_TIMEOUT);

    navigator({
      ...options,
      success: (res) => {
        finalize(true);
        resolve(res);
      },
      fail: (err) => {
        console.error('[SafeNavigate] 导航失败:', err);
        finalize(false);
        reject(err);
      },
    });
  });
}

module.exports = { toast, toastAndRedirect, confirm, prompt, safeNavigate };
