var api = require('../../../utils/api');
var { toast, safeNavigate } = require('../../../utils/uiHelper');
var { isAdminOrSupervisor, isFactoryOwner } = require('../../../utils/permission');
var { getAuthedImageUrl } = require('../../../utils/fileUrl');

Page({
  data: {
    activeTab: 'style',

    styleFilteredStyles: [],
    styleKeyword: '',
    styleLoading: true,
    
    _allStyles: [],  // 存储所有款式（用于无资料下单）
    
    // 无资料下单：上传的图片
    noDataUploadedImage: '',

    // 隐私协议
    showPrivacy: false,
  },

  onLoad: function () {
    // 隐私授权监听（wx.chooseMedia 需要隐私协议授权）
    if (wx.onNeedPrivacyAuthorization) {
      this._privacyCb = (resolve) => {
        this._resolvePrivacy = resolve;
        this.setData({ showPrivacy: true });
      };
      wx.onNeedPrivacyAuthorization(this._privacyCb);
    }
    this._initPage();
  },

  onUnload() {
    if (wx.offNeedPrivacyAuthorization && this._privacyCb) {
      wx.offNeedPrivacyAuthorization(this._privacyCb);
    }
  },

  onPrivacyAgree() {
    this.setData({ showPrivacy: false });
    if (this._resolvePrivacy) {
      this._resolvePrivacy({ buttonId: 'agree-btn', event: 'agree' });
    }
  },

  onPrivacyDisagree() {
    this.setData({ showPrivacy: false });
    if (this._resolvePrivacy) {
      this._resolvePrivacy({ buttonId: 'disagree-btn', event: 'disagree' });
    }
  },

  _initPage: function () {
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
        var dictData = Array.isArray(res) ? res : (res && res.data ? res.data : []);
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
        var raw = (res && res.records) || (res && res.data && res.data.records) || (res && res.data) || [];
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

    if (isNoData) {
      params.push('noData=true');
    } else {
      params.push('colors=' + encodeURIComponent(ds.colors || ''));
      params.push('sizes=' + encodeURIComponent(ds.sizes || ''));
      params.push('category=' + encodeURIComponent(ds.cat || ''));
    }

    safeNavigate({ url: '/pages/order/create/form/index?' + params.join('&') }).catch(() => {});
  },

  // 无资料下单：选择图片
  chooseNoDataImage: function () {
    var self = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var tempPath = res.tempFiles[0].tempFilePath;
        console.log('[无资料下单] 选择图片:', tempPath);
        self.setData({ noDataUploadedImage: tempPath });
      },
      fail: function (err) {
        console.error('[无资料下单] 选择图片失败:', err);
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '选择图片失败', icon: 'none' });
        }
      }
    });
  },

  // 无资料下单：删除图片
  deleteNoDataImage: function () {
    this.setData({ noDataUploadedImage: '' });
  },

  // 无资料下单：跳转到订单表单页面
  goToNoDataOrderForm: function () {
    if (!this.data.noDataUploadedImage) {
      toast.error('请先上传款式图片');
      return;
    }

    // 跳转到订单表单页面，传递无资料下单标识和图片路径
    var params = [
      'noData=true',
      'tempImage=' + encodeURIComponent(this.data.noDataUploadedImage)
    ];

    console.log('[无资料下单] 跳转到表单页面:', params.join('&'));
    safeNavigate({ url: '/pages/order/create/form/index?' + params.join('&') }).catch(() => {});
  }
});