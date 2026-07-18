const api = require('../../../../utils/api');
const { getAuthedImageUrl } = require('../../../../utils/fileUrl');

Page({
  data: {
    loading: true,
    saving: false,
    name: '',
    username: '',
    phone: '',
    avatarUrl: '',
    avatarDisplayUrl: '',
    roleDisplayName: '',
    tenantName: '',
    // 编辑字段
    editPhone: '',
    editAvatarUrl: '',
  },

  onLoad: function () {
    this.loadProfile();
  },

  loadProfile: function () {
    const that = this;
    api.system.getMe().then(function (me) {
      const phone = me.phone || '';
      const avatarUrl = me.avatarUrl || '';
      that.setData({
        loading: false,
        name: me.realName || me.name || me.username || '',
        username: me.username || '',
        phone: phone,
        avatarUrl: avatarUrl,
        avatarDisplayUrl: avatarUrl ? getAuthedImageUrl(avatarUrl) : '',
        roleDisplayName: me.roleName || me.roleDisplayName || '',
        tenantName: me.factoryName || me.tenantName || '',
        editPhone: phone,
        editAvatarUrl: avatarUrl,
      });
    }).catch(function (err) {
      console.warn('[edit-profile] loadProfile failed:', err);
      that.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  onPhoneInput: function (e) {
    this.setData({ editPhone: e.detail.value });
  },

  onChooseAvatar: function () {
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: function (res) {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        that._uploadAvatar(tempFilePath);
      },
    });
  },

  _uploadAvatar: function (filePath) {
    const that = this;
    wx.showLoading({ title: '上传中...' });

    const auth_token = wx.getStorageSync('auth_token') || '';
    const baseUrl = require('../../../../config').getBaseUrl();

    wx.uploadFile({
      url: baseUrl + '/api/file/upload',
      filePath: filePath,
      name: 'file',
      header: { 'Authorization': 'Bearer ' + auth_token },
      success: function (res) {
        wx.hideLoading();
        try {
          const data = JSON.parse(res.data);
          const url = data.data || data.url || data.fileUrl || '';
          if (url) {
            that.setData({
              editAvatarUrl: url,
              avatarDisplayUrl: getAuthedImageUrl(url),
            });
            wx.showToast({ title: '上传成功', icon: 'success' });
          } else {
            wx.showToast({ title: '上传失败', icon: 'none' });
          }
        } catch (e) {
          wx.showToast({ title: '上传失败', icon: 'none' });
        }
      },
      fail: function () {
        wx.hideLoading();
        wx.showToast({ title: '上传失败', icon: 'none' });
      },
    });
  },

  onSave: function () {
    const { editPhone, editAvatarUrl, phone, avatarUrl } = this.data;

    // 检查是否有变更
    const phoneChanged = editPhone !== phone;
    const avatarChanged = editAvatarUrl !== avatarUrl;
    if (!phoneChanged && !avatarChanged) {
      wx.showToast({ title: '没有修改', icon: 'none' });
      return;
    }

    // 手机号格式校验
    if (editPhone && !/^1\d{10}$/.test(editPhone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    this.setData({ saving: true });

    const that = this;
    const patch = {};
    if (phoneChanged) patch.phone = editPhone;
    if (avatarChanged) patch.avatarUrl = editAvatarUrl;

    // 调用 PUT /api/system/user/me
    api.system.updateMe(patch).then(function (res) {
      that.setData({ saving: false });
      // 更新本地缓存
      try {
        const userInfo = wx.getStorageSync('user_info') || {};
        if (patch.phone) userInfo.phone = patch.phone;
        if (patch.avatarUrl) userInfo.avatarUrl = patch.avatarUrl;
        wx.setStorageSync('user_info', userInfo);
      } catch (e) { /* ignore */ }

      wx.showToast({ title: '保存成功', icon: 'success' });

      // 延迟返回上一页，让 toast 显示完
      setTimeout(function () {
        wx.navigateBack();
      }, 800);
    }).catch(function (err) {
      console.warn('[edit-profile] save failed:', err);
      that.setData({ saving: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },
});
