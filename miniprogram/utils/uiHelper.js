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
const NAVIGATE_TIMEOUT = 5000; // 导航超时时间(ms)，从3秒增加到5秒
const NAVIGATE_UNLOCK_DELAY = 1500; // 导航完成后解锁延迟(ms)

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
  if (navigating) {
    console.warn('[SafeNavigate] 导航进行中，忽略重复调用:', options.url);
    return Promise.resolve();
  }

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

  return new Promise((resolve, reject) => {
    // 设置超时保护
    timeoutTimer = setTimeout(() => {
      navigating = false;
      navigateTimer = null;
      const err = { errMsg: 'navigateTo:fail timeout' };
      console.error('[SafeNavigate] 导航超时:', options.url, err);
      reject(err);
    }, NAVIGATE_TIMEOUT);

    navigator({
      ...options,
      success: (res) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        navigateTimer = setTimeout(() => {
          navigating = false;
          navigateTimer = null;
        }, NAVIGATE_UNLOCK_DELAY);
        resolve(res);
      },
      fail: (err) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        navigating = false;
        navigateTimer = null;
        console.error('[SafeNavigate] 导航失败:', err);
        reject(err);
      },
    });
  });
}

module.exports = { toast, toastAndRedirect, confirm, prompt, safeNavigate };
