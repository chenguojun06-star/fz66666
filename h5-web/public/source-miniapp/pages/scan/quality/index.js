/**
 * 质检录入页面 — 从 QualityHandler 弹窗迁移为独立页面
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { getUserInfo } = require('../../../utils/storage');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { eventBus, triggerDataRefresh } = require('../../../utils/eventBus');
const { normalizeProcessName } = require('../../../utils/displayHelper');
const i18n = require('../../../utils/i18n/index');

/** 本页 i18n 命名空间前缀 */
const NS = 'mp.scanQuality.';

/** ⚠️ 处理方式作为后端载荷（defectRemark）落库，保持中文原文；展示层用 applyLanguage 里的键化数组 */
const HANDLE_METHODS = ['返修', '报废'];

/** 缺陷类别只作展示（载荷走 CATEGORY_VALUE_MAP 英文码），i18n 键后缀在 applyLanguage 里取文案 */
const DEFECT_CATEGORY_KEYS = ['catAppearance', 'catSize', 'catProcess', 'catFunction', 'catOther'];

const CATEGORY_VALUE_MAP = [
  'appearance_integrity', 'size_accuracy', 'process_compliance', 'functional_effectiveness', 'other',
];

Page({
  data: {

    // D-533：可搜索选择器状态（原生 picker 没有搜索）

    pickerVisible: false,

    pickerTitle: '',

    pickerOptions: [],

    pickerValue: '',
    detail: {},
    result: '',          // 'qualified' | 'unqualified'
    defectQuantity: '',
    handleMethodIndex: -1,
    defectCategoryIndex: -1,
    remark: '',
    images: [],
    handleMethods: [],
    defectCategories: [],
    aiSuggestion: null,
    aiSuggestionList: [],
    historicalDefectRate: '',
    loading: false,
    coverImage: '',
  },

  /**
   * 静态文案 + picker 选项数组按语言构建。
   * handleMethods 展示键化、载荷(HANDLE_METHODS)保留中文原文，两者下标一一对应。
   */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this.setData({
      t: {
        orderWord: i18n.t(NS + 'orderWord', lang),
        bundleWord: i18n.t(NS + 'bundleWord', lang),
        color: i18n.t('common.color', lang),
        size: i18n.t('common.size', lang),
        quantity: i18n.t('common.quantity', lang),
        pieceUnit: i18n.t('common.piece', lang),
        processLabel: i18n.t(NS + 'processLabel', lang),
        defectRateWord: i18n.t(NS + 'defectRateWord', lang),
        checkpointsLabel: i18n.t(NS + 'checkpointsLabel', lang),
        defectHintsLabel: i18n.t(NS + 'defectHintsLabel', lang),
        adoptSuggestion: i18n.t(NS + 'adoptSuggestion', lang),
        resultTitle: i18n.t(NS + 'resultTitle', lang),
        pass: i18n.t('common.pass', lang),
        fail: i18n.t('common.fail', lang),
        defectDetail: i18n.t(NS + 'defectDetail', lang),
        defectQty: i18n.t(NS + 'defectQty', lang),
        defectQtyPh: i18n.t(NS + 'defectQtyPh', lang),
        defectCategory: i18n.t(NS + 'defectCategory', lang),
        handleMethod: i18n.t(NS + 'handleMethod', lang),
        pleaseSelect: i18n.t('common.pleaseSelect', lang),
        defectPhotos: i18n.t(NS + 'defectPhotos', lang),
        maxPhotos: i18n.t(NS + 'maxPhotos', lang),
        takePhoto: i18n.t(NS + 'takePhoto', lang),
        submitting: i18n.t('common.submitting', lang),
        submitQuality: i18n.t(NS + 'submitQuality', lang),
        remarkTitle: i18n.t(NS + 'remarkTitle', lang),
        remarkPh: i18n.t(NS + 'remarkPh', lang),
        cancel: i18n.t('common.cancel', lang),
      },
      defectCategories: DEFECT_CATEGORY_KEYS.map(function (k) { return i18n.t(NS + k, lang); }),
      handleMethods: HANDLE_METHODS.map(function () { return null; })
        .map(function (_, i) { return i18n.t(NS + (i === 0 ? 'handleRepair' : 'handleScrap'), lang); }),
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onLoad() {
    this.applyLanguage(i18n.getLanguage());
    // 隐私授权弹窗监听（拍照需隐私授权）
    if (eventBus && typeof eventBus.on === 'function') {
      this._unsubPrivacy = eventBus.on('showPrivacyDialog', resolve => {
        try {
          const dialog = this.selectComponent('#privacyDialog');
          if (dialog && typeof dialog.showDialog === 'function') dialog.showDialog(resolve);
        } catch (_) { /* 静默 */ }
      });
    }
    const app = getApp();
    const raw = app.globalData.qualityData;
    if (!raw) {
      toast.error(i18n.t(NS + 'dataError', this._lang));
      wx.navigateBack();
      return;
    }
    this._rawDetail = raw;

    const coverImage = getAuthedImageUrl(raw.coverImage || raw.styleImage || '');

    this.setData({
      detail: {
        orderNo: raw.orderNo || '',
        bundleNo: raw.bundleNo || '',
        styleNo: raw.styleNo || '',
        color: raw.color || '',
        size: raw.size || raw.sizeSpec || '',
        processName: normalizeProcessName(raw.processName || ''),
        quantity: raw.quantity || 0,
        progressStage: raw.progressStage || '',
        operatorName: raw.operatorName || '',
        scanCode: raw.scanCode || '',
      },
      coverImage: coverImage,
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
    const self = this;
    api.production.getQualityAiSuggestion(orderId)
      .then(function (res) {
        if (!res) return;
        let rate = '';
        if (res.historicalDefectRate != null) {
          rate = (res.historicalDefectRate * 100).toFixed(1) + '%';
        }
        // 处理 defectSuggestions（Map<String,String>）为数组供模板渲染
        const suggestionList = [];
        const defectSuggestions = res.defectSuggestions || {};
        const keys = Object.keys(defectSuggestions);
        for (let i = 0; i < keys.length; i++) {
          const catVal = keys[i];
          const catIdx = CATEGORY_VALUE_MAP.indexOf(catVal);
          suggestionList.push({
            category: catVal,
            label: catIdx >= 0 ? self.data.defectCategories[catIdx] : catVal,
            text: defectSuggestions[catVal],
          });
        }
        self.setData({
          aiSuggestion: res,
          aiSuggestionList: suggestionList,
          historicalDefectRate: rate,
        });
      })
      .catch(function (err) {
        console.warn('[Quality] AI suggestion fetch failed:', err);
      });
  },

  /* ---- events ---- */

  previewImage() {
    const img = this.data.coverImage;
    if (!img) return;
    wx.previewImage({ current: img, urls: [img] });
  },

  onSelectResult(e) {
    const val = e.currentTarget.dataset.value;
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
    const ai = this.data.aiSuggestion;
    if (!ai) return;
    const updates = {};
    // 从 defectSuggestions（Map<category, suggestion>）中提取第一条建议
    const defectSuggestions = ai.defectSuggestions || {};
    const keys = Object.keys(defectSuggestions);
    if (keys.length > 0) {
      const suggestedCategory = keys[0];
      const idx = CATEGORY_VALUE_MAP.indexOf(suggestedCategory);
      if (idx >= 0) updates.defectCategoryIndex = idx;
      updates.remark = defectSuggestions[suggestedCategory];
    }
    // 自动切换为不合格
    if (!this.data.result) {
      updates.result = 'unqualified';
    }
    if (Object.keys(updates).length > 0) {
      this.setData(updates);
      toast.success(i18n.t(NS + 'suggestionAdopted', this._lang));
    } else {
      toast.error(i18n.t(NS + 'noSuggestion', this._lang));
    }
  },

  /* ---- image upload ---- */

  onUploadImage() {
    const self = this;
    if (self.data.images.length >= 5) {
      toast.error(i18n.t(NS + 'maxFivePhotos', this._lang));
      return;
    }
    self._doChooseMedia();
  },

  _doChooseMedia(sourceType) {
    const self = this;
    wx.chooseMedia({
      count: 5 - self.data.images.length,
      mediaType: ['image'],
      sourceType: sourceType || ['album', 'camera'],
      success: function (res) {
        const files = res.tempFiles || [];
        const tasks = files.map(function (f) {
          return api.common.uploadImage(f.tempFilePath);
        });
        Promise.all(tasks).then(function (urls) {
          // 上传后返回的是相对路径 /api/file/tenant-download/...，
          // <image> 标签无法发送 Authorization header，必须在 URL 追加 ?token=xxx
          const authedUrls = urls.filter(Boolean).map(function (u) { return getAuthedImageUrl(u); });
          self.setData({ images: self.data.images.concat(authedUrls) });
        }).catch(function () {
          toast.error(i18n.t(NS + 'photoUploadFailed', this._lang));
        });
      },
      fail: function (err) {
        console.warn('[Quality] chooseMedia fail:', err);
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          // 权限被拒绝时引导用户去设置页
          var lang = this._lang || i18n.getLanguage();
          wx.showModal({
            title: i18n.t(NS + 'cameraPermission', lang),
            content: i18n.t(NS + 'cameraPermissionMsg', lang),
            confirmText: i18n.t(NS + 'goSettings', lang),
            cancelText: i18n.t('common.cancel', lang),
            success: function (modalRes) {
              if (modalRes.confirm) wx.openSetting({ success: function () {} });
            },
          });
        }
      },
    });
  },

  onDeleteImage(e) {
    const idx = e.currentTarget.dataset.index;
    const imgs = this.data.images.slice();
    imgs.splice(idx, 1);
    this.setData({ images: imgs });
  },

  onPreviewUpload(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({ current: url, urls: this.data.images });
  },

  /* ---- submit ---- */

  goBack() { wx.navigateBack(); },

  async submitQuality() {
    if (this.data.loading) return;
    const d = this.data;
    const raw = this._rawDetail;

    if (!d.result) {
      toast.error(i18n.t(NS + 'selectQualityResult', this._lang));
      return;
    }

    // Build payload
    const userInfo = getUserInfo() || {};
    const payload = {
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
      operatorName: userInfo.name || userInfo.username || '',
    };

    // 自动领取：confirm 前先发 receive 请求（后端要求先领取再确认）
    // 同一操作员重复领取后端幂等返回成功，不会报错
    const receivePayload = {
      orderNo: payload.orderNo,
      bundleNo: payload.bundleNo,
      quantity: payload.quantity,
      processName: payload.processName,
      progressStage: payload.progressStage,
      scanCode: payload.scanCode,
      scanType: 'quality',
      qualityStage: 'receive',
      operatorId: payload.operatorId,
      operatorName: payload.operatorName,
    };
    this.setData({ loading: true });
    try {
      await api.production.executeScan(receivePayload);
    } catch (recvErr) {
      const recvMsg = (recvErr && (recvErr.message || recvErr.errMsg)) || '';
      // 被其他人领取 → 不允许继续
      if (recvMsg.indexOf('已被') >= 0 && recvMsg.indexOf('领取') >= 0) {
        this.setData({ loading: false });
        wx.showModal({ title: i18n.t(NS + 'cannotQuality', this._lang), content: recvMsg, showCancel: false, confirmText: i18n.t('common.gotIt', this._lang) });
        return;
      }
      // 其他错误（如已领取/网络异常）继续尝试 confirm
    }

    if (d.result === 'unqualified') {
      const qty = parseInt(d.defectQuantity, 10);
      if (!qty || qty <= 0) {
        this.setData({ loading: false });
        toast.error(i18n.t(NS + 'qtyRequired', this._lang));
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
      const res = await api.production.executeScan(payload);
      toast.success(d.result === 'qualified' ? i18n.t(NS + 'passRecorded', this._lang) : i18n.t(NS + 'defectRecorded', this._lang));
      const hints = (res && res.bundleStatusHints) || [];
      const statusText = (res && res.bundleStatusText) || '';
      if (hints.length > 0) {
        setTimeout(function() {
          wx.showToast({ title: statusText || hints.join(' → '), icon: 'none', duration: 3000 });
        }, 800);
      }
      this._emitRefresh();
      wx.navigateBack();
    } catch (e) {
      this.setData({ loading: false });
      wx.showModal({
        title: i18n.t(NS + 'submitFailed', this._lang),
        content: e.message || e.errMsg || i18n.t('common.retryLater', this._lang),
        showCancel: false,
        confirmText: i18n.t('common.gotIt', this._lang),
      });
    }
  },

  _emitRefresh() {
    triggerDataRefresh('quality');
  },

  /* ── D-533：可搜索选择器（原生 picker 没有搜索，选项多时只能一路滚）────────
     由 scripts/codemod-search-picker.py 注入，各页面内容一致。
     选中后回调页面原有的 onXxxChange（e.detail.value 为下标），既有逻辑不变。 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */
  openPicker: function (e) {
    var ds = e.currentTarget.dataset || {};
    if (!ds.handler && typeof this._openPickerByKey === 'function') {
      return this._openPickerByKey(e);
    }
    var arr = this.data[ds.names] || [];
    var rangeKey = ds.rangeKey || '';
    var opts = [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      var label;
      if (rangeKey) {
        label = it ? it[rangeKey] : '';
      } else if (it && typeof it === 'object') {
        label = it.label != null ? it.label : (it.name != null ? it.name : '');
      } else {
        label = it;
      }
      label = String(label == null ? '' : label);
      if (!label) continue;
      opts.push({ label: label, value: String(i) });
    }
    this._pickerHandler = ds.handler || '';
    this.setData({
      pickerTitle: ds.title || i18n.t('common.pleaseSelect'),
      pickerOptions: opts,
      pickerValue: '',
      pickerVisible: true,
    });
  },

  onPickerSelect: function (e) {
    var handler = this._pickerHandler;
    if (handler && typeof this[handler] === 'function') {
      this[handler]({ detail: { value: Number(e.detail.value) } });
      return;
    }
    if (typeof this._onPickerSelectByKey === 'function') {
      return this._onPickerSelectByKey(e);
    }
  },

  onPickerClose: function () {
    this.setData({ pickerVisible: false });
  },

});
