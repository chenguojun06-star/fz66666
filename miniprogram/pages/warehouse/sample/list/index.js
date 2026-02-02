const api = require('../../../../utils/api');

Page({
  data: {
    keyword: '',
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    isRefreshing: false
  },

  onLoad() {
    this.loadData(true);
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.loadData(true);
  },

  handleScan() {
    wx.scanCode({
      success: (res) => {
        // 假设扫码结果是款号
        const result = res.result;
        if (result) {
          this.setData({ keyword: result }, () => {
            this.loadData(true);
          });
        }
      },
      fail: (err) => {
        console.error('扫码失败', err);
        wx.showToast({
          title: '扫码失败',
          icon: 'none'
        });
      }
    });
  },

  async loadData(reset = false) {
    if (this.data.loading) return;

    if (reset) {
      this.setData({ page: 1, hasMore: true, list: [] });
    }

    if (!this.data.hasMore) return;

    this.setData({ loading: true });

    try {
      const { page, pageSize, keyword } = this.data;
      const data = await api.stock.listSamples({
        page,
        pageSize,
        styleNo: keyword
      });
      const records = (data && data.records) || [];
      this.setData({
        list: reset ? records : [...this.data.list, ...records],
        hasMore: records.length === pageSize,
        page: page + 1
      });
    } catch (error) {
      console.error('加载列表失败', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false, isRefreshing: false });
    }
  },

  onRefresh() {
    this.setData({ isRefreshing: true });
    this.loadData(true);
  },

  onLoadMore() {
    this.loadData();
  },

  navToOperation(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: `/pages/warehouse/sample/operation/index?type=${type}`
    });
  },
  navToLoanList(e) {
    const id = e.currentTarget.dataset.id;
    const styleNo = e.currentTarget.dataset.styleno;
    if (!id) {
      wx.showToast({ title: '样衣信息缺失', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/warehouse/sample/loan-list/index?sampleStockId=${id}&styleNo=${encodeURIComponent(styleNo || '')}`
    });
  }
});
