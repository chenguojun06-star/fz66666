var api = require('../../../utils/api');
var { toast } = require('../../../utils/uiHelper');
var { isAdminOrSupervisor, isFactoryOwner } = require('../../../utils/permission');
var { getAuthedImageUrl } = require('../../../utils/fileUrl');

Page({
  data: {
    activeTab: 'style',

    styleFilteredStyles: [],
    styleKeyword: '',
    styleLoading: true,
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

  switchTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab, styleKeyword: '' });
    this.loadStyles();
  },

  loadStyles: function () {
    var self = this;
    var catMap = {};
    var isNoData = self.data.activeTab === 'noData';

    self.setData({ styleLoading: true });

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
        var params = { pageSize: 500 };
        if (!isNoData) params.sampleStatus = 'COMPLETED';
        return api.style.listStyles(params);
      })
      .then(function (res) {
        var raw = (res && res.records) || (res && res.data && res.data.records) || (res && res.data) || [];
        var list = Array.isArray(raw) ? raw : [];

        if (!isNoData) {
          list = list.filter(function (s) { return s.sampleStatus === 'COMPLETED'; });
        }

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
        self.setData({ styleFilteredStyles: list, styleLoading: false });
      })
      .catch(function () {
        self.setData({ styleLoading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  onStyleSearchInput: function (e) {
    var kw = (e.detail.value || '').trim().toLowerCase();
    this.setData({ styleKeyword: kw });
    if (!kw) { this.setData({ styleFilteredStyles: this._styles }); return; }
    var list = (this._styles || []).filter(function (s) {
      return (s.styleNo + '|' + s.styleName + '|' + (s.displayCategory || '')).toLowerCase().indexOf(kw) !== -1;
    });
    this.setData({ styleFilteredStyles: list });
  },

  onStyleSearchClear: function () {
    this.setData({ styleKeyword: '', styleFilteredStyles: this._styles });
  },

  onStyleTap: function (e) {
    var ds = e.currentTarget.dataset;
    var isNoData = this.data.activeTab === 'noData';

    var params = [
      'styleId=' + encodeURIComponent(ds.id || ''),
      'styleNo=' + encodeURIComponent(ds.no || ''),
      'styleName=' + encodeURIComponent(ds.name || ''),
      'coverImage=' + encodeURIComponent(ds.cover || '')
    ];

    if (isNoData) {
      params.push('noData=true');
    } else {
      params.push('colors=' + encodeURIComponent(ds.colors || ''));
      params.push('sizes=' + encodeURIComponent(ds.sizes || ''));
      params.push('category=' + encodeURIComponent(ds.cat || ''));
    }

    wx.navigateTo({ url: '/pages/order/create/form/index?' + params.join('&') });
  }
});