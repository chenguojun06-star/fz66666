const config = require('../../../config');
const api = require('../../../utils/api');

/** 获取 PC 端前端域名，用于拼接 PC 注册链接 */
function getFrontendOrigin() {
  let baseUrl = '';
  try {
    const app = getApp();
    baseUrl = (app.globalData && app.globalData.baseUrl) || config.getBaseUrl();
  } catch (e) {
    baseUrl = config.getBaseUrl();
  }
  return baseUrl.replace(/^(https?:\/\/)api\./, '$1www.').replace(/\/api\/?$/, '');
}

/*
 * 邀请员工页面 — 二维码生成已修复（2026-06-xx）
 *
 * 修复前问题：
 *   1. 手动拼接 weixin://dl/business/?appid=xxx&path=pages/register/index&query=...
 *      这并非合法的微信 URL Scheme（合法 scheme 需服务端通过微信 API 生成 t=TOKEN），
 *      微信扫码后直接报"对不起，当前页面无法访问"。
 *   2. pages/register/index 是分包页面（pkg-register），URL Scheme 无法直接跳转分包。
 *   3. api.wechat.inviteInfo 调用了不存在的 /api/tenant/invite/ 端点。
 *
 * 修复后流程：
 *   1. 调用后端 POST /api/wechat/mini-program/invite/generate
 *      后端通过微信官方 getwxacodeunlimit API 生成真正的小程序码（scene=inviteToken=xxx），
 *      落点页面为主包的 pages/login/index。
 *   2. 扫码后 login 页 onLoad 解析 options.scene，调用
 *      GET /api/wechat/mini-program/invite/info?token=xxx 解析租户信息，
 *      自动预填工厂/租户，引导员工登录绑定。
 */

Page({
  data: {
    tenantCode: '',
    tenantName: '',
    qrUrl: '',       // base64 格式的小程序码图片，直接绑定到 <image src>
    inviteToken: '',
    expiresAt: '',
    loading: false,
  },

  onLoad() {
    this.loadTenantInfo();
  },

  async loadTenantInfo() {
    this.setData({ loading: true });
    try {
      // 同时获取租户基本信息（用于显示工厂码）和官方小程序邀请码
      const [tenantResp, qrResp] = await Promise.all([
        api.tenant.myTenant(),
        api.wechat.generateInviteQr({}),
      ]);

      const tenantCode = (tenantResp && tenantResp.tenantCode) || '';
      const tenantName = (tenantResp && tenantResp.tenantName) || '';

      const qrCodeBase64 = (qrResp && qrResp.qrCodeBase64) || '';
      const inviteToken = (qrResp && qrResp.inviteToken) || '';
      const expiresAt = (qrResp && qrResp.expiresAt) || '';

      this.setData({ tenantCode, tenantName, qrUrl: qrCodeBase64, inviteToken, expiresAt });
    } catch (err) {
      console.error('[invite] loadTenantInfo failed', err);
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onCopyTenantCode() {
    const code = this.data.tenantCode;
    if (!code) {
      wx.showToast({ title: '暂无邀请码', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '工厂码已复制', icon: 'success' }),
    });
  },

  onCopyInviteUrl() {
    const code = this.data.tenantCode;
    const name = this.data.tenantName;
    if (!code) {
      wx.showToast({ title: '暂无邀请码', icon: 'none' });
      return;
    }
    const origin = getFrontendOrigin();
    const url = origin + '/register?tenantCode=' + encodeURIComponent(code)
      + '&tenantName=' + encodeURIComponent(name);
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '链接已复制', icon: 'success' }),
    });
  },
});
