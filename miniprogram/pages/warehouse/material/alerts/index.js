const api = require('../../../../utils/api');
const { getUserInfo, setUserInfo } = require('../../../../utils/storage');

Page({
  data: {
    list: [],
    loading: false,
    days: 30,
    orderModal: {
      visible: false,
      submitting: false,
      quantity: 1,
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
      const list = await api.material.listStockAlerts({ onlyNeed: 'true', days: this.data.days, limit: 100 });
      const mapped = Array.isArray(list) ? list : [];
      mapped.sort((a, b) => this.getShortage(b) - this.getShortage(a));
      this.setData({ list: mapped });
    } catch (e) {
      console.error('加载库存预警失败', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  getShortage(item) {
    const target = Number(item && (item.suggestedSafetyStock ?? item.safetyStock) || 0);
    const current = Number(item && item.quantity || 0);
    const diff = target - current;
    return diff > 0 ? diff : 0;
  },

  onItemTap(e) {
    const item = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.item : null;
    if (!item) return;
    const shortage = this.getShortage(item);
    this.setData({
      orderModal: {
        visible: true,
        submitting: false,
        quantity: shortage > 0 ? shortage : 1,
        remark: '',
        item,
      },
    });
  },

  onQtyInput(e) {
    const value = Number(e && e.detail && e.detail.value || 0);
    this.setData({ 'orderModal.quantity': value });
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
        console.error('获取用户信息失败', e);
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
