const i18n = require('../../../../utils/i18n/index');

const NS = 'mp.changePassword.';

const api = require('../../../../utils/api');

Page({
  data: {
    pwdForm: { oldPassword: '', newPassword: '', confirmPassword: '' },
    saving: false,
    t: {},
  },

  /** 应用语言 */
  applyLanguage(language) {
    const lang = language || i18n.getLanguage();
    this._lang = lang;
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({
      t: {
        securityHint: t('securityHint'),
        oldPwdLabel: t('oldPwdLabel'),
        oldPwdPlaceholder: t('oldPwdPlaceholder'),
        newPwdLabel: t('newPwdLabel'),
        newPwdPlaceholder: t('newPwdPlaceholder'),
        confirmPwdLabel: t('confirmPwdLabel'),
        confirmPwdPlaceholder: t('confirmPwdPlaceholder'),
        submitting: t('submitting'),
        confirmBtn: t('confirmBtn'),
      },
    });
    wx.setNavigationBarTitle({ title: t('navTitle') });
  },

  onShow() {
    this.applyLanguage(i18n.getLanguage());
  },

  onOldPwdInput(e) {
    this.setData({ 'pwdForm.oldPassword': e.detail.value });
  },

  onNewPwdInput(e) {
    this.setData({ 'pwdForm.newPassword': e.detail.value });
  },

  onConfirmPwdInput(e) {
    this.setData({ 'pwdForm.confirmPassword': e.detail.value });
  },

  async onSubmit() {
    const { oldPassword, newPassword, confirmPassword } = this.data.pwdForm;
    if (!oldPassword || !newPassword || !confirmPassword) {
      return wx.showToast({ title: i18n.t(NS + 'allFieldsRequired', this._lang), icon: 'none' });
    }
    if (newPassword.length < 6) {
      return wx.showToast({ title: i18n.t(NS + 'pwdMinLength', this._lang), icon: 'none' });
    }
    if (!/[a-zA-Z]/.test(newPassword)) {
      return wx.showToast({ title: i18n.t(NS + 'pwdNeedLetter', this._lang), icon: 'none' });
    }
    if (!/[0-9]/.test(newPassword)) {
      return wx.showToast({ title: i18n.t(NS + 'pwdNeedDigit', this._lang), icon: 'none' });
    }
    if (newPassword !== confirmPassword) {
      return wx.showToast({ title: i18n.t(NS + 'pwdMismatch', this._lang), icon: 'none' });
    }
    this.setData({ saving: true });
    try {
      await api.system.changePassword({ oldPassword, newPassword });
      wx.showToast({ title: i18n.t(NS + 'pwdChanged', this._lang), icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (err) {
      wx.showToast({ title: err.message || i18n.t(NS + 'changeFailed', this._lang), icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
});
