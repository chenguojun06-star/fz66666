/**
 * 质检 Handler
 * 质检已迁移为独立页面 /pages/scan/quality/index，此处仅保留页面导航
 */
const { toast, safeNavigate } = require('../../../utils/uiHelper');

/**
 * 跳转到质检录入页面
 */
function showQualityModal(page, detail) {
  const app = getApp();
  app.globalData.qualityData = detail;
  safeNavigate({ url: '/pages/scan/quality/index' }).catch(() => {});
}

module.exports = {
  showQualityModal,
};
