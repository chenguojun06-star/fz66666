/**
 * 质检 Handler
 * 质检已迁移为独立页面 /pages/scan/quality/index，此处仅保留页面导航
 */
const { toast } = require('../../../utils/uiHelper');

/**
 * 跳转到质检录入页面
 */
function showQualityModal(page, detail) {
  var app = getApp();
  app.globalData.qualityData = detail;
  wx.navigateTo({ url: '/pages/scan/quality/index' });
}

module.exports = {
  showQualityModal,
};