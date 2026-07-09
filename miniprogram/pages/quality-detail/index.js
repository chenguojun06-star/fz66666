const { getAuthedImageUrl } = require('../../utils/fileUrl');
const { bindPageEvents, unbindPageEvents } = require('../../utils/pageEventBinder');

const DEFECT_CATEGORY_MAP = {
  appearance_integrity: '外观完整性问题',
  size_accuracy: '尺寸精度问题',
  process_compliance: '工艺规范性问题',
  functional_effectiveness: '功能有效性问题',
  other: '其他问题',
};

const QUALITY_STATUS_MAP = {
  qualified: '合格',
  unqualified: '不合格',
  repaired: '返修完成',
};

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
    // 数据来自导航参数快照，无 API 可刷新；订阅事件以便未来扩展
    bindPageEvents(this, () => {}, ['QUALITY_CHECKED', 'QUALITY_REPAIRED']);
  },

  onUnload: function () {
    unbindPageEvents(this);
  },

  _processDetail: function (d) {
    d.defectCategoryText = d.defectCategory ? (DEFECT_CATEGORY_MAP[d.defectCategory] || '未知') : '';
    d.qualityStatusText = d.qualityStatus ? (QUALITY_STATUS_MAP[d.qualityStatus] || '未知') : '';
    d.scanModeText = d.scanMode ? (SCAN_MODE_MAP[d.scanMode] || '未知') : '';

    if (d.createTime) {
      d.createTimeText = this._formatTime(d.createTime);
    }

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

  _formatTime: function (t) {
    if (!t) return '';
    // iOS 不支持 "yyyy-MM-dd HH:mm:ss"，需将空格替换为 T 兼容 ISO 8601
    const normalized = typeof t === 'string' ? t.replace(' ', 'T') : t;
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return t;
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const h = d.getHours();
    const min = d.getMinutes();
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day) + ' ' + (h < 10 ? '0' + h : h) + ':' + (min < 10 ? '0' + min : min);
  },

  onPreviewImage: function (e) {
    const url = e.currentTarget.dataset.url;
    const urls = e.currentTarget.dataset.urls;
    wx.previewImage({ current: url, urls: urls || [url] });
  },
});
