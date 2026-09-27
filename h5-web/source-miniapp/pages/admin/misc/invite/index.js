const i18n = require('../../../../utils/i18n/index');

const NS = 'mp.invite.';

const config = require('../../../../config');
const api = require('../../../../utils/api');
const { hasFeaturePermission } = require('../../../../utils/permission');

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

  /** 应用语言 */
  applyLanguage(language) {
    const lang = language || i18n.getLanguage();
    this._lang = lang;
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({
      t: {
        generating: t('generating'),
        scanHint: t('scanHint'),
        qrFailed: t('qrFailed'),
        tapRetry: t('tapRetry'),
        inviteCodeTitle: t('inviteCodeTitle'),
        copy: i18n.t('common.copy', lang),
        pcLinkTitle: t('pcLinkTitle'),
        pcLinkDesc: t('pcLinkDesc'),
        copyLink: t('copyLink'),
        stepsTitle: t('stepsTitle'),
        step1: t('step1'),
        step2: t('step2'),
        step3: t('step3'),
        shareFriend: t('shareFriend'),
      },
    });
    wx.setNavigationBarTitle({ title: t('navTitle') });
  },

  onShow() {
    this.applyLanguage(i18n.getLanguage());
  },

  onLoad() {
    if (!hasFeaturePermission('manage_users') && !hasFeaturePermission('admin')) {
      wx.showToast({ title: i18n.t(NS + 'adminOnly'), icon: 'none' });
      wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/dashboard/index' }) });
      return;
    }
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
      wx.showToast({ title: i18n.t(NS + 'loadFailedRetry', this._lang), icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onCopyTenantCode() {
    const code = this.data.tenantCode;
    if (!code) {
      wx.showToast({ title: i18n.t(NS + 'noInviteCode', this._lang), icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: i18n.t(NS + 'factoryCodeCopied', this._lang), icon: 'success' }),
    });
  },

  onCopyInviteUrl() {
    const code = this.data.tenantCode;
    // ⚠️ 这个 name 会拼进 register 链接的 tenantName 查询参数（提交给 PC 注册页）→ 保持中文，不可键化
    const name = this._tenantName || '工厂';
    if (!code) {
      wx.showToast({ title: i18n.t(NS + 'noInviteCode', this._lang), icon: 'none' });
      return;
    }
    const origin = getFrontendOrigin();
    const url = origin + '/register?tenantCode=' + encodeURIComponent(code)
      + '&tenantName=' + encodeURIComponent(name);
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: i18n.t(NS + 'linkCopied', this._lang), icon: 'success' }),
    });
  },

  onShareAppMessage() {
    const name = this._tenantName || i18n.t(NS + 'factoryWord', this._lang);
    return {
      title: name + i18n.t(NS + 'inviteSuffix', this._lang),
      path: '/pages/login/index?inviteToken=' + encodeURIComponent(this._inviteToken || ''),
    };
  },
});
