const config = require('../../../config');
const api = require('../../../utils/api');

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
      // 修复：原来读 app.globalData.tenantCode（从未被设置），改为直接调用 API
      const resp = await api.tenant.myTenant();
      const tenantCode = (resp && resp.tenantCode) || '';
      const tenantName = (resp && resp.tenantName) || '';

      // 生成二维码 URL：用外部免费 QR API 渲染小程序端没有库可用）
      let qrUrl = '';
      if (tenantCode) {
        let baseUrl = '';
        try {
          const app = getApp();
          baseUrl = (app.globalData && app.globalData.baseUrl) || config.getBaseUrl();
        } catch (e) {
          baseUrl = config.getBaseUrl();
        }
        const origin = baseUrl.replace(/\/api\/?$/, '');
        const registrationUrl = origin + '/register?tenantCode=' + encodeURIComponent(tenantCode)
          + '&tenantName=' + encodeURIComponent(tenantName);
        qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data='
          + encodeURIComponent(registrationUrl);
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
