const api = require('../../../utils/api');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');

const STATUS_OPTIONS = [
  { label: '全部', value: '' },
  { label: '有库存', value: 'available' },
  { label: '有次品', value: 'defect' },
];

const FACTORY_TYPE_OPTIONS = [
  { label: '全部工厂类型', value: '' },
  { label: '自有工厂', value: 'OWN' },
  { label: '外发工厂', value: 'EXTERNAL' },
];

Page({
  data: {
    loading: true,
    list: [],
    total: 0,
    totalAvailableQty: 0,
    totalDefectQty: 0,

    page: 1,
    pageSize: 20,
    hasMore: true,

    searchText: '',
    statusValue: '',
    factoryTypeValue: '',
    statusOptions: STATUS_OPTIONS,
    factoryTypeOptions: FACTORY_TYPE_OPTIONS,
    statusIndex: 0,
    factoryTypeIndex: 0,

    selectedItem: null,
    detailVisible: false,
    skuList: [],
  },

  onLoad: function () {
    this.loadList(true);
  },

  onPullDownRefresh: function () {
    this.loadList(true).finally(function () { wx.stopPullDownRefresh(); });
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadList(false);
    }
  },

  onSearchInput: function (e) {
    this.setData({ searchText: e.detail.value });
  },

  onSearchConfirm: function () {
    this.loadList(true);
  },

  onStatusChange: function (e) {
    const idx = Number(e.detail.value);
    this.setData({
      statusIndex: idx,
      statusValue: STATUS_OPTIONS[idx].value,
    });
    this.loadList(true);
  },

  onFactoryTypeChange: function (e) {
    const idx = Number(e.detail.value);
    this.setData({
      factoryTypeIndex: idx,
      factoryTypeValue: FACTORY_TYPE_OPTIONS[idx].value,
    });
    this.loadList(true);
  },

  loadList: function (reset) {
    const that = this;
    const page = reset ? 1 : this.data.page;
    if (reset) {
      this.setData({ loading: true, list: [], page: 1, hasMore: true });
    }

    const params = {
      page: page,
      pageSize: this.data.pageSize,
      keyword: this.data.searchText || '',
      status: this.data.statusValue || '',
      factoryType: this.data.factoryTypeValue || '',
    };

    return api.warehouse.listFinishedInventory(params).then(function (res) {
      const records = (res.records || []).map(function (item) {
        return {
          ...item,
          _styleImage: item.styleImage ? getAuthedImageUrl(item.styleImage) : '',
          _hasAvailable: (item.availableQty || 0) > 0,
          _hasDefect: (item.defectQty || 0) > 0,
          _lastInboundDate: item.lastInboundDate ? String(item.lastInboundDate).replace('T', ' ').substring(0, 16) : '--',
        };
      });

      const total = Number(res.total) || 0;
      const totalAvailableQty = records.reduce(function (sum, it) { return sum + (it.availableQty || 0); }, 0);
      const totalDefectQty = records.reduce(function (sum, it) { return sum + (it.defectQty || 0); }, 0);

      const newList = reset ? records : that.data.list.concat(records);
      const newAvailable = reset ? totalAvailableQty : that.data.totalAvailableQty + totalAvailableQty;
      const newDefect = reset ? totalDefectQty : that.data.totalDefectQty + totalDefectQty;

      that.setData({
        list: newList,
        total: total,
        totalAvailableQty: newAvailable,
        totalDefectQty: newDefect,
        page: page + 1,
        hasMore: newList.length < total,
        loading: false,
      });
    }).catch(function (err) {
      console.warn('[finished-inventory] loadList failed:', err);
      that.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  onItemTap: function (e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find(function (it) { return it.id === id; });
    if (!item) return;

    const skuList = this.data.list
      .filter(function (it) { return it.styleNo === item.styleNo && it.orderNo === item.orderNo; })
      .map(function (it) {
        return {
          color: it.color || '--',
          size: it.size || '--',
          sku: it.sku || '--',
          availableQty: it.availableQty || 0,
          lockedQty: it.lockedQty || 0,
          defectQty: it.defectQty || 0,
          costPrice: it.costPrice || 0,
          salesPrice: it.salesPrice || 0,
          warehouseLocation: it.warehouseLocation || '--',
        };
      });

    this.setData({
      selectedItem: item,
      skuList: skuList,
      detailVisible: true,
    });
  },

  onCloseDetail: function () {
    this.setData({ detailVisible: false, selectedItem: null, skuList: [] });
  },

  preventTouchMove: function () {},
});
