const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');

Page({
  data: {
    detail: {},
    loading: false
  },

  onLoad() {
    const app = getApp();
    const raw = app.globalData.rescanData;
    if (!raw) {
      toast.error('数据异常');
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
        progressStage: raw.progressStage || ''
      }
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
      toast.success('退回成功，可重新扫码');
      this._emitRefresh();
      wx.navigateBack();
    } catch (e) {
      this.setData({ loading: false });
      const msg = (e && (e.errMsg || e.message || (e.data && e.data.message))) || '退回失败，请稍后重试';
      wx.showModal({
        title: '退回失败',
        content: String(msg),
        showCancel: false,
        confirmText: '知道了'
      });
    }
  },

  _emitRefresh() {
    const eventBus = getApp().globalData && getApp().globalData.eventBus;
    if (eventBus && typeof eventBus.emit === 'function') {
      eventBus.emit('DATA_REFRESH');
    }
  }
});
