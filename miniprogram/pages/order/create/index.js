var api = require('../../../utils/api');
var { isAdminOrSupervisor } = require('../../../utils/permission');
var { isFactoryOwner } = require('../../../utils/storage');
var { getAuthedImageUrl } = require('../../../utils/fileUrl');

Page({
  onCoverPreview: function (e) {
    var url = e.currentTarget.dataset.url;
    if (url) wx.previewImage({ current: url, urls: [url] });
  },

  data: {
    styles: [], filteredStyles: [], keyword: '', loading: true
  },

  onLoad: function () {
    if (!isAdminOrSupervisor() && !isFactoryOwner()) {
      wx.showToast({ title: '无下单权限', icon: 'none' });
      return setTimeout(function () { wx.navigateBack(); }, 1500);
    }
    this.loadStyles();
  },

  onPullDownRefresh: function () {
    var self = this;
    this.loadStyles().then(function () { wx.stopPullDownRefresh(); });
  },

  loadStyles: function () {
    var self = this;
    this.setData({ loading: true });
    return api.style.listStyles({ pageSize: 500, sampleStatus: 'COMPLETED' })
      .then(function (res) {
        var raw = (res && res.data && res.data.records) || (res && res.records) || (res && res.data) || [];
        var list = Array.isArray(raw) ? raw : [];
        list = list.filter(function (s) { return s.sampleStatus === 'COMPLETED'; });
        list.forEach(function (s) {
          s.displayCategory = s.dictLabel_category || s.category_label || s.category || s.productCategory || '';
          s.displayCover = getAuthedImageUrl(s.cover || '');
        });
        self.setData({ styles: list, filteredStyles: list, loading: false });
      })
      .catch(function () {
        self.setData({ loading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  onSearchInput: function (e) {
    var kw = (e.detail.value || '').trim().toLowerCase();
    this.setData({ keyword: kw });
    if (!kw) { this.setData({ filteredStyles: this.data.styles }); return; }
    var list = this.data.styles.filter(function (s) {
      return (s.styleNo + '|' + s.styleName + '|' + (s.displayCategory || '')).toLowerCase().indexOf(kw) !== -1;
    });
    this.setData({ filteredStyles: list });
  },

  onSearchClear: function () {
    this.setData({ keyword: '', filteredStyles: this.data.styles });
  },

  onStyleTap: function (e) {
    var ds = e.currentTarget.dataset;
    var params = [
      'styleId=' + encodeURIComponent(ds.id || ''),
      'styleNo=' + encodeURIComponent(ds.no || ''),
      'styleName=' + encodeURIComponent(ds.name || ''),
      'colors=' + encodeURIComponent(ds.colors || ''),
      'sizes=' + encodeURIComponent(ds.sizes || ''),
      'category=' + encodeURIComponent(ds.cat || ''),
      'coverImage=' + encodeURIComponent(ds.cover || '')
    ];
    wx.navigateTo({ url: '/pages/order/create/form/index?' + params.join('&') });
  }
});
