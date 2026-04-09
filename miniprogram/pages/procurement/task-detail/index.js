const api = require('../../../utils/api');
const { getUserInfo } = require('../../../utils/storage');
const { toast } = require('../../../utils/uiHelper');

Page({
  data: {
    orderNo: '',
    styleNo: '',
    loading: false,
    submitting: false,
    materialPurchases: [],
    remark: '',
    hasInput: false
  },

  onLoad(options) {
    this.orderNo = decodeURIComponent(options.orderNo || '');
    const styleNo = decodeURIComponent(options.styleNo || '');
    this.setData({ orderNo: this.orderNo, styleNo });
    if (this.orderNo) this._loadDetail();
  },

  onPullDownRefresh() {
    this._loadDetail().then(() => wx.stopPullDownRefresh());
  },

  async _loadDetail() {
    this.setData({ loading: true });
    try {
      const res = await api.production.getMaterialPurchases({ orderNo: this.orderNo });
      const list = this._normalizeToArray(res);
      const userInfo = getUserInfo() || {};
      const receiverId = String(userInfo.id || userInfo.userId || '').trim();
      const receiverName = String(userInfo.name || userInfo.username || '').trim();

      const materialPurchases = list.map(item => {
        const status = this._normalizeStatus(item.status);
        const isComplete = status === 'completed';
        const isActionable = !isComplete && this._isActionableForUser(item, receiverId, receiverName);
        const needsReceive = this._shouldCallReceive(item, receiverId, receiverName);

        return {
          ...item,
          statusText: this._getStatusText(status),
          statusColor: this._getStatusColor(status),
          isActionable,
          needsReceive,
          isComplete,
          inputQuantity: '',
          arrivalRate: item.purchaseQuantity > 0
            ? Math.round((item.arrivedQuantity || 0) / item.purchaseQuantity * 100)
            : 0
        };
      });

      this.setData({ materialPurchases, loading: false });
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
      toast.error('领取人信息缺失，请重新登录');
      return;
    }

    const pendingItems = this.data.materialPurchases.filter(item => item.needsReceive);
    if (pendingItems.length === 0) {
      toast.success('所有物料均已领取');
      return;
    }

    wx.showLoading({ title: '领取中...', mask: true });
    try {
      await Promise.all(pendingItems.map(item =>
        api.production.receivePurchase({
          purchaseId: item.id || item.purchaseId,
          receiverId,
          receiverName
        })
      ));
      wx.hideLoading();
      toast.success(`已领取 ${pendingItems.length} 项`);
      this._loadDetail();
    } catch (e) {
      wx.hideLoading();
      toast.error(e.errMsg || e.message || '领取失败');
    }
  },

  async onSubmit() {
    const { materialPurchases, remark } = this.data;

    // Validate at least one input
    const hasAny = materialPurchases.some(m => m.inputQuantity && Number(m.inputQuantity) > 0);
    if (!hasAny) {
      toast.error('请至少填写一种物料的到货数量');
      return;
    }

    // Build updates with 70% validation
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

      // Emit event for other pages to refresh
      const eventBus = getApp()?.globalData?.eventBus;
      if (eventBus) {
        eventBus.emit('DATA_REFRESH', { type: 'procurement' });
      }

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

      // 70% arrival validation (from ProcurementHandler)
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

    // Below 70% threshold — must have remark
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
    const map = { pending: '待领取', received: '已领取', partial: '部分到货', completed: '已完成', cancelled: '已取消' };
    return map[status] || '待领取';
  },

  _getStatusColor(status) {
    const map = { pending: 'orange', received: 'blue', partial: 'blue', completed: 'green', cancelled: 'gray' };
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
