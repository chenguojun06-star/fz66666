var api = require('../../../utils/api');
var { toast } = require('../../../utils/uiHelper');
var { getAuthedImageUrl } = require('../../../utils/fileUrl');
var { getUserInfo } = require('../../../utils/storage');
var { eventBus } = require('../../../utils/eventBus');

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
    var app = getApp();
    if (app.requireAuth && !app.requireAuth()) return;
    var targetType = options.targetType || 'order';
    var targetNo = options.targetNo || '';
    if (!targetNo) {
      toast('参数错误');
      wx.navigateBack();
      return;
    }
    var userInfo = getUserInfo() || {};
    this.setData({
      targetType: targetType,
      targetNo: targetNo,
      authorName: userInfo.name || userInfo.username || '',
      authorRole: userInfo.roleName || '',
    });
    if (eventBus && typeof eventBus.on === 'function') {
      this._unsubPrivacy = eventBus.on('showPrivacyDialog', function (resolve) {
        try {
          var dialog = this.selectComponent('#privacyDialog');
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
    var that = this;
    this._loadRemarks().finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  _loadRemarks: function () {
    var that = this;
    this.setData({ loading: true });
    return api.production.listOrderRemarks(this.data.targetType, this.data.targetNo)
      .then(function (list) {
        var remarks = (Array.isArray(list) ? list : []).map(function (r) {
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
        that.setData({ remarks: remarks, loading: false });
      })
      .catch(function () {
        that.setData({ remarks: [], loading: false });
      });
  },

  onContentInput: function (e) { this.setData({ content: e.detail.value }); },

  onChooseImage: function () {
    var that = this;
    if (this.data.images.length >= 5) { toast('最多上传5张图片'); return; }
    wx.chooseMedia({
      count: 5 - this.data.images.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var files = res.tempFiles || [];
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
            }
          });
        }
      }
    });
  },

  _doUploadImages: function (files) {
    if (files.length === 0) return;
    var that = this;
    that.setData({ uploading: true });
    var tasks = files.map(function (f) {
      return api.common.uploadImage(f.tempFilePath);
    });
    Promise.all(tasks).then(function (urls) {
      var rawUrls = urls.filter(Boolean);
      var authedUrls = rawUrls.map(function (u) { return getAuthedImageUrl(u); });
      that.setData({
        images: that.data.images.concat(authedUrls),
        _rawImageUrls: (that.data._rawImageUrls || []).concat(rawUrls),
        uploading: false
      });
    }).catch(function () {
      that.setData({ uploading: false });
      toast('图片上传失败');
    });
  },

  onDeleteImage: function (e) {
    var idx = e.currentTarget.dataset.index;
    var imgs = this.data.images.slice();
    var raws = (this.data._rawImageUrls || []).slice();
    imgs.splice(idx, 1);
    raws.splice(idx, 1);
    this.setData({ images: imgs, _rawImageUrls: raws });
  },

  onPreviewImage: function (e) {
    var url = e.currentTarget.dataset.url;
    wx.previewImage({ current: url, urls: this.data.images });
  },

  onPreviewRemarkImage: function (e) {
    var url = e.currentTarget.dataset.url;
    var urls = e.currentTarget.dataset.urls;
    wx.previewImage({ current: url, urls: urls || [url] });
  },

  onSubmitRemark: function () {
    var content = this.data.content.trim();
    var images = this.data._rawImageUrls || [];
    if (!content && images.length === 0) { toast('请输入备注内容或上传图片'); return; }
    var that = this;
    this.setData({ submitting: true });
    var imageUrlsStr = images.length > 0 ? JSON.stringify(images) : undefined;
    api.production.addOrderRemark(
      this.data.targetType,
      this.data.targetNo,
      content || '(图片备注)',
      this.data.authorRole.trim() || undefined,
      imageUrlsStr
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
