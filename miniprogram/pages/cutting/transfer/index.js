var api = require('../../../utils/api');
var { toast } = require('../../../utils/uiHelper');

function showTip(msg) {
  wx.showToast({ title: msg || '操作失败', icon: 'none', duration: 2000 });
}

var TRANSFER_MODES = [
  { id: 'whole', name: '整单转' },
  { id: 'bundle', name: '菲号裁片转' }
];

Page({
  data: {
    orderNo: '',
    orderId: '',

    transferMode: 'whole',
    transferModes: TRANSFER_MODES,

    activeTab: 'factory',

    bundles: [],
    bundlesLoading: false,
    selectedBundles: {},
    allSelected: false,
    selectedBundleCount: 0,

    factories: [],
    factoriesLoading: false,
    factoryKeyword: '',
    factoryPage: 1,
    factoryHasMore: false,
    selectedFactory: null,

    users: [],
    usersLoading: false,
    userKeyword: '',
    userPage: 1,
    userHasMore: false,
    selectedUser: null,

    remark: '',
    submitting: false,
  },

  onLoad: function (options) {
    var orderId = decodeURIComponent(options.orderId || '');
    var orderNo = decodeURIComponent(options.orderNo || '');
    this.setData({ orderId: orderId, orderNo: orderNo });
    wx.setNavigationBarTitle({ title: '转单 · ' + (orderNo || '') });
    this._loadBundles(orderNo);
    this._loadFactories('', 1);
  },

  onTransferModeChange: function (e) {
    var mode = e.currentTarget.dataset.mode;
    this.setData({ transferMode: mode, selectedBundles: {}, allSelected: false, selectedBundleCount: 0 });
  },

  _loadBundles: function (orderNo) {
    if (!orderNo) return;
    var that = this;
    that.setData({ bundlesLoading: true });
    api.production.listBundles(orderNo, 1, 500).then(function (res) {
      var list = Array.isArray(res) ? res : (res && res.records) || [];
      var DISABLED_STATUSES = { qualified: '已质检', unqualified: '不合格', repaired: '已返修', repaired_waiting_qc: '返修待质检', completed: '已完成' };
      list.forEach(function (b) {
        var s = b.status || '';
        if (DISABLED_STATUSES[s]) {
          b._disabled = true;
          b._statusCn = DISABLED_STATUSES[s];
        } else {
          b._disabled = false;
          b._statusCn = '';
        }
      });
      that.setData({ bundles: list, bundlesLoading: false });
    }).catch(function () {
      that.setData({ bundlesLoading: false });
      showTip('菲号列表加载失败');
    });
  },

  _loadFactories: function (keyword, page) {
    var that = this;
    that.setData({ factoriesLoading: true });
    api.production.transferSearchFactories(keyword || '', page || 1, 20).then(function (res) {
      var list = Array.isArray(res) ? res : (res && res.records) || [];
      var total = (res && res.total) || list.length;
      var hasMore = list.length >= 20 && (page * 20) < total;
      if (page > 1) {
        list = that.data.factories.concat(list);
      }
      that.setData({
        factories: list,
        factoriesLoading: false,
        factoryPage: page,
        factoryHasMore: hasMore
      });
    }).catch(function () {
      that.setData({ factoriesLoading: false });
    });
  },

  _loadUsers: function (keyword, page) {
    var that = this;
    that.setData({ usersLoading: true });
    api.production.transferSearchUsers(keyword || '', page || 1, 20).then(function (res) {
      var list = Array.isArray(res) ? res : (res && res.records) || [];
      var total = (res && res.total) || list.length;
      var hasMore = list.length >= 20 && (page * 20) < total;
      if (page > 1) {
        list = that.data.users.concat(list);
      }
      that.setData({
        users: list,
        usersLoading: false,
        userPage: page,
        userHasMore: hasMore
      });
    }).catch(function () {
      that.setData({ usersLoading: false });
    });
  },

  onTabChange: function (e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab, selectedFactory: null, selectedUser: null });
    if (tab === 'factory' && this.data.factories.length === 0) {
      this._loadFactories('', 1);
    }
    if (tab === 'user' && this.data.users.length === 0) {
      this._loadUsers('', 1);
    }
  },

  onToggleAllBundles: function () {
    var data = this.data;
    var next = !data.allSelected;
    var sel = {};
    if (next) {
      data.bundles.forEach(function (b) { if (!b._disabled) sel[b.id] = true; });
    }
    var count = next ? Object.keys(sel).length : 0;
    this.setData({ allSelected: next, selectedBundles: sel, selectedBundleCount: count });
  },

  onToggleBundle: function (e) {
    var id = e.currentTarget.dataset.id;
    var bundle = this.data.bundles.find(function (b) { return b.id === id; });
    if (bundle && bundle._disabled) return;
    var sel = Object.assign({}, this.data.selectedBundles);
    if (sel[id]) {
      delete sel[id];
    } else {
      sel[id] = true;
    }
    var allSelected = this.data.bundles.filter(function (b) { return !b._disabled; }).every(function (b) { return sel[b.id]; });
    var count = 0;
    Object.keys(sel).forEach(function (k) { if (sel[k]) count++; });
    this.setData({ selectedBundles: sel, allSelected: allSelected, selectedBundleCount: count });
  },

  onFactoryKeywordInput: function (e) {
    var val = (e.detail.value || '').trim();
    this.setData({ factoryKeyword: val, selectedFactory: null });
    clearTimeout(this._ftTimer);
    var that = this;
    this._ftTimer = setTimeout(function () { that._loadFactories(val, 1); }, 400);
  },

  onSelectFactory: function (e) {
    var factory = e.currentTarget.dataset.factory;
    this.setData({ selectedFactory: factory });
  },

  onLoadMoreFactories: function () {
    if (this.data.factoriesLoading || !this.data.factoryHasMore) return;
    this._loadFactories(this.data.factoryKeyword, this.data.factoryPage + 1);
  },

  onUserKeywordInput: function (e) {
    var val = (e.detail.value || '').trim();
    this.setData({ userKeyword: val, selectedUser: null });
    clearTimeout(this._utTimer);
    var that = this;
    this._utTimer = setTimeout(function () { that._loadUsers(val, 1); }, 400);
  },

  onSelectUser: function (e) {
    var user = e.currentTarget.dataset.user;
    this.setData({ selectedUser: user });
  },

  onLoadMoreUsers: function () {
    if (this.data.usersLoading || !this.data.userHasMore) return;
    this._loadUsers(this.data.userKeyword, this.data.userPage + 1);
  },

  onRemarkInput: function (e) {
    this.setData({ remark: e.detail.value || '' });
  },

  onSubmit: function () {
    var data = this.data;
    var bundleIds = [];

    if (data.transferMode === 'bundle') {
      bundleIds = Object.keys(data.selectedBundles).filter(function (k) { return data.selectedBundles[k]; });
      if (bundleIds.length === 0) {
        return showTip('请至少选择一个菲号');
      }
    }

    if (data.activeTab === 'factory') {
      if (!data.selectedFactory) return showTip('请选择目标工厂');
      this._submitToFactory(bundleIds);
    } else {
      if (!data.selectedUser) return showTip('请选择目标人员');
      this._submitToUser(bundleIds);
    }
  },

  _submitToFactory: function (bundleIds) {
    var data = this.data;
    var payload = {
      orderId: data.orderId,
      toFactoryId: data.selectedFactory.id,
      message: data.remark || ''
    };
    if (bundleIds.length > 0) {
      payload.bundleIds = bundleIds.join(',');
    }
    this.setData({ submitting: true });
    var that = this;
    api.production.transferCreateToFactory(payload).then(function () {
      that.setData({ submitting: false });
      wx.showToast({ title: '转单成功', icon: 'success' });
      setTimeout(function () { wx.navigateBack(); }, 1200);
    }).catch(function (err) {
      that.setData({ submitting: false });
      showTip((err && err.errMsg) || '转单失败，请重试');
    });
  },

  _submitToUser: function (bundleIds) {
    var data = this.data;
    var payload = {
      orderId: data.orderId,
      toUserId: data.selectedUser.id,
      message: data.remark || ''
    };
    if (bundleIds.length > 0) {
      payload.bundleIds = bundleIds.join(',');
    }
    this.setData({ submitting: true });
    var that = this;
    api.production.transferCreate(payload).then(function () {
      that.setData({ submitting: false });
      wx.showToast({ title: '转单申请已发送', icon: 'success' });
      setTimeout(function () { wx.navigateBack(); }, 1200);
    }).catch(function (err) {
      that.setData({ submitting: false });
      showTip((err && err.errMsg) || '转单失败，请重试');
    });
  }
});
