const api = require('../../utils/api');
const { toast, safeNavigate } = require('../../utils/uiHelper');
const { getUserInfo } = require('../../utils/storage');
const { eventBus, Events } = require('../../utils/eventBus');
const { getAuthedImageUrl } = require('../../utils/fileUrl');

var DEFECT_CATEGORY_MAP = {
  appearance_integrity: '外观完整性问题',
  size_accuracy: '尺寸精度问题',
  process_compliance: '工艺规范性问题',
  functional_effectiveness: '功能有效性问题',
  other: '其他问题',
};

/**
 * 质检状态映射
 * 设计稿分类：待检 / 合格 / 不合格 / 返修
 *
 * 数据来源合并：
 * 1. myQualityTasks() — 已领取未确认的质检任务 → 待检
 * 2. myRepairTasks() — 返修任务 → 返修/合格/不合格
 * 3. warehousingStats() — 统计栏数据（合格率/不合格数/返修中数）
 */
var QUALITY_STATUS_MAP = {
  pending: 'pending',
  pending_repair: 'pending',
  repairing: 'repairing',
  repair_done: 'qualified',
  scrapped: 'failed',
};

var QUALITY_STATUS_TEXT_MAP = {
  pending: '待检',
  repairing: '返修',
  qualified: '合格',
  failed: '不合格',
};

var REPAIR_STATUS_MAP = {
  pending: '待检',
  pending_repair: '待检',
  repairing: '返修中',
  repair_done: '合格',
  scrapped: '不合格',
};

Page({
  data: {
    activeFilter: 'all',
    defectTab: 'records',
    list: [],
    loading: false,
    loadingMore: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    stats: {
      passRate: '0%',
      failCount: 0,
      repairingCount: 0,
    },
    filterCounts: {
      all: 0,
      pending: 0,
      qualified: 0,
      failed: 0,
      repairing: 0,
    },
  },

  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    if (this._dataLoaded && !this._needsRefresh) {
      this._bindWsEvents();
      return;
    }
    this._needsRefresh = false;
    this._dataLoaded = false;
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
    var self = this;
    this.loadDefectList(true).finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  onFilter: function (e) {
    var filter = e.currentTarget.dataset.filter;
    if (filter === this.data.activeFilter) return;
    this.setData({ activeFilter: filter });
    this._applyFilter();
  },

  onDefectTabChange: function (e) {
    var tab = e.currentTarget.dataset.tab;
    if (tab === this.data.defectTab) return;
    this.setData({ defectTab: tab });
  },

  onViewDetail: function (e) {
    var index = e.currentTarget.dataset.index;
    var item = this.data.list[index];
    if (!item) return;
    var data = JSON.stringify(item);
    safeNavigate({
      url: '/pages/quality-detail/index?data=' + encodeURIComponent(data),
    }).catch(function () {});
  },

  onLoadMore: function () {
    if (this.data.loadingMore || !this.data.hasMore) return;
    this.loadDefectList(false);
  },

  /**
   * 合并加载质检数据：
   * 1. warehousingStats — 统计栏（合格率/不合格/返修中）
   * 2. myQualityTasks — 待检任务（已领取未确认）
   * 3. myRepairTasks — 返修/合格/不合格任务
   * 4. pendingBundles('pendingQc') — 待质检菲号（PC端同源接口）
   */
  loadDefectList: function (reset) {
    var self = this;
    if (self.data.loading) return Promise.resolve();

    self.setData({
      loading: reset,
      loadingMore: !reset,
    });

    // 并行请求 4 个数据源（含 PC 端同源菲号数据）
    var statsPromise = api.production.warehousingStats({})
      .then(function (res) {
        return res || {};
      }).catch(function () {
        return {};
      });

    var qualityTasksPromise = api.production.myQualityTasks()
      .then(function (res) {
        var items = Array.isArray(res) ? res : (res && res.records) || (res && res.list) || [];
        return items;
      }).catch(function () {
        return [];
      });

    var repairTasksPromise = api.production.myRepairTasks()
      .then(function (res) {
        var items = Array.isArray(res) ? res : (res && res.records) || (res && res.list) || [];
        return items;
      }).catch(function () {
        return [];
      });

    // PC端同源接口：待质检菲号列表
    var pendingBundlesPromise = api.production.pendingBundles('pendingQc')
      .then(function (res) {
        var items = Array.isArray(res) ? res : (res && res.records) || (res && res.list) || [];
        return items;
      }).catch(function () {
        return [];
      });

    return Promise.all([statsPromise, qualityTasksPromise, repairTasksPromise, pendingBundlesPromise])
      .then(function (results) {
        var statsData = results[0];
        var qualityTasks = results[1];
        var repairTasks = results[2];
        var pendingBundles = results[3];

        // 合并：待质检菲号 + 质检任务 + 返修任务
        var allItems = [];
        var seenBundleIds = {};

        // PC端菲号 → 待检（优先放入，与 PC 端质检入库页同源）
        pendingBundles.forEach(function (item) {
          var bid = item.bundleId || item.id;
          if (bid && seenBundleIds[bid]) return; // 去重
          if (bid) seenBundleIds[bid] = true;

          item._source = 'pendingQc';
          item.qualityStatus = 'pending';
          item.qualityStatusText = '待检';
          item.repairStatusText = '待检';
          // 映射封面图
          if (item.styleCover && !item.coverImage) {
            item.coverImage = getAuthedImageUrl(item.styleCover);
          }
          allItems.push(self._processDefectItem(item));
        });

        // 质检任务 → 待检（跳过已从 pendingBundles 加载的）
        qualityTasks.forEach(function (item) {
          var bid = item.bundleId || item.id;
          if (bid && seenBundleIds[bid]) return; // 去重
          if (bid) seenBundleIds[bid] = true;

          item._source = 'quality';
          item.qualityStatus = 'pending';
          item.qualityStatusText = '待检';
          item.repairStatusText = '待检';
          allItems.push(self._processDefectItem(item));
        });

        // 返修任务 → 按 repairStatus 映射
        repairTasks.forEach(function (item) {
          var bid = item.bundleId || item.id;
          if (bid && seenBundleIds[bid]) return; // 去重
          if (bid) seenBundleIds[bid] = true;

          item._source = 'repair';
          item.qualityStatus = QUALITY_STATUS_MAP[item.repairStatus] || 'pending';
          item.qualityStatusText = QUALITY_STATUS_TEXT_MAP[item.qualityStatus] || '待检';
          item.repairStatusText = item.repairStatus ? (REPAIR_STATUS_MAP[item.repairStatus] || '待检') : '待检';
          allItems.push(self._processDefectItem(item));
        });

        // 计算统计和筛选计数
        var stats = self._calcStats(allItems, statsData);
        var filterCounts = self._calcFilterCounts(allItems);

        // 存储全部数据，应用当前筛选
        self._allItems = allItems;

        self.setData({
          stats: stats,
          filterCounts: filterCounts,
        });

        self._applyFilter();

        self._dataLoaded = true;
        self.setData({ loading: false, loadingMore: false });
        return allItems;
      })
      .catch(function (err) {
        console.error('[Defect] load failed:', err);
        self.setData({ loading: false, loadingMore: false });
        toast.error('加载失败');
      });
  },

  /**
   * 应用当前筛选，从 _allItems 过滤
   */
  _applyFilter: function () {
    var filter = this.data.activeFilter;
    var allItems = this._allItems || [];

    var filtered = filter === 'all' ? allItems : allItems.filter(function (item) {
      return item.qualityStatus === filter;
    });

    this.setData({
      list: filtered,
      hasMore: false,
    });
  },

  _processDefectItem: function (item) {
    item.defectCategoryText = item.defectCategory ? (DEFECT_CATEGORY_MAP[item.defectCategory] || '未知') : '';

    // P0 修复：分离不良品照片与款式图，原代码把不良品照片错误覆盖为 coverImage（款式图）
    // defectImageList：不良品照片列表（质检时拍摄）
    // coverImage：款式图（从款式信息带来，不应被不良品照片覆盖）
    if (item.unqualifiedImageUrls) {
      try {
        var urls = typeof item.unqualifiedImageUrls === 'string'
          ? JSON.parse(item.unqualifiedImageUrls)
          : item.unqualifiedImageUrls;
        var validUrls = (urls || []).filter(Boolean);
        item.defectImageList = validUrls.map(function (u) { return getAuthedImageUrl(u); });
        item.imageCount = validUrls.length;
      } catch (_) {
        item.defectImageList = [];
        item.imageCount = 0;
      }
    } else {
      item.defectImageList = [];
      item.imageCount = 0;
    }
    // 保留后端返回的 coverImage（款式图），若不存在则尝试其他字段
    // P0 修复：所有图片URL必须经过 getAuthedImageUrl 认证，否则可能403
    if (!item.coverImage) {
      item.coverImage = getAuthedImageUrl(item.styleCover || item.styleImage || item.cover || '');
    } else if (item.coverImage && !item.coverImage.startsWith('http')) {
      item.coverImage = getAuthedImageUrl(item.coverImage);
    }

    // P0 修复：bundleNo 兜底 cuttingBundleNo（后端可能返回 cuttingBundleNo 而非 bundleNo）
    if (!item.bundleNo && item.cuttingBundleNo) {
      item.bundleNo = item.cuttingBundleNo;
    }

    if (item.createTime) {
      item.createTimeText = this._formatTime(item.createTime);
    }
    if (item.scanTime) {
      item.scanTimeText = this._formatTime(item.scanTime);
    }

    return item;
  },

  /**
   * 计算统计指标
   * 优先使用后端 warehousingStats 返回的数据，否则从列表计算
   */
  _calcStats: function (items, statsData) {
    var qualified = 0;
    var failed = 0;
    var repairing = 0;
    var pending = 0;
    var total = items.length;

    items.forEach(function (item) {
      var qs = item.qualityStatus || (QUALITY_STATUS_MAP[item.repairStatus] || 'pending');
      if (qs === 'qualified') qualified++;
      else if (qs === 'failed') failed++;
      else if (qs === 'repairing') repairing++;
      else if (qs === 'pending') pending++;
    });

    // 优先使用后端统计数据
    var backendQualified = statsData.qualifiedCount || statsData.qualified || 0;
    var backendFailed = statsData.unqualifiedCount || statsData.unqualified || 0;
    var backendRepairing = statsData.repairingCount || statsData.repairing || 0;

    // 如果后端有数据，用后端数据
    var finalQualified = backendQualified > 0 ? backendQualified : qualified;
    var finalFailed = backendFailed > 0 ? backendFailed : failed;
    var finalRepairing = backendRepairing > 0 ? backendRepairing : repairing;

    var totalForRate = finalQualified + finalFailed + finalRepairing + pending;
    var rate = totalForRate > 0 ? Math.round((finalQualified / totalForRate) * 1000) / 10 : 0;

    return {
      passRate: rate + '%',
      failCount: finalFailed,
      repairingCount: finalRepairing,
    };
  },

  _calcFilterCounts: function (items) {
    var counts = { all: 0, pending: 0, qualified: 0, failed: 0, repairing: 0 };
    items.forEach(function (item) {
      var qs = item.qualityStatus || (QUALITY_STATUS_MAP[item.repairStatus] || 'pending');
      counts[qs]++;
      counts.all++;
    });
    return counts;
  },

  _formatTime: function (t) {
    if (!t) return '';
    var d = new Date(t);
    if (isNaN(d.getTime())) return t;
    var m = d.getMonth() + 1;
    var day = d.getDate();
    var h = d.getHours();
    var min = d.getMinutes();
    return m + '/' + day + ' ' + (h < 10 ? '0' + h : h) + ':' + (min < 10 ? '0' + min : min);
  },

  onStartRepair: function (e) {
    var self = this;
    var index = e.currentTarget.dataset.index;
    var item = self.data.list[index];
    if (!item || !item.bundleId) return;

    wx.showModal({
      title: '开始返修',
      content: '确认开始返修菲号 ' + (item.bundleNo || '') + '？',
      confirmText: '确认',
      cancelText: '取消',
      success: function (res) {
        if (!res.confirm) return;
        var userInfo = getUserInfo() || {};
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
    var self = this;
    var index = e.currentTarget.dataset.index;
    var item = self.data.list[index];
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
    var self = this;
    var index = e.currentTarget.dataset.index;
    var item = self.data.list[index];
    if (!item || !item.bundleId) return;

    wx.showModal({
      title: '报废确认',
      content: '确认报废菲号 ' + (item.bundleNo || '') + '？此操作不可撤销。',
      confirmText: '确认报废',
      confirmColor: '#ff3b30',
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

  onPreviewCover: function (e) {
    var url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  onGoQuality: function (e) {
    var index = e.currentTarget.dataset.index;
    var item = this.data.list[index];
    if (!item) {
      // 没有具体 item 时，跳到扫码页的质检模式
      wx.switchTab({ url: '/pages/scan/index' });
      return;
    }
    // 设置全局质检数据，跳转到质检录入页面
    var app = getApp();
    if (app && app.globalData) {
      app.globalData.qualityData = {
        bundleId: item.bundleId || item.id,
        styleNo: item.styleNo || '',
        styleName: item.styleName || '',
        // P0 修复：同时传 coverImage 和 styleCover，确保下游页面可读到款式图
        coverImage: item.coverImage || '',
        styleCover: item.styleCover || item.coverImage || '',
        quantity: item.quantity || item.totalQty || 0,
        bundleNo: item.bundleNo || item.cuttingBundleNo || '',
        color: item.color || '',
        size: item.size || '',
        scanMode: item.scanMode || 'bundle',
      };
    }
    safeNavigate({
      url: '/pages/scan/quality/index',
    }).catch(function () {});
  },

  _bindWsEvents: function () {
    if (this._wsBound) return;
    this._wsBound = true;
    var self = this;
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
