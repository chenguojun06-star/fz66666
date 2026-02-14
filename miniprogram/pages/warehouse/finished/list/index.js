const api = require('../../../../utils/api');
const { getBaseUrl } = require('../../../../config');

Page({
  data: {
    keyword: '',
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    isRefreshing: false,
    stats: {
      totalQty: 0,
      availableQty: 0,
      defectQty: 0
    }
  },

  onLoad() {
    this.loadData(true);
  },

  onShow() {
    if (this.data.list.length > 0) {
      this.loadData(true);
    }
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.loadData(true);
  },

  async loadData(reset) {
    if (this.data.loading) return;
    if (reset) {
      this.setData({ page: 1, hasMore: true, list: [] });
    }
    if (!this.data.hasMore) return;

    this.setData({ loading: true });
    try {
      const { page, pageSize, keyword } = this.data;
      const params = { page, pageSize };
      const kw = String(keyword || '').trim();
      if (kw) {
        params.keyword = kw;
        params.styleNo = kw;
      }

      const data = await api.warehouse.listFinishedInventory(params);
      const records = (data && data.records) || [];
      const baseUrl = getBaseUrl();

      // 按styleNo聚合
      const styleMap = new Map();
      for (const item of records) {
        const key = item.styleNo;
        if (!styleMap.has(key)) {
          styleMap.set(key, {
            id: item.id,
            styleNo: item.styleNo,
            styleName: item.styleName,
            imageUrl: item.styleImage ? (baseUrl + item.styleImage) : '',
            colors: item.colors || [],
            sizes: item.sizes || [],
            availableQty: 0,
            lockedQty: 0,
            defectQty: 0
          });
        }
        const agg = styleMap.get(key);
        agg.availableQty += Number(item.availableQty) || 0;
        agg.lockedQty += Number(item.lockedQty) || 0;
        agg.defectQty += Number(item.defectQty) || 0;
      }

      const items = Array.from(styleMap.values());
      const newList = reset ? items : this.data.list.concat(items);

      // 计算统计
      let totalQty = 0;
      let availableQty = 0;
      let defectQty = 0;
      for (const it of newList) {
        totalQty += it.availableQty + it.lockedQty + it.defectQty;
        availableQty += it.availableQty;
        defectQty += it.defectQty;
      }

      this.setData({
        list: newList,
        hasMore: records.length === pageSize,
        page: page + 1,
        stats: { totalQty, availableQty, defectQty }
      });
    } catch (error) {
      console.error('加载成品库存失败', error);
      const errMsg = (error && error.errMsg) || '加载失败';
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
    this.loadData(false);
  },

  navToOutstock(e) {
    const styleNo = e.currentTarget.dataset.styleno || '';
    wx.navigateTo({
      url: '/pages/warehouse/finished/outstock/index?keyword=' + encodeURIComponent(styleNo)
    });
  }
});
