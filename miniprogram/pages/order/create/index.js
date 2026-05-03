var api = require('../../../utils/api');
var { isAdminOrSupervisor } = require('../../../utils/permission');
var { isFactoryOwner } = require('../../../utils/storage');
var { getAuthedImageUrl } = require('../../../utils/fileUrl');

Page({
  data: {
    filteredStyles: [], keyword: '', loading: true
  },

  onLoad: function () {
    if (!isAdminOrSupervisor() && !isFactoryOwner()) {
      wx.showToast({ title: '无下单权限', icon: 'none' });
      return setTimeout(function () { wx.navigateBack(); }, 1500);
    }
    this.loadStyles();
  },

  onPullDownRefresh: function () {
    this.loadStyles().then(function () { wx.stopPullDownRefresh(); });
  },

  /* 加载款式 + 品类中文 dict 映射 */
  loadStyles: function () {
    var self = this;
    var catMap = {};

    this.setData({ loading: true });

    return api.system.getDictList('category')
      .then(function (res) {
        var dictData = Array.isArray(res) ? res : (res && res.data ? res.data : []);
        dictData.forEach(function (d) {
          var v = d.dictValue || d.value || '';
          var l = d.dictLabel || d.label || '';
          if (v) catMap[v] = l;
        });
      })
      .catch(function () {})
      .then(function () {
        return api.style.listStyles({ pageSize: 500, sampleStatus: 'COMPLETED' });
      })
      .then(function (res) {
        var raw = (res && res.records) || (res && res.data && res.data.records) || (res && res.data) || [];
        var list = Array.isArray(raw) ? raw : [];

        list = list.filter(function (s) { return s.sampleStatus === 'COMPLETED'; });

        list.forEach(function (s) {
          s.displayCategory = catMap[s.category] || s.category || '';
          s.displayCover = getAuthedImageUrl(s.cover || '');

          if (s.latestOrderTime) {
            var t = s.latestOrderTime;
            if (typeof t === 'string' && t.indexOf('T') !== -1) t = t.split('T')[0];
            if (typeof t === 'string' && t.length >= 10) t = t.substring(0, 10);
            s.latestOrderDate = t;
          }
          s.orderCount = s.orderCount || 0;
        });

        list.sort(function (a, b) { return (b.orderCount || 0) - (a.orderCount || 0); });

        self._styles = list;
        self.setData({ filteredStyles: list, loading: false });
      })
      .catch(function () {
        self.setData({ loading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  onSearchInput: function (e) {
    var kw = (e.detail.value || '').trim().toLowerCase();
    this.setData({ keyword: kw });
    if (!kw) { this.setData({ filteredStyles: this._styles }); return; }
    var list = (this._styles || []).filter(function (s) {
      return (s.styleNo + '|' + s.styleName + '|' + (s.displayCategory || '')).toLowerCase().indexOf(kw) !== -1;
    });
    this.setData({ filteredStyles: list });
  },

  onSearchClear: function () {
    this.setData({ keyword: '', filteredStyles: this._styles });
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
