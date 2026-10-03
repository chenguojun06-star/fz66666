const i18n = require('../../../utils/i18n/index');

const NS = 'mp.orderRemark.';

const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { getUserInfo } = require('../../../utils/storage');
const { eventBus } = require('../../../utils/eventBus');
const { decodeParam } = require('../../../utils/urlParams');

Page({
  data: {
    targetType: 'order',
    targetNo: '',
    remarks: [],
    t: {},
    loading: false,
    submitting: false,
    content: '',
    authorName: '',
    authorRole: '',
    images: [],
    _rawImageUrls: [],
    uploading: false,
  },

  /** 应用语言 */
  applyLanguage(language) {
    const lang = language || i18n.getLanguage();
    this._lang = lang;
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({
      t: {
        contentLabel: t('contentLabel'),
        contentPlaceholder: t('contentPlaceholder'),
        selectedImagesPrefix: t('selectedImagesPrefix'),
        selectedImagesSuffix: t('selectedImagesSuffix'),
        takePhotoBtn: t('takePhotoBtn'),
        submitting: t('submitting'),
        submitBtn: t('submitBtn'),
        recordsTitle: t('recordsTitle'),
        anonymous: t('anonymous'),
        emptyRecords: t('emptyRecords'),
        loading: i18n.t('common.loading', lang),
      },
    });
    wx.setNavigationBarTitle({ title: t('navTitle') });
  },

  onShow() {
    this.applyLanguage(i18n.getLanguage());
  },

  onLoad: function (options) {
    const app = getApp();
    if (app.requireAuth && !app.requireAuth()) return;
    const targetType = options.targetType || 'order';
    const targetNo = decodeParam(options.targetNo);
    if (!targetNo) {
      toast(i18n.t(NS + 'paramError', this._lang));
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
        } catch (_) { /* 隐私弹窗异常忽略 */ }
      }.bind(this));
    }
    this._loadRemarks();
  },

  onUnload: function () {
    if (this._unsubPrivacy) {
      try { this._unsubPrivacy(); } catch (_) { /* 取消订阅异常忽略 */ }
      this._unsubPrivacy = null;
    }
  },

  onPullDownRefresh: function () {
    this._loadRemarks().finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  _loadRemarks: function () {
    const that = this;
    this.setData({ loading: true });
    return api.production.listOrderRemarks(this.data.targetType, this.data.targetNo)
      .then(function (list) {
        const remarks = (Array.isArray(list) ? list : []).map(function (r) {
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
    const that = this;
    if (this.data.images.length >= 5) { toast(i18n.t(NS + 'maxImages', this._lang)); return; }
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
            title: i18n.t(NS + 'permTitle', this._lang),
            content: i18n.t(NS + 'permContent', this._lang),
            confirmText: i18n.t(NS + 'goSettings', this._lang),
            cancelText: i18n.t('common.cancel', this._lang),
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
      toast(i18n.t(NS + 'imageUploadFailed', i18n.getLanguage()));
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
    if (!content && images.length === 0) { toast(i18n.t(NS + 'emptyRemark', this._lang)); return; }
    const that = this;
    this.setData({ submitting: true });
    const imageUrlsStr = images.length > 0 ? JSON.stringify(images) : undefined;
    api.production.addOrderRemark(
      this.data.targetType,
      this.data.targetNo,
      // ⚠️ 这是**提交后端的备注内容**（addOrderRemark 的 content 参数），不是界面文案，保持中文
      content || '(图片备注)',
      this.data.authorRole.trim() || undefined,
      imageUrlsStr,
    ).then(function () {
      toast(i18n.t(NS + 'remarkAdded', i18n.getLanguage()));
      that.setData({ content: '', images: [], _rawImageUrls: [] });
      that._loadRemarks();
    }).catch(function () {
      toast(i18n.t(NS + 'remarkFailed', i18n.getLanguage()));
    }).finally(function () {
      that.setData({ submitting: false });
    });
  },
});
