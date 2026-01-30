const app = getApp();

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
      // 调用后端API
      // 注意：小程序request需要封装，这里假设 app.request 或 wx.request
      // 实际开发需替换为真实的请求逻辑
      const res = await this.request('/stock/sample/page', {
        page,
        pageSize,
        styleNo: keyword // 搜索款号
      });

      if (res.code === 200) {
        const records = res.data.records || [];
        this.setData({
          list: reset ? records : [...this.data.list, ...records],
          hasMore: records.length === pageSize,
          page: page + 1
        });
      }
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

  // 简单的请求封装，实际应引用 utils/request.js
  request(url, data, method = 'GET') {
    return new Promise((resolve, reject) => {
      // 检查 token
      const token = wx.getStorageSync('token');
      // const baseUrl = 'http://localhost:8080/api'; // 开发环境
      // 假设已经在 app.js 或 config 中配置了 baseUrl
      const baseUrl = 'http://localhost:8080/api'; 

      wx.request({
        url: baseUrl + url,
        data,
        method,
        header: {
          'Authorization': token ? `Bearer ${token}` : '',
          'content-type': 'application/json'
        },
        success: (res) => {
          resolve(res.data);
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  }
});
