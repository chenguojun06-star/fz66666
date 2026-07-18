const api = require('../../../utils/api');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');

const TYPE_OPTIONS = [
  { label: '全部类型', value: '' },
  { label: '面料', value: 'fabric' },
  { label: '里料', value: 'lining' },
  { label: '辅料', value: 'accessory' },
];

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '启用', value: 'enabled' },
  { label: '停用', value: 'disabled' },
];

const TYPE_LABEL_MAP = {
  fabric: '面料',
  lining: '里料',
  accessory: '辅料',
};

const TYPE_COLOR_MAP = {
  fabric: 'var(--color-primary)',
  lining: 'var(--color-warning)',
  accessory: 'var(--color-success)',
};

Page({
  data: {
    loading: true,
    list: [],
    total: 0,

    page: 1,
    pageSize: 20,
    hasMore: true,

    searchText: '',
    typeValue: '',
    statusValue: '',
    typeOptions: TYPE_OPTIONS,
    statusOptions: STATUS_OPTIONS,
    typeIndex: 0,
    statusIndex: 0,

    selectedItem: null,
    detailVisible: false,
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

  onTypeChange: function (e) {
    const idx = Number(e.detail.value);
    this.setData({
      typeIndex: idx,
      typeValue: TYPE_OPTIONS[idx].value,
    });
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
      materialType: this.data.typeValue || '',
    };
    if (this.data.statusValue === 'enabled') {
      params.disabled = '0';
    } else if (this.data.statusValue === 'disabled') {
      params.disabled = '1';
    }

    return api.material.listDatabase(params).then(function (res) {
      const records = (res.records || res.data?.records || res || []).map(function (item) {
        return {
          ...item,
          _image: item.image ? getAuthedImageUrl(item.image) : '',
          _typeLabel: TYPE_LABEL_MAP[item.materialType] || item.materialType || '未分类',
          _typeColor: TYPE_COLOR_MAP[item.materialType] || 'var(--color-text-tertiary)',
          _unitPrice: item.unitPrice != null ? item.unitPrice : '--',
          _createTime: item.createTime ? String(item.createTime).replace('T', ' ').substring(0, 10) : '--',
          _enabled: item.disabled ? false : true,
        };
      });

      const total = Number(res.total || res.data?.total || records.length || 0);
      const newList = reset ? records : that.data.list.concat(records);

      that.setData({
        list: newList,
        total: total,
        page: page + 1,
        hasMore: newList.length < total,
        loading: false,
      });
    }).catch(function (err) {
      console.warn('[material-database] loadList failed:', err);
      that.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  onItemTap: function (e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find(function (it) { return it.id === id; });
    if (!item) return;
    this.setData({ selectedItem: item, detailVisible: true });
  },

  onCloseDetail: function () {
    this.setData({ detailVisible: false, selectedItem: null });
  },

  onCallSupplier: function () {
    const phone = this.data.selectedItem?.supplierContactPhone;
    if (!phone) {
      wx.showToast({ title: '暂无联系电话', icon: 'none' });
      return;
    }
    wx.makePhoneCall({
      phoneNumber: phone,
      fail: function () { wx.showToast({ title: '拨号失败', icon: 'none' }); },
    });
  },

  preventTouchMove: function () {},
});
