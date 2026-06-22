const api = require('../../../../utils/api');
const { toast } = require('../../../../utils/uiHelper');

Page({
  data: {
    pwdForm: { oldPassword: '', newPassword: '', confirmPassword: '' },
    saving: false,
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
      return toast.error('请填写所有密码字段');
    }
    if (newPassword.length < 6) {
      return toast.error('新密码至少6位');
    }
    if (newPassword !== confirmPassword) {
      return toast.error('两次输入的密码不一致');
    }
    this.setData({ saving: true });
    try {
      await api.system.changePassword({ oldPassword, newPassword });
      toast.success('密码修改成功');
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (err) {
      toast.error(err.message || '修改失败');
    } finally {
      this.setData({ saving: false });
    }
  },
});
