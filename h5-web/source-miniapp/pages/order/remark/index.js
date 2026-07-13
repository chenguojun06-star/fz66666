const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { getUserInfo } = require('../../../utils/storage');
const { eventBus } = require('../../../utils/eventBus');

Page({
  data: {
    targetType: 'order',
    targetNo: '',
    remarks: [],
    loading: false,
    submitting: false,
    content: '',
    authorName: '',
    authorRole: '',
    images: [],
    _rawImageUrls: [],
    uploading: false,
  },

  onLoad: function (options) {
    const app = getApp();
    if (app.requireAuth && !app.requireAuth()) return;
    const targetType = options.targetType || 'order';
    const targetNo = options.targetNo || '';
    if (!targetNo) {
      toast('参数错误');
      wx.navigateBack();
      return;
    }
    const userInfo = getUserInfo() || {};
    this.setData({
      targetType: targetType,
      targetNo: targetNo,
      authorName: userInfo.name || userInfo.username || '',
      authorRole: userInfo.roleName || '',
    });
    if (eventBus && typeof eventBus.on === 'function') {
      this._unsubPrivacy = eventBus.on('showPrivacyDialog', function (resolve) {
        try {
          const dialog = this.selectComponent('#privacyDialog');
          if (dialog && typeof dialog.showDialog === 'function') dialog.showDialog(resolve);
        } catch (_) {}
      }.bind(this));
    }
    this._loadRemarks();
  },

  onUnload: function () {
    if (this._unsubPrivacy) {
      try { this._unsubPrivacy(); } catch (_) {}
      this._unsubPrivacy = null;
    }
  },

  onPullDownRefresh: function () {
    const that = this;
    this._loadRemarks().finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  _loadRemarks: function () {
    const that = this;
    this.setData({ loading: true });
    return api.production.listOrderRemarks(this.data.targetType, this.data.targetNo)
      .then(function (list) {
        const allRemarks = (Array.isArray(list) ? list : []).map(function (r) {
          if (r.imageUrls) {
            try {
              r.imageList = JSON.parse(r.imageUrls).map(function (u) { return getAuthedImageUrl(u); });
            } catch (e) { r.imageList = []; }
          } else {
            r.imageList = [];
          }
          if (r.createTime) {
            r.timeDisplay = r.createTime.replace('T', ' ').substring(0, 16);
          }
          return r;
        });

        const USER_ROLES = new Set(['', null, undefined]);
        const SYSTEM_ROLES = new Set(['快速备注', '历史备注', 'AI巡检', '采购备注', '样衣审核', '制单退回', '纸样退回']);

        const userRemarks = allRemarks.filter(function (r) {
          return USER_ROLES.has(r.authorRole);
        });

        const systemLogs = allRemarks.filter(function (r) {
          return SYSTEM_ROLES.has(r.authorRole);
        });

        that.setData({
          userRemarks: userRemarks,
          systemLogs: systemLogs,
          loading: false,
        });
      })
      .catch(function () {
        that.setData({ userRemarks: [], systemLogs: [], loading: false });
      });
  },

  onContentInput: function (e) { this.setData({ content: e.detail.value }); },

  onChooseImage: function () {
    const that = this;
    if (this.data.images.length >= 5) { toast('最多上传5张图片'); return; }
    wx.chooseMedia({
      count: 5 - this.data.images.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        const files = res.tempFiles || [];
        that._doUploadImages(files);
      },
      fail: function (err) {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showModal({
            title: '相机/相册权限',
            content: '需要相机或相册权限才能上传照片，请在设置中允许',
            confirmText: '去设置',
            cancelText: '取消',
            success: function (modalRes) {
              if (modalRes.confirm) wx.openSetting({ success: function () {} });
            },
          });
        }
      },
    });
  },

  _doUploadImages: function (files) {
    if (files.length === 0) return;
    const that = this;
    that.setData({ uploading: true });
    const tasks = files.map(function (f) {
      return api.common.uploadImage(f.tempFilePath);
    });
    Promise.all(tasks).then(function (urls) {
      const rawUrls = urls.filter(Boolean);
      const authedUrls = rawUrls.map(function (u) { return getAuthedImageUrl(u); });
      that.setData({
        images: that.data.images.concat(authedUrls),
        _rawImageUrls: (that.data._rawImageUrls || []).concat(rawUrls),
        uploading: false,
      });
    }).catch(function () {
      that.setData({ uploading: false });
      toast('图片上传失败');
    });
  },

  onDeleteImage: function (e) {
    const idx = e.currentTarget.dataset.index;
    const imgs = this.data.images.slice();
    const raws = (this.data._rawImageUrls || []).slice();
    imgs.splice(idx, 1);
    raws.splice(idx, 1);
    this.setData({ images: imgs, _rawImageUrls: raws });
  },

  onPreviewImage: function (e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({ current: url, urls: this.data.images });
  },

  onPreviewRemarkImage: function (e) {
    const url = e.currentTarget.dataset.url;
    const urls = e.currentTarget.dataset.urls;
    wx.previewImage({ current: url, urls: urls || [url] });
  },

  onSubmitRemark: function () {
    const content = this.data.content.trim();
    const images = this.data._rawImageUrls || [];
    if (!content && images.length === 0) { toast('请输入备注内容或上传图片'); return; }
    const that = this;
    this.setData({ submitting: true });
    const imageUrlsStr = images.length > 0 ? JSON.stringify(images) : undefined;
    api.production.addOrderRemark(
      this.data.targetType,
      this.data.targetNo,
      content || '(图片备注)',
      this.data.authorRole.trim() || undefined,
      imageUrlsStr,
    ).then(function () {
      toast('备注已添加');
      that.setData({ content: '', images: [], _rawImageUrls: [] });
      that._loadRemarks();
    }).catch(function () {
      toast('添加备注失败');
    }).finally(function () {
      that.setData({ submitting: false });
    });
  },
});
