const api = require('../../../utils/api');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { eventBus, Events } = require('../../../utils/eventBus');

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

  onShow: function () {
    this._bindEvents();
  },

  onHide: function () {
    this._unbindEvents();
  },

  onUnload: function () {
    this._unbindEvents();
  },

  _bindEvents: function () {
    this._onDataChanged = function (data) {
      if (data && (data.type === 'warehouse' || data.type === 'finishedInventory')) {
        this.loadList(true);
      }
    }.bind(this);
    this._onRefreshAll = function () {
      this.loadList(true);
    }.bind(this);
    eventBus.on(Events.DATA_CHANGED, this._onDataChanged);
    eventBus.on(Events.REFRESH_ALL, this._onRefreshAll);
  },

  _unbindEvents: function () {
    if (this._onDataChanged) eventBus.off(Events.DATA_CHANGED, this._onDataChanged);
    if (this._onRefreshAll) eventBus.off(Events.REFRESH_ALL, this._onRefreshAll);
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

  /**
   * 构造详情页 URL（列表跳详情 / 列表直接出库 共用，避免参数拼接重复）
   * @param {Object} item - 列表项
   * @param {boolean} autoOutbound - 是否让详情页进入后自动弹出出库窗
   * @returns {string} 详情页完整 URL
   */
  _buildDetailUrl: function (item, autoOutbound) {
    const params = [
      'styleNo=' + encodeURIComponent(item.styleNo || ''),
      'orderNo=' + encodeURIComponent(item.orderNo || ''),
      'styleName=' + encodeURIComponent(item.styleName || ''),
      'styleImage=' + encodeURIComponent(item._styleImage || item.styleImage || ''),
      'factoryName=' + encodeURIComponent(item.factoryName || ''),
    ];
    if (autoOutbound) params.push('autoOutbound=1');
    return '/pages/warehouse/finished-inventory/detail/index?' + params.join('&');
  },

  onItemTap: function (e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find(function (it) { return it.id === id; });
    if (!item) return;
    wx.navigateTo({ url: this._buildDetailUrl(item, false) });
  },

  /**
   * 列表直接出库（D-418）
   *
   * 背景：出库原只能「列表 → 详情 → SKU 行」三级进入，用户以为成品没有出库功能。
   * 做法：列表项直接给「出库」按钮，跳详情并带 autoOutbound=1，由详情页加载完 SKU 后
   *      自动弹出第一个有可用库存的 SKU 出库窗 —— 完全复用详情页既有出库逻辑，不新增接口，零风险。
   * 注意：用 catchtap 绑定，避免冒泡触发外层 onItemTap 造成跳转两次。
   *
   * @param {Object} e - 事件对象（dataset.id）
   */
  onOutboundTap: function (e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find(function (it) { return it.id === id; });
    if (!item) return;
    if (!item._hasAvailable) {
      wx.showToast({ title: '该款暂无可用库存', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: this._buildDetailUrl(item, true) });
  },

  preventTouchMove: function () {},
});
