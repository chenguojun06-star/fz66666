/**
 * UI交互工具函数
 * 统一微信API调用，避免重复代码
 */

/**
 * Toast提示
 */
export const toast = {
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
export function toastAndRedirect(message, url, delay = 1500, method = 'redirectTo') {
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
export function confirm({ title = '提示', content, confirmText = '确定', cancelText = '取消' }) {
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
export function prompt({
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
