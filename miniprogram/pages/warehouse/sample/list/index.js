const api = require('../../../../utils/api');

Page({
  data: {
    keyword: '',
    list: [],  // 移除 allList，不再需要客户端缓存所有数据
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    isRefreshing: false,
    filterType: 'all',  // 'all' | 'pending' | 具体样衣类型（如需支持）
    totalQuantity: 0,
    pendingReturnQuantity: 0
  },

  onLoad() {
    this.loadData(true);
  },

  /**
   * ✅ 新增：页面显示时自动刷新数据
   * 解决问题：入库/借出/归还操作后返回列表，数据自动更新
   */
  onShow() {
    // 如果不是首次加载（page > 1表示已加载过数据），则刷新列表
    if (this.data.page > 1 || this.data.list.length > 0) {
      this.loadData(true);
    }
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
      const { page, pageSize, keyword, filterType } = this.data;

      // ✅ 统一使用服务端过滤，与PC端一致
      const sampleType = filterType === 'all' ? undefined : filterType;

      const data = await api.stock.listSamples({
        page,
        pageSize,
        styleNo: keyword,
        sampleType: sampleType  // ✅ 新增：传递样衣类型参数
      });

      const records = (data && data.records) || [];
      const total = data.total || 0;

      // ✅ 直接使用服务端返回的数据，不再客户端过滤
      const list = reset ? records : [...this.data.list, ...records];

      // 计算汇总数据（从服务端返回的完整数据计算）
      const totalQuantity = list.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      const pendingReturnQuantity = list.reduce((sum, item) => sum + (Number(item.loanedQuantity) || 0), 0);

      this.setData({
        list: list,
        totalQuantity,
        pendingReturnQuantity,
        hasMore: records.length === pageSize,
        page: page + 1
      });
    } catch (error) {
      console.error('加载样衣列表失败', error);
      const errMsg = (error && error.errMsg) || (error && error.message) || '加载失败';
      wx.showToast({ title: errMsg, icon: 'none', duration: 3000 });
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

  onFilterTap(e) {
    const type = e.currentTarget.dataset.type;
    if (!type || type === this.data.filterType) {
      return;
    }
    // ✅ 切换筛选时重新从服务端加载数据
    this.setData({
      filterType: type
    }, () => {
      this.loadData(true);  // 重置并重新加载
    });
  },

  navToOperation(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: `/pages/warehouse/sample/operation/index?type=${type}`
    });
  },
  navToOperationByItem(e) {
    const type = e.currentTarget.dataset.type;
    const styleNo = e.currentTarget.dataset.styleno || '';
    wx.navigateTo({
      url: `/pages/warehouse/sample/operation/index?type=${type}&styleNo=${encodeURIComponent(styleNo)}`
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
