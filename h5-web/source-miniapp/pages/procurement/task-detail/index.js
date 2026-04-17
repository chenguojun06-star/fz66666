const api = require('../../../utils/api');
const { getUserInfo } = require('../../../utils/storage');
const { toast } = require('../../../utils/uiHelper');
const { triggerDataRefresh } = require('../../../utils/eventBus');

const MATERIAL_TYPE_MAP = {
  fabricA: '主面料', fabricB: '辅面料',
  liningA: '里料', liningB: '夹里', liningC: '衬布/粘合衬',
  accessoryA: '拉链', accessoryB: '纽扣', accessoryC: '配件'
};

Page({
  data: {
    orderId: '',
    orderNo: '',
    styleNo: '',
    loading: false,
    submitting: false,
    materialPurchases: [],
    remark: '',
    hasInput: false,
    canConfirmProcurement: false,
    overallArrivalRate: -1,
  },

  onLoad(options) {
    this.orderNo = decodeURIComponent(options.orderNo || '');
    const styleNo = decodeURIComponent(options.styleNo || '');
    this.setData({ orderNo: this.orderNo, styleNo });
    if (this.orderNo) this._loadDetail();
  },

  onPullDownRefresh() {
    this._loadDetail().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
  },

  async _loadDetail() {
    this.setData({ loading: true });
    try {
      const res = await api.production.getMaterialPurchases({ orderNo: this.orderNo });
      const list = this._normalizeToArray(res);
      const userInfo = getUserInfo() || {};
      const receiverId = String(userInfo.id || userInfo.userId || '').trim();
      const receiverName = String(userInfo.name || userInfo.username || '').trim();

      let totalPurchased = 0;
      let totalArrived = 0;
      let hasUnconfirmed = false;

      const materialPurchases = list.map(item => {
        const status = this._normalizeStatus(item.status);
        const isComplete = status === 'completed';
        const isActionable = !isComplete && this._isActionableForUser(item, receiverId, receiverName);
        const needsReceive = this._shouldCallReceive(item, receiverId, receiverName);
        const returnConfirmed = Number(item.returnConfirmed || 0) === 1;
        const canConfirmReturn = !returnConfirmed && (status === 'received' || status === 'partial' || status === 'completed');

        const purchaseQty = Number(item.purchaseQuantity || 0);
        const arrivedQty = Number(item.arrivedQuantity || 0);
        totalPurchased += purchaseQty;
        totalArrived += arrivedQty;
        if (!returnConfirmed) hasUnconfirmed = true;

        const returnConfirmTimeText = item.returnConfirmTime
          ? item.returnConfirmTime.substring(5, 16)
          : '';

        return {
          ...item,
          materialTypeCN: MATERIAL_TYPE_MAP[item.materialType] || item.materialType || '',
          statusText: this._getStatusText(status),
          statusColor: this._getStatusColor(status),
          isActionable,
          needsReceive,
          isComplete,
          returnConfirmed,
          canConfirmReturn,
          inputQuantity: '',
          arrivalRate: purchaseQty > 0 ? Math.round(arrivedQty / purchaseQty * 100) : 0,
          returnConfirmTimeText,
        };
      });

      const orderId = (materialPurchases[0] && (materialPurchases[0].orderId || materialPurchases[0].order_id)) || '';
      const overallArrivalRate = totalPurchased > 0 ? Math.round(totalArrived / totalPurchased * 100) : 0;
      const canConfirmProcurement = hasUnconfirmed && overallArrivalRate >= 50;

      this.setData({ orderId, materialPurchases, loading: false, overallArrivalRate, canConfirmProcurement });
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
    const userInfo = getUserInfo() || {};
    const receiverId = String(userInfo.id || userInfo.userId || '').trim();
    const receiverName = String(userInfo.name || userInfo.username || '').trim();

    if (!receiverId && !receiverName) {
      toast.error('采购人信息缺失，请重新登录');
      return;
    }

    const pendingItems = this.data.materialPurchases.filter(item => item.needsReceive);
    if (pendingItems.length === 0) {
      toast.success('所有物料均已采购');
      return;
    }

    wx.showLoading({ title: '采购中...', mask: true });
    try {
      await Promise.all(pendingItems.map(item =>
        api.production.receivePurchase({
          purchaseId: item.id || item.purchaseId,
          receiverId,
          receiverName
        })
      ));
      wx.hideLoading();
      toast.success(`已采购 ${pendingItems.length} 项`);
      this._loadDetail();
    } catch (e) {
      wx.hideLoading();
      toast.error(e.errMsg || e.message || '采购失败');
    }
  },

  async onReturnConfirm(e) {
    const { id, name, arrived, unit } = e.currentTarget.dataset;
    if (!id) return;

    wx.showModal({
      title: '确认回料',
      content: `确认「${name || '该物料'}」回料 ${arrived || 0}${unit || ''}？`,
      confirmText: '确认回料',
      confirmColor: '#1677ff',
      success: async (res) => {
        if (!res.confirm) return;

        const userInfo = getUserInfo() || {};
        const confirmerId = String(userInfo.id || userInfo.userId || '').trim();
        const confirmerName = String(userInfo.name || userInfo.username || '').trim();

        wx.showLoading({ title: '确认中...', mask: true });
        try {
          await api.production.confirmReturnPurchase({
            purchaseId: id,
            confirmerId,
            confirmerName,
            returnQuantity: Number(arrived) || 0,
          });
          wx.hideLoading();
          toast.success('回料确认成功');

          triggerDataRefresh('procurement');

          this._loadDetail();
        } catch (err) {
          wx.hideLoading();
          toast.error(err.errMsg || err.message || '确认失败');
        }
      }
    });
  },

  async onConfirmProcurement() {
    const { orderId, orderNo, overallArrivalRate } = this.data;
    if (!orderNo) return;

    wx.showModal({
      title: '确认回料完成',
      content: `当前到货率 ${overallArrivalRate}%，确认后采购阶段将流转到裁剪环节。确定？`,
      confirmText: '确认完成',
      confirmColor: '#1677ff',
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
      }
    });
  },

  async onSubmit() {
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
        remark: remarkText || ''
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
        `还差${shortageQty}，请填写备注说明原因`
      );
    }
    return remark;
  },

  _normalizeToArray(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.records)) return res.records;
    if (res && Array.isArray(res.data)) return res.data;
    return [];
  },

  _normalizeStatus(rawStatus) {
    return String(rawStatus || '').trim().toLowerCase();
  },

  _getStatusText(status) {
    const map = {
      pending: '待采购', received: '已领取', partial: '部分到货',
      partial_arrival: '部分到货', awaiting_confirm: '待确认完成',
      completed: '全部到货', cancelled: '已取消', warehouse_pending: '待仓库出库',
      waiting_procurement: '待采购', procurement_in_progress: '采购中',
      procurement_completed: '已完成',
    };
    return map[status] || '待采购';
  },

  _getStatusColor(status) {
    const map = {
      pending: 'orange', received: 'blue', partial: 'blue',
      partial_arrival: 'blue', awaiting_confirm: 'gold', completed: 'green',
      cancelled: 'gray', warehouse_pending: 'cyan',
      waiting_procurement: 'orange', procurement_in_progress: 'blue',
      procurement_completed: 'green',
    };
    return map[status] || 'orange';
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
  }
});
