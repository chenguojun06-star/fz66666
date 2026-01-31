/**
 * 统一弹窗工具函数
 * 封装小程序原生弹窗，提供一致的使用体验
 */

const { DEBUG } = require('../config/debug');

/**
 * 确认弹窗
 * @param {Object} options - 配置选项
 * @param {string} options.title - 标题
 * @param {string} options.content - 内容
 * @param {string} options.confirmText - 确认按钮文字（默认：确认）
 * @param {string} options.cancelText - 取消按钮文字（默认：取消）
 * @param {boolean} options.showCancel - 是否显示取消按钮（默认：true）
 * @returns {Promise<boolean>} 用户是否确认
 */
function confirm({
  title = '提示',
  content = '',
  confirmText = '确认',
  cancelText = '取消',
  showCancel = true,
} = {}) {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      confirmText,
      cancelText,
      showCancel,
      confirmColor: '#3b82f6', // 使用主题主色
      success: (res) => {
        resolve(res.confirm);
      },
      fail: (err) => {
        if (DEBUG) {
          console.error('[Dialog] confirm failed:', err);
        }
        resolve(false);
      },
    });
  });
}

/**
 * 警告弹窗
 * @param {Object} options - 配置选项
 * @param {string} options.title - 标题
 * @param {string} options.content - 内容
 * @param {string} options.confirmText - 确认按钮文字（默认：知道了）
 * @returns {Promise<void>}
 */
function alert({
  title = '提示',
  content = '',
  confirmText = '知道了',
} = {}) {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      showCancel: false,
      confirmText,
      confirmColor: '#3b82f6',
      success: () => {
        resolve();
      },
      fail: (err) => {
        if (DEBUG) {
          console.error('[Dialog] alert failed:', err);
        }
        resolve();
      },
    });
  });
}

/**
 * 成功提示
 * @param {string} title - 提示文字
 * @param {number} duration - 显示时长（毫秒，默认1500）
 * @returns {Promise<void>}
 */
function success(title = '操作成功', duration = 1500) {
  return new Promise((resolve) => {
    wx.showToast({
      title,
      icon: 'success',
      duration,
      success: () => {
        setTimeout(resolve, duration);
      },
      fail: () => {
        resolve();
      },
    });
  });
}

/**
 * 错误提示
 * @param {string} title - 提示文字
 * @param {number} duration - 显示时长（毫秒，默认2000）
 * @returns {Promise<void>}
 */
function error(title = '操作失败', duration = 2000) {
  return new Promise((resolve) => {
    wx.showToast({
      title,
      icon: 'error',
      duration,
      success: () => {
        setTimeout(resolve, duration);
      },
      fail: () => {
        resolve();
      },
    });
  });
}

/**
 * 加载提示
 * @param {string} title - 提示文字（默认：加载中...）
 * @returns {void}
 */
function showLoading(title = '加载中...') {
  wx.showLoading({
    title,
    mask: true,
  });
}

/**
 * 隐藏加载提示
 * @returns {void}
 */
function hideLoading() {
  wx.hideLoading();
}

/**
 * 隐藏弹窗
 * @returns {void}
 */
function hideModal() {
  wx.hideModal && wx.hideModal();
}

module.exports = {
  confirm,
  alert,
  success,
  error,
  showLoading,
  hideLoading,
  hideModal,
};
