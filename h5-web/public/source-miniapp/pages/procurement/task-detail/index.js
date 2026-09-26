const i18n = require('../../../utils/i18n/index');
const NS = 'mp.taskDetail.';
const api = require('../../../utils/api');
const { getUserInfo } = require('../../../utils/storage');
const { toast } = require('../../../utils/uiHelper');
const { eventBus, Events, triggerDataRefresh } = require('../../../utils/eventBus');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const displayHelper = require('../../../utils/displayHelper');

const MATERIAL_TYPE_MAP = {
  fabricA: 'matMainW', fabricB: 'matAuxW',
  liningA: 'matLiningW', liningB: 'matJiaW', liningC: 'matInterW',
  accessoryA: 'matZipW', accessoryB: 'matBtnW', accessoryC: 'matAccW',
};

/**
 * displayHelper 颜色常量 → 原 _getStatusColor 返回的颜色名映射
 * （displayHelper 返回 CSS 变量，模板用 green/orange/blue 等颜色名）
 */
const COLOR_TO_NAME = {
  [displayHelper.STATUS_COLOR_DEFAULT]: 'default',
  [displayHelper.STATUS_COLOR_SUCCESS]: 'green',
  [displayHelper.STATUS_COLOR_PROCESSING]: 'blue',
  [displayHelper.STATUS_COLOR_WARNING]: 'orange',
  [displayHelper.STATUS_COLOR_ERROR]: 'red',
  [displayHelper.STATUS_COLOR_BLUE]: 'blue',
  [displayHelper.STATUS_COLOR_CYAN]: 'cyan',
  [displayHelper.STATUS_COLOR_ORANGE]: 'orange',
  [displayHelper.STATUS_COLOR_VOLCANO]: 'red',
  [displayHelper.STATUS_COLOR_PURPLE]: 'purple',
  [displayHelper.STATUS_COLOR_GEEKBLUE]: 'blue',
};

/**
 * 臆造/历史状态值本地兜底（displayHelper PURCHASE_STATUS_LABEL 未覆盖）
 * 文案对齐 displayHelper 语义
 */
const LOCAL_PURCHASE_FALLBACK = {
  procuring: { key: 'purchasingW', color: displayHelper.STATUS_COLOR_BLUE },
  waiting_procurement: { key: 'stPendingBuy', color: displayHelper.STATUS_COLOR_WARNING },
  procurement_in_progress: { key: 'purchasingW', color: displayHelper.STATUS_COLOR_BLUE },
  material_preparation: { key: 'stPreparing', color: displayHelper.STATUS_COLOR_BLUE },
  procurement_completed: { key: 'stPurchased', color: displayHelper.STATUS_COLOR_SUCCESS },
  partial_arrived: { key: 'stPartial', color: displayHelper.STATUS_COLOR_CYAN },
  canceled: { key: 'stCancelled', color: displayHelper.STATUS_COLOR_DEFAULT },
};

/**
 * 统一采购状态文案：优先 displayHelper，未命中查本地兜底
 */
function resolvePurchaseText(status, lang) {
  if (!status) return '';
  const text = displayHelper.displayPurchaseStatusText(status);
  if (text !== status) return text;
  const fb = LOCAL_PURCHASE_FALLBACK[status];
  return fb ? i18n.t(NS + fb.key, lang) : text;
}

/**
 * 统一采购状态颜色名：优先 displayHelper，未命中查本地兜底
 */
function resolvePurchaseColor(status) {
  if (!status) return 'default';
  const result = displayHelper.displayPurchaseStatus(status);
  if (result.text !== status) return COLOR_TO_NAME[result.color] || 'default';
  const fb = LOCAL_PURCHASE_FALLBACK[status];
  if (fb) return COLOR_TO_NAME[fb.color] || 'default';
  return COLOR_TO_NAME[result.color] || 'default';
}

Page({
  data: {
    orderId: '',
    orderNo: '',
    patternProductionId: '',
    sourceType: '',
    styleNo: '',
    styleImage: '',
    isSampleMode: false,
    loading: false,
    submitting: false,
    materialPurchases: [],
    remark: '',
    hasInput: false,
    canConfirmProcurement: false,
    hasReturnConfirmed: false,
    overallArrivalRate: -1,
    // 领料出库弹窗
    showPickingModal: false,
    pickingItems: [],
    // 回料确认弹窗
    showReturnConfirmModal: false,
    returnConfirmItem: {},
    returnConfirmQty: '',
    returnConfirmImages: [],
    returnConfirmSubmitting: false,
  },

  /** 静态文案按语言写入（wxml 用 {{t.xxx}}） */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        navTitle: i18n.t(NS + 'navTitle', lang),
        noMaterials: i18n.t(NS + 'noMaterials', lang),
        wordTotal: i18n.t(NS + 'wordTotal', lang),
        wordItems: i18n.t(NS + 'wordItems', lang),
        itemCountLabel: i18n.t(NS + 'itemCountLabel', lang),
        overallArrival: i18n.t(NS + 'overallArrival', lang),
        arrivalRateLabel: i18n.t(NS + 'arrivalRateLabel', lang),
        returnStatusLabel: i18n.t(NS + 'returnStatusLabel', lang),
        purchaseStage: i18n.t(NS + 'purchaseStage', lang),
        arrivalProgress: i18n.t(NS + 'arrivalProgress', lang),
        returnedLabel: i18n.t(NS + 'returnedLabel', lang),
        demandLabel: i18n.t(NS + 'demandLabel', lang),
        arrivedShort: i18n.t(NS + 'arrivedShort', lang),
        pendingShort: i18n.t(NS + 'pendingShort', lang),
        confirmCompleteBtn: i18n.t(NS + 'confirmCompleteBtn', lang),
        confirmReturnBtn: i18n.t(NS + 'confirmReturnBtn', lang),
        withdrawArrival: i18n.t(NS + 'withdrawArrival', lang),
        needPurchaseHint: i18n.t(NS + 'needPurchaseHint', lang),
        remarkNote: i18n.t(NS + 'remarkNote', lang),
        buyAllBtn: i18n.t(NS + 'buyAllBtn', lang),
        submitArrivalBtn: i18n.t(NS + 'submitArrivalBtn', lang),
        completeAllBtn: i18n.t(NS + 'completeAllBtn', lang),
        pickupHint: i18n.t(NS + 'pickupHint', lang),
        noPickupShort: i18n.t(NS + 'noPickupShort', lang),
        submitPickupBtn: i18n.t(NS + 'submitPickupBtn', lang),
        returnQtyLabel: i18n.t(NS + 'returnQtyLabel', lang),
        returnVoucher: i18n.t(NS + 'returnVoucher', lang),
        uploadVoucher: i18n.t(NS + 'uploadVoucher', lang),
        pickupOutbound: i18n.t(NS + 'pickupOutbound', lang),
        cancel: i18n.t('common.cancel', lang),
        submitting: i18n.t('common.submitting', lang),
        samplePurchaseW: i18n.t(NS + 'samplePurchaseW', lang),
        styleNoPrefix: i18n.t(NS + 'styleNoPrefix', lang),
        unknownMatW: i18n.t(NS + 'unknownMatW', lang),
        codePrefix: i18n.t(NS + 'codePrefix', lang),
        specPrefix: i18n.t(NS + 'specPrefix', lang),
        unitPrefix: i18n.t(NS + 'unitPrefix', lang),
        meterWord: i18n.t(NS + 'meterWord', lang),
        creatorPrefix: i18n.t(NS + 'creatorPrefix', lang),
        pickupPrefix: i18n.t(NS + 'pickupPrefix', lang),
        returnPrefix: i18n.t(NS + 'returnPrefix', lang),
        arrivalQtyPh: i18n.t(NS + 'arrivalQtyPh', lang),
        lowRateRemark: i18n.t(NS + 'lowRateRemark', lang),
        pickupQtyPh: i18n.t(NS + 'pickupQtyPh', lang),
        availableArrival: i18n.t(NS + 'availableArrival', lang),
        returnQtyPh: i18n.t(NS + 'returnQtyPh', lang),
        statusDoingW: i18n.t(NS + 'statusDoingW', lang),
        pieceUnit: i18n.t('common.piece', lang),
      },
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onLoad(options) {
    this.applyLanguage(i18n.getLanguage());
    this.orderNo = decodeURIComponent(options.orderNo || '');
    this.patternProductionId = decodeURIComponent(options.patternProductionId || '');
    this.materialCode = decodeURIComponent(options.materialCode || '');
    this.sourceType = decodeURIComponent(options.sourceType || '');
    const styleNo = decodeURIComponent(options.styleNo || '');
    const isSampleMode = this.sourceType === 'sample' || !!this.patternProductionId;
    this.setData({
      orderNo: this.orderNo,
      patternProductionId: this.patternProductionId,
      materialCode: this.materialCode,
      sourceType: this.sourceType,
      styleNo,
      isSampleMode,
    });
    if (this.orderNo || this.patternProductionId || this.materialCode) this._loadDetail();
  },

  onShow() {
    if (this.orderNo || this.patternProductionId || this.materialCode) this._loadDetail();
    this._bindEvents();
  },

  onHide() {
    this._unbindEvents();
  },

  onUnload() {
    this._unbindEvents();
  },

  _bindEvents() {
    this._onDataChanged = (data) => {
      if (data && (data.type === 'procurement' || data.type === 'purchase')) {
        if (this.orderNo || this.patternProductionId || this.materialCode) this._loadDetail();
      }
    };
    eventBus.on(Events.DATA_CHANGED, this._onDataChanged);
  },

  _unbindEvents() {
    if (this._onDataChanged) eventBus.off(Events.DATA_CHANGED, this._onDataChanged);
  },

  onPullDownRefresh() {
    this._loadDetail().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
  },

  async _loadDetail() {
    this.setData({ loading: true });
    try {
      const params = this.orderNo
        ? { orderNo: this.orderNo }
        : this.patternProductionId
          ? { patternProductionId: this.patternProductionId }
          : { materialCode: this.materialCode };
      const res = await api.production.getMaterialPurchases(params);
      const list = this._normalizeToArray(res);
      const userInfo = getUserInfo() || {};
      const receiverId = String(userInfo.id || userInfo.userId || '').trim();
      const receiverName = String(userInfo.name || userInfo.username || '').trim();

      let totalPurchased = 0;
      let totalArrived = 0;
      let hasAwaitingConfirm = false;
      let hasReturnConfirmed = false;

      const materialPurchases = list.map(item => {
        const status = this._normalizeStatus(item.status);
        const isComplete = status === 'completed';
        const isActionable = !isComplete && this._isActionableForUser(item, receiverId, receiverName);
        const needsReceive = this._shouldCallReceive(item, receiverId, receiverName);
        const returnConfirmed = Number(item.returnConfirmed || 0) === 1;
        const canConfirmReturn = !returnConfirmed && (status === 'received' || status === 'partial' || status === 'completed');
        // 撤回到货：对齐 PC 端 canCancelReceive
        // PC: !isPending && !['completed','cancelled'].includes(status) && !frozen && !returnConfirmed
        const canCancelReceive = !returnConfirmed && !isComplete && status !== 'cancelled'
          && status !== 'pending' && Number(item.arrivedQuantity || 0) > 0;
        // 单条确认完成：对齐 PC 端，仅 awaiting_confirm 状态可操作
        const canConfirmComplete = !returnConfirmed && !isComplete && status === 'awaiting_confirm';

        const purchaseQty = Number(item.purchaseQuantity || 0);
        const arrivedQty = Number(item.arrivedQuantity || 0);
        totalPurchased += purchaseQty;
        totalArrived += arrivedQty;
        if (status === 'awaiting_confirm') hasAwaitingConfirm = true;
        if (returnConfirmed) hasReturnConfirmed = true;

        const returnConfirmTimeText = item.returnConfirmTime
          ? item.returnConfirmTime.substring(5, 16)
          : '';

        return {
          ...item,
          materialTypeCN: (function(){ var k = MATERIAL_TYPE_MAP[item.materialType]; return k ? i18n.t(NS + k, lang) : (item.materialType || ''); })(),
          statusText: resolvePurchaseText(status, lang),
          statusColor: resolvePurchaseColor(status),
          isActionable,
          needsReceive,
          isComplete,
          returnConfirmed,
          canConfirmReturn,
          canCancelReceive,
          canConfirmComplete,
          inputQuantity: '',
          arrivalRate: purchaseQty > 0 ? Math.round(arrivedQty / purchaseQty * 100) : 0,
          returnConfirmTimeText,
        };
      });

      const orderId = (materialPurchases[0] && (materialPurchases[0].orderId || materialPurchases[0].order_id)) || '';
      const overallArrivalRate = totalPurchased > 0 ? Math.round(totalArrived / totalPurchased * 100) : 0;
      // 对齐 PC 端 footer "确认完成"按钮条件：
      // 有 awaiting_confirm 状态记录 且 无 returnConfirmed=1 锁定（不校验到货率）
      // 样衣场景无订单流转，禁用"一键全部完成"（采购完成不触发流转裁剪）
      const canConfirmProcurement = !this.data.isSampleMode && hasAwaitingConfirm && !hasReturnConfirmed;

      // 头部状态：基于物料实际状态计算（不依赖到货率，对齐用户诉求"已完成的任务要显示已完成"）
      // 优先级：全部 completed → 已完成；含 cancelled 且其他都完成 → 已完成（取消的物料不阻断）
      //        全部 received/partial → 已领取；含 pending → 待采购；否则 → 采购中
      const validItems = materialPurchases.filter(m => this._normalizeStatus(m.status) !== 'cancelled');
      const allCompleted = validItems.length > 0 && validItems.every(m => {
        const s = this._normalizeStatus(m.status);
        return s === 'completed' || s === 'procurement_completed';
      });
      const allReceived = validItems.length > 0 && validItems.every(m => {
        const s = this._normalizeStatus(m.status);
        return s === 'completed' || s === 'procurement_completed' || s === 'received' || s === 'partial' || s === 'partial_arrival';
      });
      const hasPending = validItems.some(m => {
        const s = this._normalizeStatus(m.status);
        return !s || s === 'pending' || s === 'waiting_procurement';
      });
      let overallStatus = 'procuring';
      let overallStatusColor = 'blue';
      if (allCompleted) { overallStatus = 'completed'; overallStatusColor = 'green'; }
      else if (allReceived) { overallStatus = 'received'; overallStatusColor = 'green'; }
      else if (hasPending) { overallStatus = 'pending'; overallStatusColor = 'orange'; }
      // overallStatus='procuring' 由 resolvePurchaseText 本地兜底处理
      const overallStatusText = resolvePurchaseText(overallStatus);

      this.setData({
        orderId, materialPurchases, loading: false,
        overallArrivalRate, canConfirmProcurement, hasReturnConfirmed,
        overallStatus, overallStatusColor, overallStatusText,
        styleImage: getAuthedImageUrl((materialPurchases[0] && (materialPurchases[0].styleImage || materialPurchases[0].coverImage)) || ''),
      });
    } catch (e) {
      console.error('加载采购详情失败:', e);
      this.setData({ loading: false });
      toast.error(i18n.t('common.loadFailed', this._lang));
    }
  },

  onMaterialInput(e) {
    const { id } = e.currentTarget.dataset;
    const value = e.detail.value;
    const materials = this.data.materialPurchases.map(item => {
      if ((item.id || item.purchaseId) === id) {
        return { ...item, inputQuantity: value };
      }
      return item;
    });
    const hasInput = materials.some(m => m.inputQuantity && Number(m.inputQuantity) > 0);
    this.setData({ materialPurchases: materials, hasInput });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  async onReceiveAll() {
    if (this.data.hasReturnConfirmed) {
      toast.warning(i18n.t(NS + 'blockPurchasing', this._lang));
      return;
    }

    const userInfo = getUserInfo() || {};
    const receiverId = String(userInfo.id || userInfo.userId || '').trim();
    const receiverName = String(userInfo.name || userInfo.username || '').trim();

    if (!receiverId && !receiverName) {
      toast.error(i18n.t(NS + 'purchaserMissing', this._lang));
      return;
    }

    const pendingItems = this.data.materialPurchases.filter(item => item.needsReceive);
    if (pendingItems.length === 0) {
      toast.success(i18n.t(NS + 'allClaimedW', this._lang));
      return;
    }

    wx.showLoading({ title: i18n.t(NS + 'purchasingTxt', this._lang), mask: true });
    try {
      await Promise.all(pendingItems.map(item =>
        api.production.receivePurchase({
          purchaseId: item.id || item.purchaseId,
          receiverId,
          receiverName,
        }),
      ));
      wx.hideLoading();
      toast.success(i18n.tf('mp.scanConfirm.itemsClaimed', { count: pendingItems.length }, this._lang));
      this._loadDetail();
    } catch (e) {
      wx.hideLoading();
      toast.error(e.errMsg || e.message || i18n.t(NS + 'purchasingFail', this._lang));
    }
  },

  onReturnConfirm(e) {
    const { id, name, arrived, purchase, unit } = e.currentTarget.dataset;
    if (!id) return;
    // D-308：回料默认=采购数（用户可改实际回货数；原实现到货数优先，与"默认填采购数"口径不符）
    const defaultQty = String(Number(purchase) || Number(arrived) || 0);
    this.setData({
      showReturnConfirmModal: true,
      returnConfirmItem: { id, name, unit: unit || '' },
      returnConfirmQty: defaultQty,
      returnConfirmImages: [],
      returnConfirmSubmitting: false,
    });
  },

  onReturnConfirmModalClose() {
    this.setData({ showReturnConfirmModal: false, returnConfirmItem: {}, returnConfirmImages: [] });
  },

  onReturnConfirmQtyInput(e) {
    this.setData({ returnConfirmQty: e.detail.value });
  },

  onUploadReturnImage() {
    const self = this;
    if (self.data.returnConfirmImages.length >= 5) {
      toast.error(i18n.t('mp.scanQuality.maxFivePhotos', this._lang));
      return;
    }
    wx.chooseMedia({
      count: 5 - self.data.returnConfirmImages.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success(res) {
        const files = res.tempFiles || [];
        const tasks = files.map(f => api.common.uploadImage(f.tempFilePath));
        Promise.all(tasks).then(urls => {
          const newImages = urls.filter(Boolean).map(raw => ({ raw, authed: getAuthedImageUrl(raw) }));
          self.setData({ returnConfirmImages: self.data.returnConfirmImages.concat(newImages) });
        }).catch(() => toast.error(i18n.t('mp.scanQuality.photoUploadFailed', this._lang)));
      },
      fail(err) {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showModal({
            title: i18n.t('mp.scanQuality.cameraPermission', this._lang),
            content: i18n.t('mp.scanQuality.cameraPermissionMsg', this._lang),
            confirmText: i18n.t('mp.scanQuality.goSettings', this._lang),
            cancelText: i18n.t('common.cancel', this._lang),
            success(modalRes) { if (modalRes.confirm) wx.openSetting({ success() {} }); },
          });
        }
      },
    });
  },

  onDeleteReturnImage(e) {
    const idx = e.currentTarget.dataset.index;
    const imgs = this.data.returnConfirmImages.slice();
    imgs.splice(idx, 1);
    this.setData({ returnConfirmImages: imgs });
  },

  onPreviewReturnImage(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({ current: url, urls: this.data.returnConfirmImages.map(i => i.authed) });
  },

  async onSubmitReturnConfirm() {
    if (this.data.returnConfirmSubmitting) return;
    const { returnConfirmItem, returnConfirmQty, returnConfirmImages } = this.data;
    const qty = Number(returnConfirmQty);
    if (isNaN(qty) || qty < 0) {
      toast.error(i18n.t('mp.scanQuality.qtyRequired', this._lang));
      return;
    }
    const userInfo = getUserInfo() || {};
    const confirmerId = String(userInfo.id || userInfo.userId || '').trim();
    const confirmerName = String(userInfo.name || userInfo.username || '').trim();
    const evidenceImageUrls = returnConfirmImages.map(i => i.raw).join(',') || undefined;

    this.setData({ returnConfirmSubmitting: true });
    wx.showLoading({ title: i18n.t(NS + 'confirmingTxt', this._lang), mask: true });
    try {
      await api.production.confirmReturnPurchase({
        purchaseId: returnConfirmItem.id,
        confirmerId,
        confirmerName,
        returnQuantity: qty,
        ...(evidenceImageUrls ? { evidenceImageUrls } : {}),
      });
      wx.hideLoading();
      toast.success(i18n.t(NS + 'returnOk', this._lang));
      this.setData({ showReturnConfirmModal: false, returnConfirmImages: [] });
      triggerDataRefresh('procurement');
      this._loadDetail();
    } catch (err) {
      wx.hideLoading();
      toast.error(err.errMsg || err.message || i18n.t(NS + 'confirmFail', this._lang));
    } finally {
      this.setData({ returnConfirmSubmitting: false });
    }
  },

  async onConfirmProcurement() {
    // 样衣场景无订单流转，按钮已隐藏，此处防御性返回
    if (this.data.isSampleMode) return;
    if (this.data.hasReturnConfirmed) {
      toast.warning(i18n.t(NS + 'returnAlready', this._lang));
      return;
    }

    const { orderId, orderNo, overallArrivalRate } = this.data;
    if (!orderNo) return;

    wx.showModal({
      title: i18n.t(NS + 'returnConfirmTitle', this._lang),
      content: i18n.tf(NS + 'completeStageFmt', { rate: overallArrivalRate }, this._lang),
      confirmText: i18n.t(NS + 'confirmCompleteBtn', this._lang),
      confirmColor: '#007aff',
      editable: true,
      placeholderText: i18n.t(NS + 'remarkOptional', this._lang),
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: i18n.t(NS + 'confirmingTxt', this._lang), mask: true });
        try {
          const remark = (res.content || '').trim();
          await api.production.confirmProcurementComplete({
            id: orderId,
            orderNo,
            remark,
          });
          wx.hideLoading();
          toast.success(i18n.t(NS + 'stageDoneNotice', this._lang));

          triggerDataRefresh('procurement');

          setTimeout(() => wx.navigateBack(), 1000);
        } catch (err) {
          wx.hideLoading();
          toast.error(err.errMsg || err.message || i18n.t(NS + 'confirmFail', this._lang));
        }
      },
    });
  },

  /**
   * 撤回采购（单条）：清空到货数量 + 恢复 pending 状态
   * 与 PC 端 CancelReceiveModal 对齐
   */
  onCancelReceive(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) return;

    wx.showModal({
      title: i18n.t(NS + 'withdrawArrival', this._lang),
      content: i18n.tf(NS + 'withdrawFmt', { name: name || i18n.t(NS + 'thisMaterial', this._lang) }, this._lang),
      confirmText: i18n.t(NS + 'withdrawConfirm', this._lang),
      confirmColor: '#e74c3c',
      editable: true,
      placeholderText: i18n.t(NS + 'withdrawReason', this._lang),
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: i18n.t(NS + 'withdrawingTxt', this._lang), mask: true });
        try {
          const reason = (res.content || '').trim();
          await api.production.cancelReceivePurchase({
            purchaseId: id,
            reason,
          });
          wx.hideLoading();
          toast.success(i18n.t(NS + 'withdrawn', this._lang));
          triggerDataRefresh('procurement');
          this._loadDetail();
        } catch (err) {
          wx.hideLoading();
          toast.error(err.errMsg || err.message || i18n.t(NS + 'withdrawFail', this._lang));
        }
      },
    });
  },

  /**
   * 单条确认完成：将待确认完成的采购任务标记为已完成
   * 与 PC 端 useSampleProcurementQuickActions.confirmPurchaseComplete 对齐
   */
  onConfirmComplete(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) return;

    wx.showModal({
      title: i18n.t(NS + 'confirmCompleteBtn', this._lang),
      content: i18n.tf(NS + 'completeFmt', { name: name || i18n.t(NS + 'thisMaterial', this._lang) }, this._lang),
      confirmText: i18n.t(NS + 'confirmCompleteBtn', this._lang),
      confirmColor: '#007aff',
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: i18n.t(NS + 'confirmingTxt', this._lang), mask: true });
        try {
          await api.production.confirmPurchaseComplete({ purchaseId: id });
          wx.hideLoading();
          toast.success(i18n.t(NS + 'confirmDoneTxt', this._lang));
          triggerDataRefresh('procurement');
          this._loadDetail();
        } catch (err) {
          wx.hideLoading();
          toast.error(err.errMsg || err.message || i18n.t(NS + 'confirmFail', this._lang));
        }
      },
    });
  },

  async onSubmit() {
    if (this.data.hasReturnConfirmed) {
      toast.warning(i18n.t(NS + 'blockArrival', this._lang));
      return;
    }

    const { materialPurchases, remark } = this.data;

    const hasAny = materialPurchases.some(m => m.inputQuantity && Number(m.inputQuantity) > 0);
    if (!hasAny) {
      toast.error(i18n.t(NS + 'needOneQty', this._lang));
      return;
    }

    let updates;
    try {
      updates = this._buildUpdates(materialPurchases, remark);
    } catch (e) {
      toast.error(e.message || i18n.t(NS + 'validateFailed', this._lang));
      return;
    }

    if (updates.length === 0) {
      toast.error(i18n.t(NS + 'noValidArrival', this._lang));
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: i18n.t('common.submitting', this._lang), mask: true });
    try {
      await Promise.all(updates.map(u => api.production.updateArrivedQuantity(u)));

      triggerDataRefresh('procurement');

      wx.hideLoading();
      this.setData({ submitting: false });
      toast.success(i18n.t(NS + 'arrivalOk', this._lang));
      setTimeout(() => wx.navigateBack(), 800);
    } catch (e) {
      wx.hideLoading();
      this.setData({ submitting: false });
      toast.error(e.errMsg || e.message || i18n.t('common.submitFailed', this._lang));
    }
  },

  _buildUpdates(materialPurchases, globalRemark) {
    const updates = [];
    materialPurchases.forEach(item => {
      const inputQty = Number(item.inputQuantity || 0);
      if (inputQty <= 0) return;

      const purchaseQty = Number(item.purchaseQuantity || 0);
      const prevArrived = Number(item.arrivedQuantity || 0);
      const newArrived = prevArrived + inputQty;

      const remarkText = this._validateArrival(item, inputQty, newArrived, purchaseQty, globalRemark);

      updates.push({
        id: item.id || item.purchaseId,
        arrivedQuantity: newArrived,
        remark: remarkText || '',
      });
    });
    return updates;
  },

  _validateArrival(item, inputQty, newArrived, purchaseQty, globalRemark) {
    if (purchaseQty <= 0) return globalRemark || '';

    const arrivalRate = Math.round(newArrived * 100 / purchaseQty);
    if (arrivalRate >= 70) return globalRemark || '';

    const remark = globalRemark || '';
    if (!remark.trim()) {
      const materialName = item.materialName || i18n.t(NS + 'noValidMaterial', this._lang);
      const shortageQty = purchaseQty - newArrived;
      throw new Error(i18n.tf(NS + 'lowArrivalFmt', { name: materialName, rate: arrivalRate, arrived: newArrived, total: purchaseQty, short: shortageQty }, this._lang));
    }
    return remark;
  },

  _normalizeToArray(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.records)) return res.records;
    return [];
  },

  _normalizeStatus(rawStatus) {
    return String(rawStatus || '').trim().toLowerCase();
  },

  _isActionableForUser(item, receiverId, receiverName) {
    const status = this._normalizeStatus(item.status);
    if (status === 'completed' || status === 'cancelled') return false;
    if (!status || status === 'pending') return true;
    if (status === 'received' || status === 'partial') {
      return this._isSameReceiver(item, receiverId, receiverName);
    }
    return false;
  },

  _shouldCallReceive(item, receiverId, receiverName) {
    const status = this._normalizeStatus(item.status);
    if (!status || status === 'pending') return true;
    if ((status === 'received' || status === 'partial') &&
        !this._isSameReceiver(item, receiverId, receiverName)) return true;
    return false;
  },

  _isSameReceiver(item, receiverId, receiverName) {
    const existingId = String(item.receiverId || '').trim();
    const existingName = String(item.receiverName || '').trim();
    if (receiverId && existingId) return receiverId === existingId;
    if (receiverName && existingName) return receiverName === existingName;
    return false;
  },

  /**
   * 领料出库：打开领料弹窗
   * 从已领取物料中选择领料数量，调用 createPickingPending 创建待出库领料单
   */
  onOpenPicking() {
    const pickableItems = this.data.materialPurchases.filter(m => {
      const status = this._normalizeStatus(m.status);
      return status !== 'cancelled' && status !== 'pending'
        && Number(m.arrivedQuantity || 0) > 0;
    });
    if (pickableItems.length === 0) {
      toast.warning(i18n.t(NS + 'noPickupMaterial', this._lang));
      return;
    }
    const pickingItems = pickableItems.map(m => ({
      id: m.id || m.purchaseId,
      materialName: m.materialName,
      materialCode: m.materialCode,
      specifications: m.specifications,
      unit: m.unit || '',
      arrivedQuantity: Number(m.arrivedQuantity || 0),
      pickQuantity: '',
    }));
    this.setData({ showPickingModal: true, pickingItems });
  },

  onPickingModalClose() {
    this.setData({ showPickingModal: false, pickingItems: [] });
  },

  onPickQtyInput(e) {
    const { index } = e.currentTarget.dataset;
    const value = e.detail.value;
    const pickingItems = this.data.pickingItems.map((item, i) =>
      i === index ? { ...item, pickQuantity: value } : item
    );
    this.setData({ pickingItems });
  },

  async onConfirmPicking() {
    const { pickingItems, orderId, orderNo, styleNo, isSampleMode, patternProductionId } = this.data;
    const userInfo = getUserInfo() || {};
    const pickerId = String(userInfo.id || userInfo.userId || '').trim();
    const pickerName = String(userInfo.name || userInfo.username || '').trim();

    const items = pickingItems
      .filter(m => Number(m.pickQuantity || 0) > 0)
      .map(m => ({
        materialCode: m.materialCode,
        materialName: m.materialName,
        specifications: m.specifications,
        unit: m.unit,
        quantity: Number(m.pickQuantity),
        purchaseId: m.id,
      }));

    if (items.length === 0) {
      toast.error(i18n.t(NS + 'needOnePickupQty', this._lang));
      return;
    }

    // 校验领料数量不超过到货数量
    for (const it of items) {
      const src = pickingItems.find(m => m.id === it.purchaseId);
      if (src && it.quantity > src.arrivedQuantity) {
        toast.error(i18n.tf(NS + 'qtyOverFmt', { name: it.materialName, qty: src.arrivedQuantity }, this._lang));
        return;
      }
    }

    // P0 修复（数据完整性）：样衣领料时使用 patternProductionId 关联采购，
    // 不能将空字符串 orderId/styleNo 写入 t_material_picking，否则领料单无归属失联，
    // 仓库端列表通过 orderNo/styleNo 筛选无法找到，库存锁定数据悬空无法释放。
    let pickingOrderId = orderId;
    let pickingOrderNo = orderNo;
    let pickingStyleNo = styleNo;
    let pickingUsageType = 'PRODUCTION';
    if (isSampleMode) {
      // 样衣领料：优先使用 patternProductionId（样衣任务的唯一归属ID）作为 orderId，
      // 让仓库端能按此字段检索。同时标记 usageType=SAMPLE 明确样衣领料。
      if (!pickingOrderId && patternProductionId) {
        pickingOrderId = patternProductionId;
      }
      pickingUsageType = 'SAMPLE';
      // 样衣场景至少要有一个归属字段：patternProductionId 或 styleNo
      const hasAnyAnchor = (pickingOrderId && String(pickingOrderId).trim())
        || (pickingStyleNo && String(pickingStyleNo).trim());
      if (!hasAnyAnchor) {
        wx.hideLoading ? null : null;
        toast.error(i18n.t(NS + 'missingTaskLink', this._lang));
        return;
      }
    }

    wx.showLoading({ title: i18n.t(NS + 'submittingPickup', this._lang), mask: true });
    try {
      await api.production.createPickingPending({
        picking: {
          orderId: pickingOrderId || undefined,
          orderNo: pickingOrderNo || undefined,
          styleNo: pickingStyleNo || undefined,
          patternProductionId: isSampleMode ? (patternProductionId || undefined) : undefined,
          pickerId,
          pickerName,
          usageType: pickingUsageType,
          pickupType: 'INTERNAL',
        },
        items,
      });
      wx.hideLoading();
      toast.success(i18n.t(NS + 'pickupSubmitted', this._lang));
      this.setData({ showPickingModal: false, pickingItems: [] });
      triggerDataRefresh('procurement');
      this._loadDetail();
    } catch (err) {
      wx.hideLoading();
      toast.error(err.errMsg || err.message || i18n.t(NS + 'pickupFail', this._lang));
    }
  },

});
