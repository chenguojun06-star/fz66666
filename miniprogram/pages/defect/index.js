const api = require('../../utils/api');
const { toast, safeNavigate } = require('../../utils/uiHelper');
const { getUserInfo } = require('../../utils/storage');
const { eventBus, Events } = require('../../utils/eventBus');
const { getAuthedImageUrl } = require('../../utils/fileUrl');
const qualityHelper = require('../../utils/quality-helper');

const getQualityCategory = qualityHelper.getQualityCategory;
const CATEGORY_TEXT = qualityHelper.CATEGORY_TEXT;
const CATEGORY_TAG_CLASS = qualityHelper.CATEGORY_TAG_CLASS;
const REPAIR_STATUS_MAP = qualityHelper.REPAIR_STATUS_MAP;
const DEFECT_CATEGORY_MAP = qualityHelper.DEFECT_CATEGORY_MAP;

/**
 * 后端 filter → API 路由（与 PC 端 useProductWarehousing.handleStatusFilterChange 对齐）
 * - all / qualified / unqualified → listWarehousing（后端过滤 qualityStatus）
 * - pending → pendingBundles('pendingQc') 待质检菲号
 * - repair → myRepairTasks() 当前用户的待返修任务
 */
function buildRequestByFilter(filter, page, pageSize) {
  switch (filter) {
    case 'pending':
      // 待质检菲号：不分页，后端返回全部
      return { type: 'pendingBundles', status: 'pendingQc' };
    case 'qualified':
      return { type: 'list', params: { page: page, pageSize: pageSize, qualityStatus: 'qualified' } };
    case 'unqualified':
      return { type: 'list', params: { page: page, pageSize: pageSize, qualityStatus: 'unqualified' } };
    case 'repair':
      // 待返修任务列表：按当前用户过滤，不分页
      return { type: 'myRepairTasks' };
    default:
      // all
      return { type: 'list', params: { page: page, pageSize: pageSize } };
  }
}

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
      total: 0,
      pendingCount: 0,
      qualifiedCount: 0,
      unqualifiedCount: 0,
      repairCount: 0,
      passRate: '-',
    },
    filterCounts: {
      all: 0,
      pending: 0,
      qualified: 0,
      unqualified: 0,
      repair: 0,
    },
  },

  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    if (this._dataLoaded && !this._needsRefresh) {
      this._bindWsEvents();
      return;
    }
    this._needsRefresh = false;
    this._dataLoaded = false;
    this.loadQualityList(true);
    this.loadStats();
    this._bindWsEvents();
  },

  onHide: function () {
    this._unbindWsEvents();
  },

  onUnload: function () {
    this._unbindWsEvents();
  },

  onPullDownRefresh: function () {
    Promise.all([this.loadQualityList(true), this.loadStats()])
      .finally(function () {
        wx.stopPullDownRefresh();
      });
  },

  onFilter: function (e) {
    const filter = e.currentTarget.dataset.filter;
    if (filter === this.data.activeFilter) return;
    this.setData({ activeFilter: filter });
    this.loadQualityList(true);
  },

  onViewDetail: function (e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.list[index];
    if (!item) return;
    // 优先传 orderId（详情页调用后端 API 获取完整数据，与 PC 端 InspectionDetail 一致）
    var orderId = item.orderId || '';
    var warehousingNo = item.warehousingNo || '';
    if (!orderId && !warehousingNo) {
      toast.info('该记录缺少订单信息');
      return;
    }
    var params = [];
    if (orderId) params.push('orderId=' + encodeURIComponent(orderId));
    if (warehousingNo) params.push('warehousingNo=' + encodeURIComponent(warehousingNo));
    safeNavigate({
      url: '/pages/quality-detail/index?' + params.join('&'),
    }).catch(function () { /* 跳转失败忽略 */ });
  },

  onLoadMore: function () {
    if (this.data.loadingMore || !this.data.hasMore) return;
    // pending / repair 模式后端一次性返回全部，无需分页
    if (this.data.activeFilter === 'pending' || this.data.activeFilter === 'repair') return;
    this.loadQualityList(false);
  },

  /**
   * 加载质检列表（后端过滤，与 PC 端 useProductWarehousing 对齐）
   */
  loadQualityList: function (reset) {
    const self = this;
    if (self.data.loading) return Promise.resolve();

    const page = reset ? 1 : self.data.page;
    const filter = self.data.activeFilter;
    const req = buildRequestByFilter(filter, page, self.data.pageSize);

    self.setData({
      loading: reset,
      loadingMore: !reset,
    });

    var promise;
    if (req.type === 'pendingBundles') {
      // 待质检菲号列表（字段与 listWarehousing 不同，统一走 _processQualityItem 补齐）
      promise = api.production.pendingBundles(req.status).then(function (res) {
        var items = Array.isArray(res) ? res : (res && res.records ? res.records : []);
        return items.map(function (item) {
          // 补齐 id（wx:key 需要）和 listWarehousing 兼容字段
          item.id = item.id || item.bundleId || ('pending_' + (item.bundleNo || '') + '_' + (item.orderNo || ''));
          item.coverImage = item.coverImage || item.styleCover || '';
          item.warehousingQuantity = item.quantity || 0;
          item.qualityStatus = 'pending';
          item.bundleQrCode = item.bundleQrCode || item.qrCode || '';
          item.deliveryDate = item.deliveryDate || item.plannedEndDate || '';
          // 待检没有扫码时间/操作人，用空值占位保持卡片高度一致
          if (!item.scanTime && !item.createTime) item.displayTime = '';
          if (!item.operatorName) item.operatorName = '';
          return self._processQualityItem(item);
        });
      });
    } else if (req.type === 'myRepairTasks') {
      // 待返修任务列表
      promise = api.production.myRepairTasks().then(function (res) {
        var items = Array.isArray(res) ? res : (res && res.records ? res.records : []);
        return items.map(function (item) {
          return self._processQualityItem(item);
        });
      });
    } else {
      // listWarehousing 后端过滤
      promise = api.production.listWarehousing(req.params)
        .then(function (res) {
          var items = [];
          if (Array.isArray(res)) {
            items = res;
          } else if (res && res.records) {
            items = res.records;
          } else if (res && res.list) {
            items = res.list;
          }
          return items.map(function (item) {
            return self._processQualityItem(item);
          });
        });
    }

    return promise
      .then(function (processed) {
        var newList = reset ? processed : self.data.list.concat(processed);
        var hasMore = req.type === 'list' && processed.length >= self.data.pageSize;
        self.setData({
          list: newList,
          page: page + 1,
          hasMore: hasMore,
          loading: false,
          loadingMore: false,
        });
        self._dataLoaded = true;
        return newList;
      })
      .catch(function (err) {
        console.error('[Quality] load failed:', err);
        self.setData({ loading: false, loadingMore: false });
        toast.error('加载失败');
      });
  },

  /**
   * 加载质检入库统计（与 PC 端 fetchWarehousingStats 一致）
   * 从后端 stats API 获取真实全量统计，而非当前页数据计算
   */
  loadStats: function () {
    var self = this;
    return api.production.warehousingStats({})
      .then(function (res) {
        if (!res || typeof res !== 'object') return;
        // PC 端字段：totalCount / pendingQcBundles / unqualifiedCount 等
        var totalCount = Number(res.totalCount || 0);
        var pendingCount = Number(res.pendingQcBundles || 0);
        var qualifiedCount = Number(res.qualifiedCount || 0);
        var unqualifiedCount = Number(res.unqualifiedCount || 0);
        var repairCount = Number(res.pendingRepairBundles || 0);
        var passRate = '-';
        if (totalCount > 0) {
          passRate = ((qualifiedCount / totalCount) * 100).toFixed(1) + '%';
        }
        var allCount = pendingCount + qualifiedCount + unqualifiedCount + repairCount;
        self.setData({
          stats: {
            total: totalCount,
            pendingCount: pendingCount,
            qualifiedCount: qualifiedCount,
            unqualifiedCount: unqualifiedCount,
            repairCount: repairCount,
            passRate: passRate,
          },
          filterCounts: {
            all: allCount,
            pending: pendingCount,
            qualified: qualifiedCount,
            unqualified: unqualifiedCount,
            repair: repairCount,
          },
        });
      })
      .catch(function (err) {
        console.warn('[Quality] stats failed:', err);
      });
  },

  _processQualityItem: function (item) {
    // ProductWarehousing 字段兼容映射
    if (!item.operatorName && item.qualityOperatorName) item.operatorName = item.qualityOperatorName;
    if (!item.bundleId && item.cuttingBundleId) item.bundleId = item.cuttingBundleId;
    if (!item.bundleNo && item.cuttingBundleNo) item.bundleNo = item.cuttingBundleNo;
    if (!item.coverImage && item.styleCover) item.coverImage = item.styleCover;
    if (!item.quantity && item.warehousingQuantity) item.quantity = item.warehousingQuantity;

    // pendingBundles 返回字段兼容（菲号级别数据补齐为与 listWarehousing 一致）
    if (!item.orderNo && item.productionOrderNo) item.orderNo = item.productionOrderNo;
    if (!item.factoryName && item.productionFactoryName) item.factoryName = item.productionFactoryName;
    if (!item.factoryType && item.productionFactoryType) item.factoryType = item.productionFactoryType;
    if (!item.deliveryDate && item.plannedEndDate) item.deliveryDate = item.plannedEndDate;
    if (!item.color && item.bundleColor) item.color = item.bundleColor;
    if (!item.size && item.bundleSize) item.size = item.bundleSize;

    item.defectCategoryText = DEFECT_CATEGORY_MAP[item.defectCategory] || '';
    item.repairStatusText = REPAIR_STATUS_MAP[item.repairStatus] || '';
    item.qualityCategory = getQualityCategory(item);
    item.qualityCategoryText = CATEGORY_TEXT[item.qualityCategory] || '待检';
    item.qualityTagClass = CATEGORY_TAG_CLASS[item.qualityCategory] || 'tag-default';

    if (item.coverImage || item.styleImage) {
      item.displayCover = getAuthedImageUrl(item.coverImage || item.styleImage);
    } else {
      item.displayCover = '';
    }

    if (item.unqualifiedImageUrls) {
      try {
        var urls = typeof item.unqualifiedImageUrls === 'string'
          ? JSON.parse(item.unqualifiedImageUrls)
          : item.unqualifiedImageUrls;
        if (!item.displayCover && urls && urls.length > 0) {
          item.displayCover = getAuthedImageUrl(urls[0]);
        }
      } catch (_e) {
        /* ignore parse error */
      }
    }

    if (item.scanTime || item.createTime) {
      item.displayTime = this._formatTime(item.scanTime || item.createTime);
    } else {
      item.displayTime = item.displayTime || '';
    }

    // 交期倒计时（与 PC 端 getRemainingDaysDisplay 逻辑对齐）
    var deliveryDate = item.deliveryDate || item.plannedEndDate || '';
    if (deliveryDate) {
      var dInfo = this._calcDeliveryDisplay(deliveryDate, item.status, item.actualEndDate, item.productionProgress);
      item.deliveryText = dInfo.text;
      item.deliveryCls = dInfo.cls;
    } else {
      item.deliveryText = '';
      item.deliveryCls = '';
    }

    // 生产方显示（内部/外部标签）
    if (item.factoryName) {
      item.factoryText = item.factoryName;
      item.factoryTypeText = item.factoryType === 'INTERNAL' ? '内部' : (item.factoryType === 'EXTERNAL' ? '外部' : '');
    } else {
      item.factoryText = '';
      item.factoryTypeText = '';
    }

    // 菲号显示：订单号+菲号（与 PC 端 useProcessTrackingColumns 对齐）
    var rawBundleNo = item.bundleQrCode || item.bundleNo || item.cuttingBundleQrCode || '';
    item.bundleNoShort = this._formatBundleNo(rawBundleNo, item.orderNo);

    return item;
  },

  /**
   * 菲号格式化：订单号+菲号（与 PC 端 orderNo-bundleNo 对齐）
   * 如 qrCode = "PO20260128001-A001-黑色-M-50-01|SKU-...|SIG-..."
   * 返回 "PO20260128001-01"
   */
  _formatBundleNo: function (qr, orderNo) {
    if (!qr) {
      // 没有二维码，用 orderNo + bundleNo 拼接
      if (orderNo && this._currentItemBundleNo) {
        return orderNo + '-' + this._currentItemBundleNo;
      }
      return '-';
    }
    var t = String(qr).split('|')[0].trim();
    if (!t) return '-';
    var parts = t.split('-');
    // 最后一部分是菲号序号
    var bundleSeq = parts[parts.length - 1] || '';
    // 取订单号（第一部分）或传入的 orderNo
    var ord = orderNo || parts[0] || '';
    if (ord && bundleSeq) {
      return ord + '-' + bundleSeq;
    }
    // 回退：取后3段
    return parts.length > 3 ? parts.slice(-3).join('-') : t;
  },

  /**
   * 交期倒计时（与 PC 端 progressColor.ts getRemainingDaysDisplay 对齐）
   * 颜色：绿色(充足) / 黄色(紧张) / 红色(逾期或临近)
   */
  _calcDeliveryDisplay: function (endDate, status, actualEndDate, productionProgress) {
    if (!endDate) return { text: '', cls: '' };
    var s = String(status || '').trim().toLowerCase();
    if (s === 'scrapped') return { text: '已报废', cls: 'delivery-muted' };
    if (s === 'closed' || s === 'archived') return { text: '已关单', cls: 'delivery-muted' };
    if (s === 'completed') return { text: '已完成', cls: 'delivery-success' };
    if (s === 'cancelled' || s === 'canceled') return { text: '已取消', cls: 'delivery-muted' };
    if (actualEndDate) return { text: '已关单', cls: 'delivery-muted' };
    var p = Number(productionProgress);
    if (!isNaN(p) && p >= 100) return { text: '已完成', cls: 'delivery-success' };

    var dateStr = String(endDate).replace(/-/g, '/');
    var deadline = new Date(dateStr);
    if (isNaN(deadline.getTime())) return { text: '', cls: '' };

    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var dStart = new Date(deadline);
    dStart.setHours(0, 0, 0, 0);
    var diff = Math.ceil((dStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diff < 0) return { text: '逾' + Math.abs(diff) + '天', cls: 'delivery-danger' };
    if (diff === 0) return { text: '今天', cls: 'delivery-danger' };
    if (diff <= 3) return { text: diff + '天', cls: 'delivery-danger' };
    if (diff <= 7) return { text: diff + '天', cls: 'delivery-warning' };
    return { text: diff + '天', cls: 'delivery-success' };
  },

  _formatTime: function (t) {
    if (!t) return '';
    var s = String(t).replace(/-/g, '/');
    var d = new Date(s);
    if (isNaN(d.getTime())) return t;
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    var h = d.getHours();
    var min = d.getMinutes();
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day) +
      ' ' + (h < 10 ? '0' + h : h) + ':' + (min < 10 ? '0' + min : min);
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
            self.loadQualityList(true);
            self.loadStats();
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
      content: '确认菲号 ' + (item.bundleNo || '') + ' 返修完成？',
      confirmText: '确认完成',
      cancelText: '取消',
      success: function (res) {
        if (!res.confirm) return;
        api.production.completeBundleRepair(item.bundleId)
          .then(function () {
            toast.success('返修已完成');
            self.loadQualityList(true);
            self.loadStats();
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
            self.loadQualityList(true);
            self.loadStats();
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

  _bindWsEvents: function () {
    if (this._wsBound) return;
    this._wsBound = true;
    var self = this;
    this._onDataChanged = function () { self.loadQualityList(true); self.loadStats(); };
    this._onScanSuccess = function () { self.loadQualityList(true); self.loadStats(); };
    this._onRefreshAll = function () { self.loadQualityList(true); self.loadStats(); };
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
