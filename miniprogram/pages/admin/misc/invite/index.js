const config = require('../../../../config');
const api = require('../../../../utils/api');

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

Page({
  data: {
    tenantCode: '',
    qrUrl: '',
    loading: false,
  },

  onLoad() {
    this.loadTenantInfo();
  },

  async loadTenantInfo() {
    this.setData({ loading: true });
    try {
      const [tenantResp, qrResp] = await Promise.all([
        api.tenant.myTenant(),
        api.wechat.generateInviteQr({}),
      ]);

      const tenantCode = (tenantResp && tenantResp.tenantCode) || '';
      const tenantName = (tenantResp && tenantResp.tenantName) || '';

      const qrData = (qrResp && qrResp.code === 200 && qrResp.data) || {};
      const qrCodeBase64 = qrData.qrCodeBase64 || '';
      this._inviteToken = qrData.inviteToken || '';
      this._expiresAt = qrData.expiresAt || '';

      this.setData({ tenantCode, qrUrl: qrCodeBase64 });
      this._tenantName = tenantName;
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
    const name = this._tenantName || '工厂';
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

  onShareAppMessage() {
    const name = this._tenantName || '工厂';
    return {
      title: name + ' · 邀请你加入',
      path: '/pages/login/index?inviteToken=' + encodeURIComponent(this._inviteToken || ''),
    };
  },
});
