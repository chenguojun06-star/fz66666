const api = require('../../utils/api');
const { toast } = require('../../utils/uiHelper');
const { getUserInfo } = require('../../utils/storage');
const { eventBus, Events } = require('../../utils/eventBus');
const { getAuthedImageUrl } = require('../../utils/fileUrl');

const DEFECT_CATEGORY_MAP = {
  appearance_integrity: '外观完整性问题',
  size_accuracy: '尺寸精度问题',
  process_compliance: '工艺规范性问题',
  functional_effectiveness: '功能有效性问题',
  other: '其他问题',
};

const REPAIR_STATUS_MAP = {
  pending: '待返修',
  repairing: '返修中',
  repair_done: '待复检',
  scrapped: '已报废',
};

Page({
  data: {
    activeFilter: 'all',
    list: [],
    loading: false,
    loadingMore: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    stats: {
      pendingCount: 0,
      repairingCount: 0,
      repairedCount: 0,
      completedCount: 0,
    },
  },

  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) {
      return;
    }
    if (this._dataLoaded && !this._needsRefresh) {
      this._bindWsEvents();
      return;
    }
    this._needsRefresh = false;
    this.loadDefectList(true);
    this._bindWsEvents();
  },

  onHide: function () {
    this._unbindWsEvents();
  },

  onUnload: function () {
    this._unbindWsEvents();
  },

  onPullDownRefresh: function () {
    this.loadDefectList(true).finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  onFilter: function (e) {
    const filter = e.currentTarget.dataset.filter;
    if (filter === this.data.activeFilter) return;
    this.setData({ activeFilter: filter });
    this.loadDefectList(true);
  },

  onToggleDetail: function (e) {
    const index = e.currentTarget.dataset.index;
    const expanded = this.data.list[index].expanded;
    this.setData({ ['list[' + index + '].expanded']: !expanded });
  },

  onLoadMore: function () {
    if (this.data.loadingMore || !this.data.hasMore) return;
    this.loadDefectList(false);
  },

  loadDefectList: function (reset) {
    const self = this;
    if (self.data.loading) return Promise.resolve();

    const page = reset ? 1 : self.data.page;
    const filter = self.data.activeFilter;

    self.setData({
      loading: reset,
      loadingMore: !reset,
    });

    return api.production.myRepairTasks()
      .then(function (res) {
        const items = Array.isArray(res) ? res : (res && res.records) || (res && res.list) || [];

        let processed = items.map(function (item) {
          return self._processDefectItem(item);
        });

        if (filter !== 'all') {
          processed = processed.filter(function (item) {
            if (filter === 'pending') return item.repairStatus === 'pending';
            if (filter === 'repairing') return item.repairStatus === 'repairing';
            if (filter === 'repaired') return item.repairStatus === 'repair_done';
            return true;
          });
        }

        const stats = self._calcStats(items);

        const newList = reset ? processed : self.data.list.concat(processed);

        self.setData({
          list: newList,
          page: page + 1,
          hasMore: processed.length >= self.data.pageSize,
          loading: false,
          loadingMore: false,
          stats: stats,
        });

        self._dataLoaded = true;
        return newList;
      })
      .catch(function (err) {
        console.error('[Defect] load failed:', err);
        self.setData({ loading: false, loadingMore: false });
        toast.error('加载失败');
      });
  },

  _processDefectItem: function (item) {
    item.defectCategoryText = DEFECT_CATEGORY_MAP[item.defectCategory] || item.defectCategory || '';
    item.repairStatusText = REPAIR_STATUS_MAP[item.repairStatus] || item.repairStatus || '';
    item.expanded = false;

    if (item.unqualifiedImageUrls) {
      try {
        const urls = typeof item.unqualifiedImageUrls === 'string'
          ? JSON.parse(item.unqualifiedImageUrls)
          : item.unqualifiedImageUrls;
        item.unqualifiedImageUrls = urls.filter(Boolean).map(function (u) {
          return getAuthedImageUrl(u);
        });
      } catch (_) {
        item.unqualifiedImageUrls = [];
      }
    } else {
      item.unqualifiedImageUrls = [];
    }

    if (item.createTime) {
      item.createTimeText = this._formatTime(item.createTime);
    }

    return item;
  },

  _calcStats: function (items) {
    let pending = 0;
    let repairing = 0;
    let repaired = 0;
    let completed = 0;
    items.forEach(function (item) {
      if (item.repairStatus === 'pending') pending++;
      else if (item.repairStatus === 'repairing') repairing++;
      else if (item.repairStatus === 'repair_done') repaired++;
      else if (item.repairStatus === 'scrapped' || item.repairStatus === 'completed') completed++;
    });
    return {
      pendingCount: pending,
      repairingCount: repairing,
      repairedCount: repaired,
      completedCount: completed,
    };
  },

  _formatTime: function (t) {
    if (!t) return '';
    const d = new Date(t);
    if (isNaN(d.getTime())) return t;
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const h = d.getHours();
    const min = d.getMinutes();
    return m + '/' + day + ' ' + (h < 10 ? '0' + h : h) + ':' + (min < 10 ? '0' + min : min);
  },

  onStartRepair: function (e) {
    const self = this;
    const index = e.currentTarget.dataset.index;
    const item = self.data.list[index];
    if (!item || !item.bundleId) return;

    wx.showModal({
      title: '开始返修',
      content: '确认开始返修菲号 ' + (item.bundleNo || '') + '？',
      confirmText: '确认',
      cancelText: '取消',
      success: function (res) {
        if (!res.confirm) return;
        const userInfo = getUserInfo() || {};
        api.production.startBundleRepair(item.bundleId, userInfo.name || userInfo.username || '')
          .then(function () {
            toast.success('已开始返修');
            self.loadDefectList(true);
          })
          .catch(function (err) {
            wx.showModal({
              title: '操作失败',
              content: err.message || err.errMsg || '请稍后重试',
              showCancel: false,
              confirmText: '知道了',
            });
          });
      },
    });
  },

  onCompleteRepair: function (e) {
    const self = this;
    const index = e.currentTarget.dataset.index;
    const item = self.data.list[index];
    if (!item || !item.bundleId) return;

    wx.showModal({
      title: '返修完成',
      content: '确认菲号 ' + (item.bundleNo || '') + ' 返修完成？完成后将进入待复检状态。',
      confirmText: '确认完成',
      cancelText: '取消',
      success: function (res) {
        if (!res.confirm) return;
        api.production.completeBundleRepair(item.bundleId)
          .then(function () {
            toast.success('返修已完成，等待复检');
            self.loadDefectList(true);
          })
          .catch(function (err) {
            wx.showModal({
              title: '操作失败',
              content: err.message || err.errMsg || '请稍后重试',
              showCancel: false,
              confirmText: '知道了',
            });
          });
      },
    });
  },

  onScrap: function (e) {
    const self = this;
    const index = e.currentTarget.dataset.index;
    const item = self.data.list[index];
    if (!item || !item.bundleId) return;

    wx.showModal({
      title: '报废确认',
      content: '确认报废菲号 ' + (item.bundleNo || '') + '？此操作不可撤销。',
      confirmText: '确认报废',
      confirmColor: '#fa5151',
      cancelText: '取消',
      success: function (res) {
        if (!res.confirm) return;
        api.production.scrapBundle(item.bundleId)
          .then(function () {
            toast.success('已报废');
            self.loadDefectList(true);
          })
          .catch(function (err) {
            wx.showModal({
              title: '操作失败',
              content: err.message || err.errMsg || '请稍后重试',
              showCancel: false,
              confirmText: '知道了',
            });
          });
      },
    });
  },

  onGoQuality: function () {
    wx.switchTab({ url: '/pages/scan/index' });
  },

  onPreviewImage: function (e) {
    const url = e.currentTarget.dataset.url;
    const urls = e.currentTarget.dataset.urls;
    wx.previewImage({ current: url, urls: urls || [url] });
  },

  _bindWsEvents: function () {
    if (this._wsBound) return;
    this._wsBound = true;
    const self = this;
    this._onDataChanged = function () { self.loadDefectList(true); };
    this._onScanSuccess = function () { self.loadDefectList(true); };
    this._onRefreshAll = function () { self.loadDefectList(true); };
    eventBus.on(Events.DATA_CHANGED, this._onDataChanged);
    eventBus.on(Events.SCAN_SUCCESS, this._onScanSuccess);
    eventBus.on(Events.REFRESH_ALL, this._onRefreshAll);
  },

  _unbindWsEvents: function () {
    if (!this._wsBound) return;
    this._wsBound = false;
    if (this._onDataChanged) eventBus.off(Events.DATA_CHANGED, this._onDataChanged);
    if (this._onScanSuccess) eventBus.off(Events.SCAN_SUCCESS, this._onScanSuccess);
    if (this._onRefreshAll) eventBus.off(Events.REFRESH_ALL, this._onRefreshAll);
  },
});
