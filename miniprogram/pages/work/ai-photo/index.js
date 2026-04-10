var api = require('../../utils/api');
var uiHelper = require('../../utils/uiHelper');
var toast = uiHelper.toast;
var eventBus = require('../../utils/eventBus').eventBus;

var TASKS = [
  { type: 'fabric',    icon: '🧵', label: '面料检测', desc: '检测面料质量与缺陷' },
  { type: 'stitching', icon: '✂️', label: '缝制检测', desc: '检测缝制工艺问题' },
  { type: 'accessory', icon: '🔘', label: '辅料检测', desc: '检测辅料规格与质量' }
];

Page({
  onLoad: function () {
    // 隐私合规：监听隐私弹窗事件
    if (eventBus && typeof eventBus.on === 'function') {
      this._unsubPrivacy = eventBus.on('showPrivacyDialog', function (resolve) {
        try {
          var dialog = this.selectComponent('#privacyDialog');
          if (dialog && typeof dialog.showDialog === 'function') dialog.showDialog(resolve);
        } catch (_) {}
      }.bind(this));
    }
  },

  onUnload: function () {
    if (this._unsubPrivacy) {
      this._unsubPrivacy();
      this._unsubPrivacy = null;
    }
  },

  data: {
    tasks: TASKS,
    activeTask: '',
    tempPath: '',
    imageUrl: '',
    uploading: false,
    analyzing: false,
    result: null
  },

  pickTask: function (e) {
    this.setData({
      activeTask: e.currentTarget.dataset.type,
      tempPath: '', imageUrl: '', result: null,
      uploading: false, analyzing: false
    });
  },

  takePhoto: function () {
    if (this.data.uploading || this.data.analyzing) return;
    var self = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: function (res) {
        var path = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath;
        if (!path) return;
        self.setData({ tempPath: path, uploading: true, result: null });
        api.common.uploadImage(path)
          .then(function (url) {
            self.setData({ imageUrl: url, uploading: false, analyzing: true });
            return api.intelligence.visualAnalyze({
              imageUrl: url,
              taskType: self.data.activeTask
            });
          })
          .then(function (result) {
            self.setData({ analyzing: false, result: result || null });
          })
          .catch(function () {
            self.setData({ uploading: false, analyzing: false });
            toast.error('分析失败，请重试');
          });
      },
      fail: function (err) {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          toast.error('无法打开相机/相册，请检查权限');
        }
      }
    });
  },

  previewImage: function () {
    var path = this.data.tempPath;
    if (path) wx.previewImage({ current: path, urls: [path] });
  },

  retake: function () {
    this.setData({
      tempPath: '', imageUrl: '', result: null,
      uploading: false, analyzing: false
    });
  },

  reset: function () {
    this.setData({
      activeTask: '', tempPath: '', imageUrl: '', result: null,
      uploading: false, analyzing: false
    });
  }
});
