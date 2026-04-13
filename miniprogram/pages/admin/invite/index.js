const config = require('../../../config');
const api = require('../../../utils/api');

const MINIAPP_APPID = 'wx6d92fb9db5a7bfb4';

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
    tenantName: '',
    qrUrl: '',
    loading: false,
  },

  onLoad() {
    this.loadTenantInfo();
  },

  async loadTenantInfo() {
    this.setData({ loading: true });
    try {
      const resp = await api.tenant.myTenant();
      const tenantCode = (resp && resp.tenantCode) || '';
      const tenantName = (resp && resp.tenantName) || '';

      let qrUrl = '';
      if (tenantCode) {
        const query = 'tenantCode=' + encodeURIComponent(tenantCode)
          + '&tenantName=' + encodeURIComponent(tenantName);
        const wechatScheme = 'weixin://dl/business/?appid=' + MINIAPP_APPID
          + '&path=pages/register/index&query=' + encodeURIComponent(query);
        qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data='
          + encodeURIComponent(wechatScheme);
      }

      this.setData({ tenantCode, tenantName, qrUrl });
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
