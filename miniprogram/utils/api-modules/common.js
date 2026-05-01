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
  getDailyBrief() {
    return ok('/api/dashboard/daily-brief', 'GET', {});
  },
};

const wechat = {
  miniProgramLogin(data) {
    return raw('/api/wechat/mini-program/login', 'POST', data || {});
  },
  /**
   * 解析邀请 token，返回 {tenantId, tenantName}（小程序扫码后调用，无需登录）
   * 后端端点：GET /api/wechat/mini-program/invite/info?token=xxx
   */
  inviteInfo(token) {
    return raw(`/api/wechat/mini-program/invite/info?token=${encodeURIComponent(token)}`, 'GET', {});
  },
  /**
   * 生成邀请员工的官方小程序码（需要管理员登录）
   * 后端端点：POST /api/wechat/mini-program/invite/generate
   * 返回 { qrCodeBase64, inviteToken, expiresAt }
   */
  generateInviteQr(body) {
    return raw('/api/wechat/mini-program/invite/generate', 'POST', body || {});
  },
};

const common = {
  uploadImage(filePath, formData) {
    return uploadFile('/api/common/upload', filePath, 'file', formData || {});
  },
};

module.exports = { dashboard, wechat, common };
