/**
 * 确认弹窗处理器
 * 确认弹窗已迁移为独立页面，此处仅保留页面导航
 *
 * @module ConfirmModalHandler
 */

const { safeNavigate } = require('../../../utils/uiHelper');

/**
 * 显示确认页 — 样板模式跳转 /pages/scan/pattern/index，普通模式跳转 /pages/scan/confirm/index
 */
function showConfirmModal(ctx, data) {
  const isPatternMode = data.patternId || data.patternDetail;
  if (isPatternMode) {
    getApp().globalData.patternScanData = data;
    safeNavigate({ url: '/pages/scan/pattern/index' }).catch(() => {});
    return;
  }

  getApp().globalData.confirmScanData = data;
  safeNavigate({ url: '/pages/scan/confirm/index' }).catch(() => {});
}

module.exports = {
  showConfirmModal,
};
