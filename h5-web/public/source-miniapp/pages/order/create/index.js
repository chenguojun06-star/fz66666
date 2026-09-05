var api = require('../../../utils/api');
var { safeNavigate } = require('../../../utils/uiHelper');
var { isAdminOrSupervisor, isFactoryOwner } = require('../../../utils/permission');
var { getAuthedImageUrl } = require('../../../utils/fileUrl');

Page({
  data: {
    activeTab: 'style',

    styleFilteredStyles: [],
    styleKeyword: '',
    styleLoading: true,

    _allStyles: [],  // 存储所有款式（用于无资料下单）

    // D-291：无资料下单的"上传图片"路径已下线——
    // 入口直达表单页（no-data-create → form?noData=true），款式图在表单页内选填上传。
    // 本页 noData tab 只保留"从已有款式下单"列表。
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
    console.log('[下单管理] 切换标签页:', tab);
    this.setData({ activeTab: tab, styleKeyword: '' });
    this.loadStyles();
  },

  loadStyles: function () {
    var self = this;
    var catMap = {};
    var isNoData = self.data.activeTab === 'noData';

    console.log('[下单管理] 加载款式列表, 当前标签:', self.data.activeTab, '是否无资料:', isNoData);
    self.setData({ styleLoading: true });

    return api.system.getDictList('category')
      .then(function (res) {
        // 兼容分页结构 {records:[...]} 和数组 [...]
        var dictData = Array.isArray(res) ? res : (res && res.records) || [];
        dictData.forEach(function (d) {
          var v = d.dictValue || d.value || '';
          var l = d.dictLabel || d.label || '';
          if (v) catMap[v] = l;
        });
      })
      .catch(function () {})
      .then(function () {
        // 无资料下单：获取所有款式
        // 款式下单：只获取已完成的样衣
        var params = { pageSize: 500 };
        if (!isNoData) params.sampleStatus = 'COMPLETED';
        console.log('[下单管理] API请求参数:', params);
        return api.style.listStyles(params);
      })
      .then(function (res) {
        var raw = (res && res.records) || (Array.isArray(res) ? res : []) || [];
        var list = Array.isArray(raw) ? raw : [];

        console.log('[下单管理] 原始数据数量:', list.length);

        // 款式下单：再次过滤确保只显示已完成的样衣
        if (!isNoData) {
          list = list.filter(function (s) { return s.sampleStatus === 'COMPLETED'; });
          console.log('[下单管理] 过滤后数量(只保留已完成):', list.length);
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

        // 根据当前标签页存储数据
        if (isNoData) {
          self._allStyles = list;  // 无资料下单：存储所有款式
          console.log('[下单管理] 存储到 _allStyles, 数量:', list.length);
        } else {
          self._styles = list;  // 款式下单：存储已完成的样衣
          console.log('[下单管理] 存储到 _styles, 数量:', list.length);
        }
        
        self.setData({ styleFilteredStyles: list, styleLoading: false });
      })
      .catch(function (err) {
        console.error('[下单管理] 加载失败:', err);
        self.setData({ styleLoading: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  onStyleSearchInput: function (e) {
    var kw = (e.detail.value || '').trim().toLowerCase();
    var isNoData = this.data.activeTab === 'noData';
    var sourceList = isNoData ? this._allStyles : this._styles;
    
    this.setData({ styleKeyword: kw });
    if (!kw) { 
      this.setData({ styleFilteredStyles: sourceList }); 
      return; 
    }
    var list = (sourceList || []).filter(function (s) {
      return (s.styleNo + '|' + s.styleName + '|' + (s.displayCategory || '')).toLowerCase().indexOf(kw) !== -1;
    });
    this.setData({ styleFilteredStyles: list });
  },

  onStyleSearchClear: function () {
    var isNoData = this.data.activeTab === 'noData';
    var sourceList = isNoData ? this._allStyles : this._styles;
    this.setData({ styleKeyword: '', styleFilteredStyles: sourceList });
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

    // 品类两种下单都传：无资料下单同样需要带出款式品类，避免落到字典第一项
    params.push('category=' + encodeURIComponent(ds.cat || ''));

    if (isNoData) {
      params.push('noData=true');
    } else {
      params.push('colors=' + encodeURIComponent(ds.colors || ''));
      params.push('sizes=' + encodeURIComponent(ds.sizes || ''));
    }

    safeNavigate({ url: '/pages/order/create/form/index?' + params.join('&') }).catch(() => {});
  },

  // 空白无资料下单：直达表单页（无需款式/图片，款式图在表单内选填）
  goNoDataOrderForm: function () {
    safeNavigate({ url: '/pages/order/create/form/index?noData=true' }).catch(function () {});
  },
});