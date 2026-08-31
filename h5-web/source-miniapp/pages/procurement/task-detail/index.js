const api = require('../../../utils/api');
const { getUserInfo } = require('../../../utils/storage');
const { toast } = require('../../../utils/uiHelper');
const { eventBus, Events, triggerDataRefresh } = require('../../../utils/eventBus');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const displayHelper = require('../../../utils/displayHelper');

const MATERIAL_TYPE_MAP = {
  fabricA: '主面料', fabricB: '辅面料',
  liningA: '里料', liningB: '夹里', liningC: '衬布/粘合衬',
  accessoryA: '拉链', accessoryB: '纽扣', accessoryC: '配件',
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
  procuring: { text: '采购中', color: displayHelper.STATUS_COLOR_BLUE },
  waiting_procurement: { text: '待采购', color: displayHelper.STATUS_COLOR_WARNING },
  procurement_in_progress: { text: '采购中', color: displayHelper.STATUS_COLOR_BLUE },
  material_preparation: { text: '物料准备中', color: displayHelper.STATUS_COLOR_BLUE },
  procurement_completed: { text: '采购完成', color: displayHelper.STATUS_COLOR_SUCCESS },
  partial_arrived: { text: '部分到货', color: displayHelper.STATUS_COLOR_CYAN },
  canceled: { text: '已取消', color: displayHelper.STATUS_COLOR_DEFAULT },
};

/**
 * 统一采购状态文案：优先 displayHelper，未命中查本地兜底
 */
function resolvePurchaseText(status) {
  if (!status) return '';
  const text = displayHelper.displayPurchaseStatusText(status);
  if (text !== status) return text;
  const fb = LOCAL_PURCHASE_FALLBACK[status];
  return fb ? fb.text : text;
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

  onLoad(options) {
    this.orderNo = decodeURIComponent(options.orderNo || '');
    this.patternProductionId = decodeURIComponent(options.patternProductionId || '');
    this.sourceType = decodeURIComponent(options.sourceType || '');
    const styleNo = decodeURIComponent(options.styleNo || '');
    const isSampleMode = this.sourceType === 'sample' || !!this.patternProductionId;
    this.setData({
      orderNo: this.orderNo,
      patternProductionId: this.patternProductionId,
      sourceType: this.sourceType,
      styleNo,
      isSampleMode,
    });
    if (this.orderNo || this.patternProductionId) this._loadDetail();
  },

  onShow() {
    if (this.orderNo || this.patternProductionId) this._loadDetail();
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
        if (this.orderNo || this.patternProductionId) this._loadDetail();
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
        : { patternProductionId: this.patternProductionId };
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
          materialTypeCN: MATERIAL_TYPE_MAP[item.materialType] || item.materialType || '',
          statusText: resolvePurchaseText(status),
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
      toast.error('加载失败');
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
      toast.warning('已有物料完成回料确认，无法继续采购');
      return;
    }

    const userInfo = getUserInfo() || {};
    const receiverId = String(userInfo.id || userInfo.userId || '').trim();
    const receiverName = String(userInfo.name || userInfo.username || '').trim();

    if (!receiverId && !receiverName) {
      toast.error('采购人信息缺失，请重新登录');
      return;
    }

    const pendingItems = this.data.materialPurchases.filter(item => item.needsReceive);
    if (pendingItems.length === 0) {
      toast.success('所有物料均已领取');
      return;
    }

    wx.showLoading({ title: '采购中...', mask: true });
    try {
      await Promise.all(pendingItems.map(item =>
        api.production.receivePurchase({
          purchaseId: item.id || item.purchaseId,
          receiverId,
          receiverName,
        }),
      ));
      wx.hideLoading();
      toast.success(`已领取 ${pendingItems.length} 项`);
      this._loadDetail();
    } catch (e) {
      wx.hideLoading();
      toast.error(e.errMsg || e.message || '采购失败');
    }
  },

  onReturnConfirm(e) {
    const { id, name, arrived, purchase, unit } = e.currentTarget.dataset;
    if (!id) return;
    const defaultQty = String((Number(arrived) > 0 ? Number(arrived) : Number(purchase)) || 0);
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
      toast.error('最多上传5张');
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
        }).catch(() => toast.error('图片上传失败'));
      },
      fail(err) {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showModal({
            title: '相机/相册权限',
            content: '需要相机或相册权限才能上传照片，请在设置中允许',
            confirmText: '去设置',
            cancelText: '取消',
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
      toast.error('请输入有效的回料数量');
      return;
    }
    const userInfo = getUserInfo() || {};
    const confirmerId = String(userInfo.id || userInfo.userId || '').trim();
    const confirmerName = String(userInfo.name || userInfo.username || '').trim();
    const evidenceImageUrls = returnConfirmImages.map(i => i.raw).join(',') || undefined;

    this.setData({ returnConfirmSubmitting: true });
    wx.showLoading({ title: '确认中...', mask: true });
    try {
      await api.production.confirmReturnPurchase({
        purchaseId: returnConfirmItem.id,
        confirmerId,
        confirmerName,
        returnQuantity: qty,
        ...(evidenceImageUrls ? { evidenceImageUrls } : {}),
      });
      wx.hideLoading();
      toast.success('回料确认成功');
      this.setData({ showReturnConfirmModal: false, returnConfirmImages: [] });
      triggerDataRefresh('procurement');
      this._loadDetail();
    } catch (err) {
      wx.hideLoading();
      toast.error(err.errMsg || err.message || '确认失败');
    } finally {
      this.setData({ returnConfirmSubmitting: false });
    }
  },

  async onConfirmProcurement() {
    // 样衣场景无订单流转，按钮已隐藏，此处防御性返回
    if (this.data.isSampleMode) return;
    if (this.data.hasReturnConfirmed) {
      toast.warning('已有物料完成回料确认，无需再次确认');
      return;
    }

    const { orderId, orderNo, overallArrivalRate } = this.data;
    if (!orderNo) return;

    wx.showModal({
      title: '确认回料完成',
      content: `当前到货率 ${overallArrivalRate}%，确认后采购阶段将流转到裁剪环节。确定？`,
      confirmText: '确认完成',
      confirmColor: '#007aff',
      editable: true,
      placeholderText: '备注（选填）',
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '确认中...', mask: true });
        try {
          const remark = (res.content || '').trim();
          await api.production.confirmProcurementComplete({
            id: orderId,
            orderNo,
            remark,
          });
          wx.hideLoading();
          toast.success('采购阶段已完成，已流转到裁剪');

          triggerDataRefresh('procurement');

          setTimeout(() => wx.navigateBack(), 1000);
        } catch (err) {
          wx.hideLoading();
          toast.error(err.errMsg || err.message || '确认失败');
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
      title: '撤回到货',
      content: `确认撤回「${name || '该物料'}」的到货登记？到货数量将清零，状态恢复为待采购。`,
      confirmText: '确认撤回',
      confirmColor: '#e74c3c',
      editable: true,
      placeholderText: '撤回原因（选填）',
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '撤回中...', mask: true });
        try {
          const reason = (res.content || '').trim();
          await api.production.cancelReceivePurchase({
            purchaseId: id,
            reason,
          });
          wx.hideLoading();
          toast.success('已撤回到货');
          triggerDataRefresh('procurement');
          this._loadDetail();
        } catch (err) {
          wx.hideLoading();
          toast.error(err.errMsg || err.message || '撤回失败');
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
      title: '确认完成',
      content: `确认「${name || '该物料'}」采购已完成？`,
      confirmText: '确认完成',
      confirmColor: '#007aff',
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '确认中...', mask: true });
        try {
          await api.production.confirmPurchaseComplete({ purchaseId: id });
          wx.hideLoading();
          toast.success('已确认完成');
          triggerDataRefresh('procurement');
          this._loadDetail();
        } catch (err) {
          wx.hideLoading();
          toast.error(err.errMsg || err.message || '确认失败');
        }
      },
    });
  },

  async onSubmit() {
    if (this.data.hasReturnConfirmed) {
      toast.warning('已有物料完成回料确认，无法继续到货登记');
      return;
    }

    const { materialPurchases, remark } = this.data;

    const hasAny = materialPurchases.some(m => m.inputQuantity && Number(m.inputQuantity) > 0);
    if (!hasAny) {
      toast.error('请至少填写一种物料的到货数量');
      return;
    }

    let updates;
    try {
      updates = this._buildUpdates(materialPurchases, remark);
    } catch (e) {
      toast.error(e.message || '校验失败');
      return;
    }

    if (updates.length === 0) {
      toast.error('没有有效的到货数据');
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });
    try {
      await Promise.all(updates.map(u => api.production.updateArrivedQuantity(u)));

      triggerDataRefresh('procurement');

      wx.hideLoading();
      this.setData({ submitting: false });
      toast.success('到货登记成功');
      setTimeout(() => wx.navigateBack(), 800);
    } catch (e) {
      wx.hideLoading();
      this.setData({ submitting: false });
      toast.error(e.errMsg || e.message || '提交失败');
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
      const materialName = item.materialName || '未知物料';
      const shortageQty = purchaseQty - newArrived;
      throw new Error(
        `「${materialName}」到货率仅${arrivalRate}%（${newArrived}/${purchaseQty}），` +
        `还差${shortageQty}，请填写备注说明原因`,
      );
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
      toast.warning('暂无可领料的物料（需先采购到货）');
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
      toast.error('请至少填写一种物料的领料数量');
      return;
    }

    // 校验领料数量不超过到货数量
    for (const it of items) {
      const src = pickingItems.find(m => m.id === it.purchaseId);
      if (src && it.quantity > src.arrivedQuantity) {
        toast.error(`「${it.materialName}」领料数量不能超过到货数量(${src.arrivedQuantity})`);
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
        toast.error('样衣领料缺少任务关联信息，请返回上一页重试');
        return;
      }
    }

    wx.showLoading({ title: '提交领料...', mask: true });
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
      toast.success('领料申请已提交，等待仓库确认出库');
      this.setData({ showPickingModal: false, pickingItems: [] });
      triggerDataRefresh('procurement');
      this._loadDetail();
    } catch (err) {
      wx.hideLoading();
      toast.error(err.errMsg || err.message || '领料提交失败');
    }
  },

});
