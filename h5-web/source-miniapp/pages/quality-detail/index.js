const { getAuthedImageUrl } = require('../../utils/fileUrl');
const { bindPageEvents, unbindPageEvents } = require('../../utils/pageEventBinder');
const Display = require('../../utils/displayHelper');

const SCAN_MODE_MAP = {
  ucode: 'U编码',
  bundle: '菲号',
};

Page({
  data: {
    detail: null,
    images: [],
  },

  onLoad: function (options) {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;

    if (options.data) {
      try {
        const detail = JSON.parse(decodeURIComponent(options.data));
        this._processDetail(detail);
        this.setData({ detail: detail });
      } catch (e) {
        console.error('[QualityDetail] parse data error:', e);
      }
    }
    bindPageEvents(this, () => {}, ['QUALITY_CHECKED', 'QUALITY_REPAIRED']);
  },

  onUnload: function () {
    unbindPageEvents(this);
  },

  _processDetail: function (d) {
    const statusInfo = Display.displayQualityStatus(d.qualityStatus);
    d._statusText = statusInfo.text;
    d._statusColor = statusInfo.color;

    d.defectCategoryText = Display.displayDefectCategory(d.defectCategory);
    d.scanModeText = d.scanMode ? (SCAN_MODE_MAP[d.scanMode] || '未知') : '';
    d.createTimeText = Display.formatDateTime(d.createTime);

    if (d.unqualifiedImageUrls) {
      try {
        const urls = typeof d.unqualifiedImageUrls === 'string'
          ? JSON.parse(d.unqualifiedImageUrls)
          : d.unqualifiedImageUrls;
        d.imageList = urls.filter(Boolean).map(function (u) {
          return getAuthedImageUrl(u);
        });
      } catch (_) {
        d.imageList = [];
      }
    } else {
      d.imageList = [];
    }
  },

  onPreviewImage: function (e) {
    const url = e.currentTarget.dataset.url;
    const urls = e.currentTarget.dataset.urls;
    wx.previewImage({ current: url, urls: urls || [url] });
  },
});
