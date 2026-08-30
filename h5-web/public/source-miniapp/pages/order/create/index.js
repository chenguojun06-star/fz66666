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

  // 无资料下单：选择图片
  // ★ 必须用 wx.chooseMedia：wx.chooseImage 自基础库 2.21.0 起已弃用，
  //   新版开发者工具/真机调试下点击无反应（与全站其他 7 处选图入口保持一致）
  // ★ fail 三分支处理：cancel 静默 / 权限被拒引导去设置 / 其他自动降级 chooseImage 重试
  //   （真机调试模式下 chooseMedia 有已知兼容问题，降级路径可兜住）
  chooseNoDataImage: function () {
    var self = this;
    console.log('[无资料下单] 点击上传款式图'); // 点击即输出——Console 无此行 = 事件未触发（编译/绑定层问题）
    var onPicked = function (tempPath) {
      if (!tempPath) return;
      console.log('[无资料下单] 选择图片:', tempPath);
      self.setData({ noDataUploadedImage: tempPath });
    };
    var onFail = function (err) {
      var msg = (err && err.errMsg) || '';
      console.log('[无资料下单] 选图失败:', msg);
      if (msg.indexOf('cancel') !== -1) return;
      // 权限被拒：引导去设置开启（与订单备注页同一处理模式）
      if (msg.indexOf('auth') !== -1 || msg.indexOf('deny') !== -1 || msg.indexOf('permission') !== -1) {
        wx.showModal({
          title: '相机/相册权限',
          content: '需要相机或相册权限才能上传款式图片，请在设置中允许',
          confirmText: '去设置',
          cancelText: '取消',
          success: function (r) {
            if (r.confirm) wx.openSetting({});
          },
        });
        return;
      }
      // 其他失败：自动降级 wx.chooseImage 再试一次（兼容真机调试模式等场景）
      if (wx.chooseImage) {
        wx.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
          success: function (res) {
            onPicked(res.tempFilePaths && res.tempFilePaths[0]);
          },
          fail: function (err2) {
            var msg2 = (err2 && err2.errMsg) || '';
            if (msg2.indexOf('cancel') !== -1) return;
            toast.error('选择图片失败：' + msg2);
          },
        });
        return;
      }
      toast.error('选择图片失败');
    };

    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success: function (res) {
          // chooseMedia 的返回结构与 chooseImage 不同：tempFiles[].tempFilePath
          var files = (res && res.tempFiles) || [];
          onPicked(files[0] && files[0].tempFilePath);
        },
        fail: onFail,
      });
    } else {
      // 极老基础库无 chooseMedia：直接走降级分支
      onFail({ errMsg: 'chooseMedia not supported' });
    }
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