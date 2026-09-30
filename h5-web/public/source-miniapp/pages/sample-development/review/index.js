/**
 * 样衣审核页（D-666）
 *
 * 背景：原「样衣详情」的审核入口用 wx.showActionSheet 三选一，选完直接提交——
 *   · 没有写审核评语的地方（_doSampleReview 把 remark 硬编码成空串）
 *   · 没有传照片的地方（workflow-action 的 review 分支根本不读 images）
 * 现改为独立审核页：结论 + 评语 + 现场照片，一次提交。
 *
 * 走的是 PC 端同一条端点 POST /api/style/info/{styleId}/sample-review
 * （style.saveSampleReview），后端本就支持 reviewComment + reviewImages，
 * 且审核通过会自动生成 SKU、推送开发费用账单 —— 手机端此前走
 * /production/pattern/{id}/workflow-action?action=review 完全没有这些副作用。
 */
const i18n = require('../../../utils/i18n/index');
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { decodeParam } = require('../../../utils/urlParams');
const { eventBus } = require('../../../utils/eventBus');

const NS = 'mp.sampleReview.';
const MAX_IMAGES = 5;

Page({
  data: {
    t: {},
    styleId: '',
    styleNo: '',
    styleName: '',
    reviewStatus: 'PASS',
    comment: '',
    images: [],
    _rawImageUrls: [],
    uploading: false,
    submitting: false,
    maxImages: MAX_IMAGES,
    statusOptions: [],
    /** 返修/驳回必须写评语；通过时选填 */
    needComment: false,
  },

  applyLanguage(language) {
    const lang = language || i18n.getLanguage();
    this._lang = lang;
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({
      t: {
        styleLabel: t('styleLabel'),
        nameLabel: t('nameLabel'),
        conclusionLabel: t('conclusionLabel'),
        commentLabel: t('commentLabel'),
        commentPh: t('commentPh'),
        photoLabel: t('photoLabel'),
        photoHint: t('photoHint'),
        selectedPrefix: t('selectedPrefix'),
        selectedSuffix: t('selectedSuffix'),
        addPhoto: t('addPhoto'),
        submitBtn: t('submitBtn'),
        submitting: i18n.t('common.submitting', lang),
      },
      statusOptions: [
        { value: 'PASS', label: t('optPass'), tone: 'pass' },
        { value: 'REWORK', label: t('optRework'), tone: 'rework' },
        { value: 'REJECT', label: t('optReject'), tone: 'reject' },
      ],
    });
    wx.setNavigationBarTitle({ title: t('navTitle') });
  },

  onShow() {
    this.applyLanguage(i18n.getLanguage());
  },

  onLoad(options) {
    const app = getApp();
    if (app.requireAuth && !app.requireAuth()) return;
    this.setData({
      styleId: decodeParam(options.styleId) || '',
      styleNo: decodeParam(options.styleNo) || '',
      styleName: decodeParam(options.styleName) || '',
    });
    if (eventBus && typeof eventBus.on === 'function') {
      this._unsubPrivacy = eventBus.on('showPrivacyDialog', function (resolve) {
        try {
          const dialog = this.selectComponent('#privacyDialog');
          if (dialog && typeof dialog.showDialog === 'function') dialog.showDialog(resolve);
        } catch (_) { /* 隐私弹窗异常忽略 */ }
      }.bind(this));
    }
  },

  onUnload() {
    if (this._unsubPrivacy) {
      try { this._unsubPrivacy(); } catch (_) { /* 取消订阅异常忽略 */ }
      this._unsubPrivacy = null;
    }
  },

  /** 选择审核结论 */
  onPickStatus(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ reviewStatus: value, needComment: value !== 'PASS' });
  },

  onCommentInput(e) {
    this.setData({ comment: e.detail.value });
  },

  /** 拍照 / 从相册选图（wx.chooseImage 已废弃，必须用 wx.chooseMedia） */
  onChooseImage() {
    const that = this;
    if (this.data.images.length >= MAX_IMAGES) {
      toast(i18n.t(NS + 'maxImages', this._lang));
      return;
    }
    wx.chooseMedia({
      count: MAX_IMAGES - this.data.images.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        that._doUploadImages(res.tempFiles || []);
      },
      fail: function (err) {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showModal({
            title: i18n.t(NS + 'permTitle', that._lang),
            content: i18n.t(NS + 'permContent', that._lang),
            confirmText: i18n.t(NS + 'goSettings', that._lang),
            cancelText: i18n.t('common.cancel', that._lang),
            success: function (modalRes) {
              if (modalRes.confirm) wx.openSetting({ success: function () {} });
            },
          });
        }
      },
    });
  },

  /** 逐张上传，拿到后端 URL；预览用带 token 的地址，提交用原始 URL */
  _doUploadImages(files) {
    if (!files || files.length === 0) return;
    const that = this;
    that.setData({ uploading: true });
    Promise.all(files.map(function (f) {
      return api.common.uploadImage(f.tempFilePath);
    })).then(function (urls) {
      const rawUrls = (urls || []).filter(Boolean);
      that.setData({
        images: that.data.images.concat(rawUrls.map(function (u) { return getAuthedImageUrl(u); })),
        _rawImageUrls: (that.data._rawImageUrls || []).concat(rawUrls),
        uploading: false,
      });
    }).catch(function () {
      that.setData({ uploading: false });
      toast(i18n.t(NS + 'imageUploadFailed', that._lang));
    });
  },

  onDeleteImage(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const imgs = this.data.images.slice();
    const raws = (this.data._rawImageUrls || []).slice();
    imgs.splice(idx, 1);
    raws.splice(idx, 1);
    this.setData({ images: imgs, _rawImageUrls: raws });
  },

  onPreviewImage(e) {
    wx.previewImage({ current: e.currentTarget.dataset.url, urls: this.data.images });
  },

  /** 提交前校验 + 二次确认（审核通过会推送开发费用账单，必须确认） */
  onSubmit() {
    const lang = this._lang;
    const status = this.data.reviewStatus;
    const comment = String(this.data.comment || '').trim();
    if (!status) {
      toast(i18n.t(NS + 'conclusionRequired', lang));
      return;
    }
    if (status !== 'PASS' && !comment) {
      toast(i18n.t(NS + 'commentRequired', lang));
      return;
    }
    if (this.data.uploading) {
      toast(i18n.t('common.uploading', lang));
      return;
    }
    if (!this.data.styleId) {
      toast(i18n.t(NS + 'missingStyleInfo', lang));
      return;
    }
    const opt = (this.data.statusOptions || []).find(function (o) { return o.value === status; }) || {};
    const that = this;
    wx.showModal({
      title: i18n.t(NS + 'confirmTitle', lang),
      content: i18n.t(NS + 'confirmConclPrefix', lang) + (opt.label || '')
        + (comment ? i18n.t(NS + 'confirmCommentPrefix', lang) + comment : ''),
      confirmText: i18n.t('common.submit', lang),
      cancelText: i18n.t('common.cancel', lang),
      success: function (res) {
        if (!res.confirm) return;
        that._doSubmit(status, comment);
      },
    });
  },

  _doSubmit(status, comment) {
    const that = this;
    const lang = this._lang;
    this.setData({ submitting: true });
    wx.showLoading({ title: i18n.t('common.submitting', lang), mask: true });
    api.style.saveSampleReview(this.data.styleId, {
      reviewStatus: status,
      reviewComment: comment,
      reviewImages: this.data._rawImageUrls || [],
    }).then(function () {
      wx.hideLoading();
      that.setData({ submitting: false });
      wx.showToast({ title: i18n.t(NS + 'submitOk', lang), icon: 'success' });
      setTimeout(function () { wx.navigateBack(); }, 800);
    }).catch(function (err) {
      wx.hideLoading();
      that.setData({ submitting: false });
      // ok() 抛的是 { type, code, errMsg, resp }，没有 message 字段
      wx.showToast({
        title: (err && (err.errMsg || err.message)) || i18n.t(NS + 'submitFail', lang),
        icon: 'none',
      });
    });
  },
});
