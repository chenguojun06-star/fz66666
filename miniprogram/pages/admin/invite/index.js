const config = require('../../../config');

Page({
  data: {
    tenantCode: '',
    tenantName: '',
    loading: false,
  },

  onLoad() {
    this.loadTenantInfo();
  },

  async loadTenantInfo() {
    this.setData({ loading: true });
    try {
      const app = getApp();
      if (app.globalData && app.globalData.tenantCode) {
        this.setData({
          tenantCode: app.globalData.tenantCode,
          tenantName: app.globalData.tenantName || '',
        });
      }
    } catch (err) {
      console.error('[invite] loadTenantInfo failed', err);
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

    let baseUrl = '';
    try {
      const app = getApp();
      baseUrl = (app.globalData && app.globalData.baseUrl) || config.getBaseUrl();
    } catch (e) {
      baseUrl = config.getBaseUrl();
    }
    // Strip /api suffix to get frontend origin
    const origin = baseUrl.replace(/\/api\/?$/, '');
    const url = origin + '/register?tenantCode=' + encodeURIComponent(code)
      + '&tenantName=' + encodeURIComponent(name);

    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '链接已复制', icon: 'success' }),
    });
  },
});
