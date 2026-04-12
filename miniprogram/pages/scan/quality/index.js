/**
 * 质检录入页面 — 从 QualityHandler 弹窗迁移为独立页面
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { getUserInfo } = require('../../../utils/storage');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { eventBus } = require('../../../utils/eventBus');

const HANDLE_METHODS = ['返修', '报废', '退货', '降级使用', '其他'];

const DEFECT_CATEGORIES = ['外观完整性', '尺寸精度', '工艺合规性', '功能有效性', '其他'];

const CATEGORY_VALUE_MAP = [
  'appearance_integrity', 'size_accuracy', 'process_compliance', 'functional_effectiveness', 'other'
];

Page({
  data: {
    detail: {},
    result: '',          // 'qualified' | 'unqualified'
    defectQuantity: '',
    handleMethodIndex: -1,
    defectCategoryIndex: -1,
    remark: '',
    images: [],
    handleMethods: HANDLE_METHODS,
    defectCategories: DEFECT_CATEGORIES,
    aiSuggestion: null,
    aiSuggestionList: [],
    historicalDefectRate: '',
    loading: false,
    coverImage: ''
  },

  onLoad() {
    // 隐私授权弹窗监听（拍照需隐私授权）
    if (eventBus && typeof eventBus.on === 'function') {
      this._unsubPrivacy = eventBus.on('showPrivacyDialog', resolve => {
        try {
          var dialog = this.selectComponent('#privacyDialog');
          if (dialog && typeof dialog.showDialog === 'function') dialog.showDialog(resolve);
        } catch (_) { /* 静默 */ }
      });
    }
    var app = getApp();
    var raw = app.globalData.qualityData;
    if (!raw) {
      toast.error('数据异常');
      wx.navigateBack();
      return;
    }
    this._rawDetail = raw;

    var coverImage = getAuthedImageUrl(raw.coverImage || raw.styleImage || '');

    this.setData({
      detail: {
        orderNo: raw.orderNo || '',
        bundleNo: raw.bundleNo || '',
        styleNo: raw.styleNo || '',
        processName: raw.processName || '',
        quantity: raw.quantity || 0,
        progressStage: raw.progressStage || '',
        operatorName: raw.operatorName || '',
        scanCode: raw.scanCode || ''
      },
      coverImage: coverImage
    });

    // Async AI suggestion
    if (raw.orderId) {
      this._fetchAiSuggestion(raw.orderId);
    }
  },

  onUnload() {
    if (this._unsubPrivacy) { this._unsubPrivacy(); this._unsubPrivacy = null; }
    getApp().globalData.qualityData = null;
  },

  /* ---- AI ---- */

  _fetchAiSuggestion(orderId) {
    var self = this;
    api.production.getQualityAiSuggestion(orderId)
      .then(function (res) {
        if (!res) return;
        var rate = '';
        if (res.historicalDefectRate != null) {
          rate = (res.historicalDefectRate * 100).toFixed(1) + '%';
        }
        // 处理 defectSuggestions（Map<String,String>）为数组供模板渲染
        var suggestionList = [];
        var defectSuggestions = res.defectSuggestions || {};
        var keys = Object.keys(defectSuggestions);
        for (var i = 0; i < keys.length; i++) {
          var catVal = keys[i];
          var catIdx = CATEGORY_VALUE_MAP.indexOf(catVal);
          suggestionList.push({
            category: catVal,
            label: catIdx >= 0 ? DEFECT_CATEGORIES[catIdx] : catVal,
            text: defectSuggestions[catVal]
          });
        }
        self.setData({
          aiSuggestion: res,
          aiSuggestionList: suggestionList,
          historicalDefectRate: rate
        });
      })
      .catch(function (err) {
        console.warn('[Quality] AI suggestion fetch failed:', err);
      });
  },

  /* ---- events ---- */

  previewImage() {
    var img = this.data.coverImage;
    if (!img) return;
    wx.previewImage({ current: img, urls: [img] });
  },

  onSelectResult(e) {
    var val = e.currentTarget.dataset.value;
    this.setData({ result: val });
  },

  onDefectCategoryChange(e) {
    this.setData({ defectCategoryIndex: Number(e.detail.value) });
  },

  onHandleMethodChange(e) {
    this.setData({ handleMethodIndex: Number(e.detail.value) });
  },

  onDefectQuantityInput(e) {
    this.setData({ defectQuantity: e.detail.value });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  onAdoptAiSuggestion() {
    var ai = this.data.aiSuggestion;
    if (!ai) return;
    var updates = {};
    // 从 defectSuggestions（Map<category, suggestion>）中提取第一条建议
    var defectSuggestions = ai.defectSuggestions || {};
    var keys = Object.keys(defectSuggestions);
    if (keys.length > 0) {
      var suggestedCategory = keys[0];
      var idx = CATEGORY_VALUE_MAP.indexOf(suggestedCategory);
      if (idx >= 0) updates.defectCategoryIndex = idx;
      updates.remark = defectSuggestions[suggestedCategory];
    }
    // 自动切换为不合格
    if (!this.data.result) {
      updates.result = 'unqualified';
    }
    if (Object.keys(updates).length > 0) {
      this.setData(updates);
      toast.success('已采纳建议');
    } else {
      toast.error('暂无可采纳的建议');
    }
  },

  /* ---- image upload ---- */

  onUploadImage() {
    var self = this;
    if (self.data.images.length >= 5) {
      toast.error('最多上传5张');
      return;
    }
    self._doChooseMedia();
  },

  _doChooseMedia(sourceType) {
    var self = this;
    wx.chooseMedia({
      count: 5 - self.data.images.length,
      mediaType: ['image'],
      sourceType: sourceType || ['album', 'camera'],
      success: function (res) {
        var files = res.tempFiles || [];
        var tasks = files.map(function (f) {
          return api.common.uploadImage(f.tempFilePath);
        });
        Promise.all(tasks).then(function (urls) {
          self.setData({ images: self.data.images.concat(urls.filter(Boolean)) });
        }).catch(function () {
          toast.error('图片上传失败');
        });
      },
      fail: function (err) {
        console.warn('[Quality] chooseMedia fail:', err);
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          // 权限被拒绝时引导用户去设置页
          wx.showModal({
            title: '相机/相册权限',
            content: '需要相机或相册权限才能上传照片，请在设置中允许',
            confirmText: '去设置',
            cancelText: '取消',
            success: function (modalRes) {
              if (modalRes.confirm) wx.openSetting();
            }
          });
        }
      }
    });
  },

  onDeleteImage(e) {
    var idx = e.currentTarget.dataset.index;
    var imgs = this.data.images.slice();
    imgs.splice(idx, 1);
    this.setData({ images: imgs });
  },

  onPreviewUpload(e) {
    var url = e.currentTarget.dataset.url;
    wx.previewImage({ current: url, urls: this.data.images });
  },

  /* ---- submit ---- */

  goBack() { wx.navigateBack(); },

  async submitQuality() {
    if (this.data.loading) return;
    var d = this.data;
    var raw = this._rawDetail;

    if (!d.result) {
      toast.error('请选择质检结果');
      return;
    }

    // Build payload
    var userInfo = getUserInfo() || {};
    var payload = {
      orderNo: d.detail.orderNo,
      orderItemId: raw.orderItemId || '',
      bundleNo: d.detail.bundleNo,
      quantity: d.detail.quantity,
      processName: d.detail.processName,
      progressStage: d.detail.progressStage,
      scanCode: d.detail.scanCode || d.detail.orderNo,
      scanType: 'quality',
      qualityResult: d.result,
      qualityStage: 'confirm',
      operatorId: userInfo.userId || '',
      operatorName: userInfo.name || userInfo.username || ''
    };

    // 自动领取：confirm 前先发 receive 请求（后端要求先领取再确认）
    // 同一操作员重复领取后端幂等返回成功，不会报错
    var receivePayload = {
      orderNo: payload.orderNo,
      bundleNo: payload.bundleNo,
      quantity: payload.quantity,
      processName: payload.processName,
      progressStage: payload.progressStage,
      scanCode: payload.scanCode,
      scanType: 'quality',
      qualityStage: 'receive',
      operatorId: payload.operatorId,
      operatorName: payload.operatorName
    };
    this.setData({ loading: true });
    try {
      await api.production.executeScan(receivePayload);
    } catch (recvErr) {
      var recvMsg = (recvErr && (recvErr.message || recvErr.errMsg)) || '';
      // 被其他人领取 → 不允许继续
      if (recvMsg.indexOf('已被') >= 0 && recvMsg.indexOf('领取') >= 0) {
        this.setData({ loading: false });
        wx.showModal({ title: '无法质检', content: recvMsg, showCancel: false, confirmText: '知道了' });
        return;
      }
      // 其他错误（如已领取/网络异常）继续尝试 confirm
    }

    if (d.result === 'unqualified') {
      var qty = parseInt(d.defectQuantity, 10);
      if (!qty || qty <= 0) {
        this.setData({ loading: false });
        toast.error('请输入不良数量');
        return;
      }
      payload.defectQuantity = qty;

      if (d.defectCategoryIndex >= 0) {
        payload.defectCategory = CATEGORY_VALUE_MAP[d.defectCategoryIndex];
      }
      if (d.handleMethodIndex >= 0) {
        payload.defectRemark = HANDLE_METHODS[d.handleMethodIndex];
      }
      if (d.images.length > 0) {
        payload.unqualifiedImageUrls = JSON.stringify(d.images);
      }
    }

    if (d.remark) payload.remark = d.remark;

    try {
      await api.production.executeScan(payload);
      toast.success(d.result === 'qualified' ? '质检合格，已记录' : '已记录不良品');
      this._emitRefresh();
      wx.navigateBack();
    } catch (e) {
      this.setData({ loading: false });
      wx.showModal({
        title: '提交失败',
        content: e.message || e.errMsg || '请稍后重试',
        showCancel: false,
        confirmText: '知道了'
      });
    }
  },

  _emitRefresh() {
    var eb = getApp().globalData && getApp().globalData.eventBus;
    if (eb && typeof eb.emit === 'function') {
      eb.emit('DATA_REFRESH');
    }
  }
});
