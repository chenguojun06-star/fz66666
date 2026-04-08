/**
 * 通用 & 仪表板 & 微信 API（dashboard / wechat / common）
 */
const { ok, raw, uploadFile } = require('./helpers');

const dashboard = {
  get(params) {
    return ok('/api/dashboard', 'GET', params || {});
  },
  getTopStats(params) {
    return ok('/api/dashboard/top-stats', 'GET', params || {});
  },
};

const wechat = {
  miniProgramLogin(data) {
    return raw('/api/wechat/mini-program/login', 'POST', data || {});
  },
  inviteInfo(inviteCode) {
    return raw(`/api/tenant/invite/${encodeURIComponent(inviteCode)}`, 'GET', {});
  },
};

const common = {
  uploadImage(filePath, formData) {
    return uploadFile('/api/common/upload', filePath, 'file', formData || {});
  },
};

module.exports = { dashboard, wechat, common };
