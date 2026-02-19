const api = require('../../../utils/api');

Page({
  data: {
    list: [],
    loading: false,
  },

  onLoad() {
    this.loadData();
  },

  async loadData() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const res = await api.style.listStyles({ page: 1, pageSize: 200, onlyCompleted: true });
      const records = res && res.records ? res.records : [];
      const list = records
        .filter((item) => Number(item.orderCount || 0) > 0)
        .sort((a, b) => Number(b.orderCount || 0) - Number(a.orderCount || 0))
        .slice(0, 50)
        .map((item, idx) => ({
          id: item.id,
          styleId: item.id,
          styleNo: item.styleNo,
          styleName: item.styleName,
          orderCount: item.orderCount || 0,
          rank: idx + 1,
        }));
      this.setData({ list });
    } catch (e) {
      console.error('加载下单排行失败', e);
      wx.showToast({ title: `加载失败: ${(e && e.message) || '请稍后重试'}`, icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onCreateOrder(e) {
    const item = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.item : null;
    if (!item || !item.styleId) return;

    wx.showModal({
      title: '推送到下单管理',
      content: `是否推送款号 ${item.styleNo || ''} 到下单管理？`,
      confirmText: '推送',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const data = await api.orderManagement.createFromStyle({ styleId: item.styleId });
          const msg = data && data.message ? data.message : '已推送到下单管理';
          wx.showToast({ title: msg, icon: 'none' });
        } catch (err) {
          console.error('推送失败', err);
          wx.showToast({ title: err.errMsg || '推送失败', icon: 'none' });
        }
      },
    });
  },
});
