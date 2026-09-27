const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { triggerDataRefresh } = require('../../../utils/eventBus');
const i18n = require('../../../utils/i18n/index');

const NS = 'mp.scanRescan.';

Page({
  data: {
    detail: {},
    loading: false,
    t: {},
  },

  /** 应用语言（每次回页重刷，用户可能在别处切了语言） */
  applyLanguage(language) {
    const lang = language || i18n.getLanguage();
    // ⚠️ JS 层（toast / showModal）拿不到 data.t，必须靠 this._lang
    this._lang = lang;
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({
      t: {
        styleNoLabel: t('styleNoLabel'),
        scanRecordWord: t('scanRecordWord'),
        orderNoLabel: t('orderNoLabel'),
        bundleNoLabel: t('bundleNoLabel'),
        qtyLabel: t('qtyLabel'),
        scanTimeLabel: t('scanTimeLabel'),
        processLabel: t('processLabel'),
        confirmTitle: t('confirmTitle'),
        confirmDesc: t('confirmDesc'),
        rescanning: t('rescanning'),
        confirmBtn: t('confirmBtn'),
        // 跨页共用词条
        cancel: i18n.t('common.cancel', lang),
        piece: i18n.t('common.piece', lang),
      },
    });
    wx.setNavigationBarTitle({ title: t('navTitle') });
  },

  onShow() {
    this.applyLanguage(i18n.getLanguage());
  },

  onLoad() {
    const app = getApp();
    const raw = app.globalData.rescanData;
    if (!raw) {
      toast.error(i18n.t(NS + 'dataError'));
      wx.navigateBack();
      return;
    }
    this.setData({
      detail: {
        recordId: raw.recordId || '',
        orderNo: raw.orderNo || '-',
        bundleNo: raw.bundleNo || '-',
        quantity: raw.quantity || 0,
        scanTime: raw.scanTime || '-',
        coverImage: getAuthedImageUrl(raw.coverImage || ''),
        styleNo: raw.styleNo || '',
        styleName: raw.styleName || '',
        processName: raw.processName || '',
        progressStage: raw.progressStage || '',
      },
    });
  },

  onUnload() {
    getApp().globalData.rescanData = null;
  },

  previewImage() {
    const img = this.data.detail.coverImage;
    if (!img) return;
    wx.previewImage({ current: img, urls: [img] });
  },

  goBack() {
    wx.navigateBack();
  },

  async confirmRescan() {
    if (this.data.loading || !this.data.detail.recordId) return;
    this.setData({ loading: true });
    try {
      await api.production.rescan({ recordId: this.data.detail.recordId });
      toast.success(i18n.t(NS + 'rescanSuccess', this._lang));
      this._emitRefresh();
      wx.navigateBack();
    } catch (e) {
      this.setData({ loading: false });
      const msg = (e && (e.errMsg || e.message || (e.data && e.data.message)))
        || i18n.t(NS + 'rescanFailedRetry', this._lang);
      wx.showModal({
        title: i18n.t(NS + 'rescanFailed', this._lang),
        content: String(msg),
        showCancel: false,
        confirmText: i18n.t('common.gotIt', this._lang),
      });
    }
  },

  _emitRefresh() {
    triggerDataRefresh('scan');
  },
});
