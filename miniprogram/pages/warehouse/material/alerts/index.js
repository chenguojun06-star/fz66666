const api = require('../../../../utils/api');
const { getUserInfo, setUserInfo } = require('../../../../utils/storage');

function toInt(value) {
  const n = Number(value);
  if (Number.isNaN(n)) {
    return 0;
  }
  return Math.max(0, Math.floor(n));
}

Page({
  data: {
    list: [],
    loading: false,
    days: 30,
    onlyNeed: true,
    orderModal: {
      visible: false,
      submitting: false,
      quantity: 1,
      shortage: 0,
      remark: '',
      item: null,
    },
  },

  onLoad() {
    this.loadData();
  },

  async loadData() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const list = await api.material.listStockAlerts({
        onlyNeed: this.data.onlyNeed ? 'true' : 'false',
        days: this.data.days,
        limit: 100,
      });
      const mapped = (Array.isArray(list) ? list : []).map(item => {
        const quantity = toInt(item && item.quantity);
        const safetyStock = toInt(item && item.suggestedSafetyStock != null ? item.suggestedSafetyStock : item && item.safetyStock);
        const shortage = Math.max(0, safetyStock - quantity);
        return {
          ...item,
          quantity,
          safetyStock,
          shortage,
          materialTypeText: item && item.materialType ? String(item.materialType) : '-',
          specText: `${item && item.color ? item.color : '-'} / ${item && item.size ? item.size : '-'}`,
          recentOutQuantity: toInt(item && item.recentOutQuantity),
          dailyOutQuantity: toInt(item && item.dailyOutQuantity),
          needReplenish: Boolean(item && item.needReplenish),
        };
      });
      mapped.sort((a, b) => this.getShortage(b) - this.getShortage(a));
      this.setData({ list: mapped });
    } catch (e) {
      wx.showToast({ title: `加载失败: ${(e && e.message) || '请稍后重试'}`, icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  getShortage(item) {
    const target = toInt(item && (item.suggestedSafetyStock ?? item.safetyStock));
    const current = toInt(item && item.quantity);
    const diff = target - current;
    return diff > 0 ? diff : 0;
  },

  onChangeDays(e) {
    const days = toInt(e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.days : 0);
    if (!days || days === this.data.days) {
      return;
    }
    this.setData({ days }, () => this.loadData());
  },

  onToggleNeedOnly() {
    this.setData({ onlyNeed: !this.data.onlyNeed }, () => this.loadData());
  },

  onItemTap(e) {
    const item = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.item : null;
    if (!item) return;
    this.goMaterialDetail(item);
  },

  onQuickOrderTap(e) {
    const item = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.item : null;
    if (!item) return;
    const shortage = this.getShortage(item);
    this.setData({
      orderModal: {
        visible: true,
        submitting: false,
        quantity: shortage > 0 ? shortage : 1,
        shortage,
        remark: '',
        item,
      },
    });
  },

  onViewDetailTap(e) {
    const item = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.item : null;
    if (!item) return;
    this.goMaterialDetail(item);
  },

  goMaterialDetail(item) {
    const query = [
      `materialCode=${encodeURIComponent(item.materialCode || '')}`,
      `materialName=${encodeURIComponent(item.materialName || '')}`,
      `color=${encodeURIComponent(item.color || '')}`,
      `size=${encodeURIComponent(item.size || '')}`,
      `unit=${encodeURIComponent(item.unit || '')}`,
      `quantity=${encodeURIComponent(String(item.quantity || 0))}`,
      `safetyStock=${encodeURIComponent(String(item.safetyStock || 0))}`,
      `recentOutQuantity=${encodeURIComponent(String(item.recentOutQuantity || 0))}`,
    ].join('&');
    wx.navigateTo({
      url: `/pages/warehouse/material/detail-page/index?${query}`,
    });
  },

  onQtyInput(e) {
    const value = toInt(e && e.detail && e.detail.value);
    this.setData({ 'orderModal.quantity': value });
  },

  onQtyStep(e) {
    const delta = Number(e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.delta : 0);
    const current = toInt(this.data.orderModal.quantity);
    const next = Math.max(1, current + delta);
    this.setData({ 'orderModal.quantity': next });
  },

  onUseShortageQty() {
    const shortage = toInt(this.data.orderModal.shortage);
    this.setData({ 'orderModal.quantity': shortage > 0 ? shortage : 1 });
  },

  onRemarkInput(e) {
    const value = e && e.detail && e.detail.value ? e.detail.value : '';
    this.setData({ 'orderModal.remark': value });
  },

  onCancelOrder() {
    this.setData({
      orderModal: {
        visible: false,
        submitting: false,
        quantity: 1,
        shortage: 0,
        remark: '',
        item: null,
      },
    });
  },

  async onConfirmOrder() {
    const modal = this.data.orderModal;
    const item = modal.item;
    if (!item) return;
    const qty = Number(modal.quantity || 0);
    if (!qty || qty <= 0) {
      wx.showToast({ title: '请输入数量', icon: 'none' });
      return;
    }

    let user = getUserInfo();
    if (!user || !user.id) {
      try {
        const me = await api.system.getMe();
        if (me) {
          setUserInfo(me);
          user = me;
        }
      } catch (e) {
        // 获取用户信息失败静默处理
      }
    }

    const receiverId = user && user.id ? String(user.id) : '';
    const receiverName = String(user && (user.name || user.realName || user.username) || '').trim();
    const roleName = String(user && user.roleName || '').trim();
    const roleCode = String(user && user.roleCode || '').trim().toLowerCase();
    const roleId = String(user && user.roleId || '').trim();
    const allow = roleName.includes('主管') || roleName.includes('管理员') || roleCode.includes('admin') || roleId === '1';
    if (!allow) {
      wx.showToast({ title: '仅主管可下发采购需求', icon: 'none' });
      return;
    }
    if (!receiverId || !receiverName) {
      wx.showToast({ title: '无法获取采购人信息', icon: 'none' });
      return;
    }

    this.setData({ 'orderModal.submitting': true });
    try {
      await api.production.createPurchaseInstruction({
        materialId: item.materialId,
        materialCode: item.materialCode,
        materialName: item.materialName,
        materialType: item.materialType,
        unit: item.unit,
        color: item.color,
        size: item.size,
        purchaseQuantity: qty,
        receiverId,
        receiverName,
        remark: modal.remark || '',
      });
      wx.showToast({ title: '已下发指令', icon: 'none' });
      this.onCancelOrder();
    } catch (e) {
      console.error('下单失败', e);
      wx.showToast({ title: e.errMsg || '下单失败', icon: 'none' });
    } finally {
      this.setData({ 'orderModal.submitting': false });
    }
  },

  goScan() {
    wx.switchTab({ url: '/pages/scan/index' });
  },
});
