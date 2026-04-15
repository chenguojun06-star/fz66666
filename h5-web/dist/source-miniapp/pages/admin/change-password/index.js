const api = require('../../../utils/api');

Page({
  data: {
    pwdForm: { oldPassword: '', newPassword: '', confirmPassword: '' },
    saving: false
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
      return wx.showToast({ title: '请填写所有密码字段', icon: 'none' });
    }
    if (newPassword.length < 6) {
      return wx.showToast({ title: '新密码至少6位', icon: 'none' });
    }
    if (newPassword !== confirmPassword) {
      return wx.showToast({ title: '两次输入的密码不一致', icon: 'none' });
    }
    this.setData({ saving: true });
    try {
      await api.system.changePassword({ oldPassword, newPassword });
      wx.showToast({ title: '密码修改成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (err) {
      wx.showToast({ title: err.message || '修改失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  }
});
