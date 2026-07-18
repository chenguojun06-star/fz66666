const api = require('../../../utils/api');
const { toast, safeNavigate } = require('../../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { eventBus, Events } = require('../../../utils/eventBus');

const STATUS_LABELS = {
  PENDING: '待领取',
  IN_PROGRESS: '开发中',
  PRODUCTION_COMPLETED: '已完成',
  COMPLETED: '已完成',
  WAREHOUSE_IN: '已入库',
  SCRAPPED: '已报废',
  CLOSED: '已关单',
};

// 与 PC 端 6 阶段对齐
const SAMPLE_PARENT_STAGES = [
  { key: 'procurement', name: '采购' },
  { key: 'cutting', name: '裁剪' },
  { key: 'secondary', name: '二次工艺' },
  { key: 'sewing', name: '车缝' },
  { key: 'tail', name: '尾部' },
  { key: 'warehousing', name: '入库' },
];

const SAMPLE_PROGRESS_NODE_ALIASES = {
  procurement: ['procurement', '采购'],
  cutting: ['cutting', '裁剪', '下板'],
  secondary: ['secondary', '二次工艺'],
  sewing: ['sewing', '车缝', '缝制'],
  tail: ['tail', '尾部', '后整'],
  warehousing: ['warehousing', '入库'],
};

const CATEGORY_MAP = {
  WOMAN: '女装',
  WOMEN: '女装',
  MAN: '男装',
  MEN: '男装',
  KID: '童装',
  KIDS: '童装',
  WCMAN: '女童装',
  UNISEX: '男女同款',
};

const SEASON_MAP = {
  SPRING: '春季',
  SUMMER: '夏季',
  AUTUMN: '秋季',
  WINTER: '冬季',
  SPRING_SUMMER: '春夏',
  AUTUMN_WINTER: '秋冬',
};

// 完成态状态集合
var COMPLETED_STATUSES = ['COMPLETED', 'PRODUCTION_COMPLETED', 'WAREHOUSE_IN', 'CLOSED'];

function clampPercent(value) {
  var n = Number(value || 0);
  return Number.isNaN(n) ? 0 : Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeProgressNodes(raw) {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch (_e) {
      return {};
    }
  }
  if (raw && typeof raw === 'object') return raw;
  return {};
}

function getSampleNodeProgress(item, key) {
  var nodes = normalizeProgressNodes(item.progressNodes);
  var aliases = SAMPLE_PROGRESS_NODE_ALIASES[key] || [key];
  for (var i = 0; i < aliases.length; i++) {
    var value = nodes[aliases[i]];
    if (value !== undefined && value !== null) {
      return clampPercent(value);
    }
  }
  return 0;
}

function isSampleSnapshotFullyCompleted(item) {
  var status = String(item.status || '').trim().toUpperCase();
  var allDone = SAMPLE_PARENT_STAGES.every(function (s) {
    return getSampleNodeProgress(item, s.key) >= 100;
  });
  return allDone && (status === 'PRODUCTION_COMPLETED' || status === 'COMPLETED');
}

function formatDate(v) {
  if (!v) return '';
  var s = String(v);
  if (s.length >= 10) return s.substring(0, 10);
  return s;
}

function fmtDate(v) {
  if (!v) return '';
  var s = String(v);
  try {
    var parts = s.split(/[-T :]/);
    if (parts.length >= 3) return parts[1] + '-' + parts[2];
  } catch (_e) { /* ignore */ }
  return s;
}

function isWithinDays(dateStr, days) {
  if (!dateStr) return false;
  try {
    var due = new Date(String(dateStr).replace(/-/g, '/'));
    var now = new Date();
    var diff = (due - now) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= days;
  } catch (_e) { return false; }
}

function isCompletedStatus(status) {
  return COMPLETED_STATUSES.indexOf(String(status || '').trim().toUpperCase()) >= 0;
}

// 前端筛选：根据 tab.key 从全量列表筛选
function filterByTab(allList, tabKey) {
  if (!tabKey) return allList;
  if (tabKey === 'IN_PROGRESS') {
    // 开发中 = 所有未完成（排除已完成/已入库/已关单/已报废）
    return allList.filter(function (item) {
      return !isCompletedStatus(item.status) && item.status !== 'SCRAPPED';
    });
  }
  if (tabKey === 'COMPLETED') {
    // 已完成 = COMPLETED + PRODUCTION_COMPLETED + WAREHOUSE_IN + CLOSED
    return allList.filter(function (item) {
      return isCompletedStatus(item.status);
    });
  }
  if (tabKey === 'OVERDUE') {
    return allList.filter(function (item) { return item._overdue; });
  }
  if (tabKey === 'WARNING') {
    return allList.filter(function (item) { return item._nearDue; });
  }
  return allList;
}

Page({
  data: {
    loading: true,
    keyword: '',
    activeFilter: '',
    statusTabs: [
      { key: '', label: '全部', color: 'primary', count: 0 },
      { key: 'IN_PROGRESS', label: '开发中', color: 'primary', count: 0 },
      { key: 'COMPLETED', label: '已完成', color: 'success', count: 0 },
      { key: 'OVERDUE', label: '已延期', color: 'danger', count: 0 },
      { key: 'WARNING', label: '临近交期', color: 'warning', isSmart: true, count: 0 },
    ],
    list: [],
    page: 1,
    pageSize: 15,
    total: 0,
    hasMore: false,
    loadingMore: false,
  },

  onLoad: function () {
    this._allList = [];
    this._filteredList = [];
    this.loadData(true);
  },

  onShow: function () {
    if (this._loaded) {
      this.loadData(true);
    }
    this._loaded = true;
    this._bindEvents();
  },

  onHide: function () {
    this._unbindEvents();
  },

  onUnload: function () {
    this._unbindEvents();
  },

  onPullDownRefresh: function () {
    var self = this;
    self.loadData(true).then(function () {
      wx.stopPullDownRefresh();
    }).catch(function () {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (!this.data.hasMore || this.data.loadingMore) return;
    var nextPage = this.data.page + 1;
    var pageSize = this.data.pageSize;
    var endIdx = nextPage * pageSize;
    var filtered = this._filteredList || [];
    var displayList = filtered.slice(0, endIdx);
    this.setData({
      list: displayList,
      page: nextPage,
      hasMore: endIdx < filtered.length,
      loadingMore: false,
    });
  },

  _bindEvents: function () {
    var that = this;
    this._onRefresh = function () {
      that.loadData(true);
    };
    eventBus.on(Events.REFRESH_ALL, this._onRefresh);
    eventBus.on(Events.DATA_CHANGED, this._onRefresh);
  },

  _unbindEvents: function () {
    if (this._onRefresh) {
      eventBus.off(Events.REFRESH_ALL, this._onRefresh);
      eventBus.off(Events.DATA_CHANGED, this._onRefresh);
    }
  },

  // 从全量列表计算各筛选标签数量 + 执行筛选 + 分页
  _updateCountsAndFilter: function () {
    var that = this;
    var allList = this._allList || [];

    // 计算各状态数量
    var inProgressCount = 0;
    var completedCount = 0;
    var overdueCount = 0;
    var warningCount = 0;
    allList.forEach(function (item) {
      if (isCompletedStatus(item.status)) {
        completedCount++;
      } else if (item.status !== 'SCRAPPED') {
        inProgressCount++;
      }
      if (item._overdue) overdueCount++;
      if (item._nearDue) warningCount++;
    });
    var totalCount = allList.length;

    // 更新筛选标签数量
    var tabs = this.data.statusTabs.map(function (tab) {
      var count = 0;
      if (tab.key === '') count = totalCount;
      else if (tab.key === 'IN_PROGRESS') count = inProgressCount;
      else if (tab.key === 'COMPLETED') count = completedCount;
      else if (tab.key === 'OVERDUE') count = overdueCount;
      else if (tab.key === 'WARNING') count = warningCount;
      return Object.assign({}, tab, { count: count });
    });

    // 执行筛选
    var filtered = filterByTab(allList, this.data.activeFilter);
    this._filteredList = filtered;

    // 分页
    var pageSize = this.data.pageSize;
    var displayList = filtered.slice(0, pageSize);

    this.setData({
      statusTabs: tabs,
      list: displayList,
      total: filtered.length,
      page: 1,
      hasMore: filtered.length > pageSize,
      loading: false,
      loadingMore: false,
    });
  },

  loadData: function (reset) {
    var that = this;
    if (reset) {
      that.setData({ loading: true });
    }

    // 全量加载（不分页、不传 status），前端统一筛选和计数
    var params = { page: 1, size: 500 };
    if (that.data.keyword.trim()) params.keyword = that.data.keyword.trim();

    return api.production.listPatterns(params)
      .then(function (res) {
        var data = res;
        var records = (data && data.records) ? data.records : (Array.isArray(data) ? data : []);

        // 处理每条记录
        var allList = records.map(function (item) {
          item._cover = getAuthedImageUrl(item.coverImage || '');
          item._statusLabel = STATUS_LABELS[item.status] || item.status || '-';
          item._statusColor = that.getStatusColorClass(item.status);
          item._deliveryDate = formatDate(item.deliveryTime);
          item._createDate = formatDate(item.releaseTime || item.createTime);
          item._deliveryTag = fmtDate(item.deliveryTime);
          item._overdue = false;
          item._nearDue = false;
          if (item.deliveryTime && !isCompletedStatus(item.status)) {
            try {
              var now = new Date();
              var due = new Date(String(item.deliveryTime).replace(/-/g, '/'));
              if (due < now) {
                item._overdue = true;
              } else if (isWithinDays(item.deliveryTime, 3)) {
                item._nearDue = true;
              }
            } catch (_e) { /* ignore */ }
          }

          // 元信息行1：公司 · 跟单 · 品类 · 季节
          var meta1Parts = [];
          if (item.company || item.brandName) meta1Parts.push(item.company || item.brandName);
          if (item.merchandiser || item.merchandiserName) meta1Parts.push('跟单: ' + (item.merchandiser || item.merchandiserName));
          var category = item.category;
          if (category && CATEGORY_MAP[category]) category = CATEGORY_MAP[category];
          if (category) meta1Parts.push(category);
          var season = item.season;
          if (season && SEASON_MAP[season]) season = SEASON_MAP[season];
          if (season) meta1Parts.push(season);
          item._metaLine1 = meta1Parts.join(' · ');

          // 元信息行2：颜色 · 尺码
          var meta2Parts = [];
          if (item.color) meta2Parts.push(item.color);
          if (item.sizes || item.sizeRange) meta2Parts.push(item.sizes || item.sizeRange);
          item._metaLine2 = meta2Parts.join(' · ');

          // 进度计算
          var completed = isSampleSnapshotFullyCompleted(item);
          var statusUpper = String(item.status || '').trim().toUpperCase();
          var received = ['IN_PROGRESS', 'PRODUCTION_COMPLETED', 'COMPLETED'].indexOf(statusUpper) >= 0
            || Boolean(item.receiver)
            || !!item.receiveTime;
          var procurementProgress = clampPercent(
            Number(
              (item.procurementProgress && typeof item.procurementProgress === 'object'
                ? item.procurementProgress.percent
                : item.procurementProgress) || 0,
            ),
          );

          var totalPercent = 0;
          item._devStages = SAMPLE_PARENT_STAGES.map(function (s) {
            var percent;
            if (completed) {
              percent = 100;
            } else if (s.key === 'procurement') {
              percent = procurementProgress;
            } else if (received) {
              percent = getSampleNodeProgress(item, s.key);
            } else {
              percent = 0;
            }
            totalPercent += percent;
            return {
              key: s.key,
              name: s.name,
              completed: percent >= 100,
              percent: percent,
            };
          });

          item._devDoneCount = item._devStages.filter(function (s) { return s.completed; }).length;
          item._devTotalCount = item._devStages.length;
          item._progressPercent = item._devTotalCount > 0
            ? Math.round(totalPercent / item._devTotalCount)
            : 0;

          return item;
        });

        that._allList = allList;
        that._updateCountsAndFilter();
      })
      .catch(function () {
        that.setData({ loading: false, loadingMore: false });
        if (reset) toast.error('加载失败');
      });
  },

  getStatusColorClass: function (status) {
    var map = {
      PENDING: 'var(--color-warning)',
      IN_PROGRESS: 'var(--color-primary)',
      PRODUCTION_COMPLETED: 'var(--color-success)',
      COMPLETED: 'var(--color-success)',
      WAREHOUSE_IN: 'var(--color-text-tertiary)',
      SCRAPPED: 'var(--color-text-tertiary)',
      CLOSED: 'var(--color-text-tertiary)',
    };
    return map[status] || 'var(--color-text-tertiary)';
  },

  onSearchInput: function (e) {
    var val = (e.detail.value || '').trim();
    if (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.clear) val = '';
    this.setData({ keyword: val });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(this._doSearch.bind(this), 400);
  },

  onSearchClear: function () {
    this.setData({ keyword: '' });
    this._doSearch();
  },

  _doSearch: function () {
    this.loadData(true);
  },

  onFilterTap: function (e) {
    var key = e.currentTarget.dataset.key;
    this.setData({ activeFilter: key });
    // 纯前端筛选，不需要重新请求后端
    this._updateCountsAndFilter();
  },

  onCardTap: function (e) {
    var item = e.currentTarget.dataset.item;
    if (!item) return;
    var styleId = item.styleId || '';
    var patternId = item.id || '';
    if (!styleId && !patternId) return;
    var param = styleId ? 'styleId=' + encodeURIComponent(styleId) : 'id=' + encodeURIComponent(patternId);
    safeNavigate({
      url: '/pages/sample-development/detail/index?' + param,
    }).catch(function () {});
  },

  onScan: function () {
    safeNavigate({
      url: '/pages/scan/index',
    }).catch(function () {});
  },

  onPreviewImage: function (e) {
    var url = e.currentTarget.dataset.src;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },
});
