const api = require('../../../../utils/api');

function mapStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'returned') return '已归还';
  if (s === 'lost') return '丢失';
  return '借出中';
}

Page({
  data: {
    sampleStockId: '',
    styleNo: '',
    list: [],
    loading: false
  },

  onLoad(options) {
    const sampleStockId = options.sampleStockId || '';
    const styleNo = options.styleNo || '';
    this.setData({ sampleStockId, styleNo });
    this.loadData();
  },

  async loadData() {
    const { sampleStockId } = this.data;
    if (!sampleStockId) {
      wx.showToast({ title: '缺少样衣信息', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const list = await api.stock.listSampleLoans(sampleStockId);
      const mapped = Array.isArray(list)
        ? list.map(item => ({
            ...item,
            statusText: mapStatus(item.status)
          }))
        : [];
      this.setData({ list: mapped });
    } catch (error) {
      console.error('加载借调记录失败', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
