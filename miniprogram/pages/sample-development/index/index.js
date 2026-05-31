const api = require('../../../utils/api');
const { toast, safeNavigate } = require('../../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { eventBus, Events } = require('../../../utils/eventBus');

const STATUS_LABELS = {
  PENDING: '待领取',
  IN_PROGRESS: '制作中',
  COMPLETED: '已完成',
  WAREHOUSE_IN: '已入库',
};

const REVIEW_STATUS_LABELS = {
  'APPROVED': '已通过',
  'REJECTED': '已驳回',
  'PENDING': '待审核',
  'IN_REVIEW': '审核中',
  'DRAFT': '草稿',
  'SUBMITTED': '已提交',
};

const STATUS_COLORS = {
  PENDING: '#faad14',
  IN_PROGRESS: '#1677ff',
  COMPLETED: '#52c41a',
  WAREHOUSE_IN: '#8c8c8c',
};

const STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'PENDING', label: '待领取' },
  { key: 'IN_PROGRESS', label: '制作中' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'WAREHOUSE_IN', label: '已入库' },
];

const DEV_STAGES = [
  { key: 'bom', name: 'BOM' },
  { key: 'pattern', name: '纸样' },
  { key: 'process', name: '单价' },
  { key: 'secondary', name: '二次工艺' },
  { key: 'production', name: '生产制单' },
];

const PROD_STAGES = [
  { op: 'RECEIVE', name: '领取样衣' },
  { op: 'PLATE', name: '车板' },
  { op: 'FOLLOW_UP', name: '跟单确认' },
  { op: 'COMPLETE', name: '完成确认' },
  { op: 'WAREHOUSE_IN', name: '样衣入库' },
];

function formatDate(v) {
  if (!v) return '';
  const s = String(v);
  if (s.length >= 10) return s.substring(0, 10);
  return s;
}

function fmtDate(v) {
  if (!v) return '';
  const s = String(v);
  try {
    const parts = s.split(/[-T :]/);
    if (parts.length >= 3) return parts[1] + '-' + parts[2];
  } catch (_e) { /* ignore */ }
  return s;
}

Page({
  data: {
    loading: true,
    keyword: '',
    activeFilter: '',
    statusTabs: STATUS_TABS,

    list: [],
    page: 1,
    pageSize: 15,
    total: 0,
    hasMore: false,
    loadingMore: false,

    expandedId: '',
    patternDetail: null,
    patternScanRecords: null,
    detailLoading: false,
  },

  onLoad: function () {
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
    const self = this;
    Promise.resolve(self.loadData(true)).then(function () {
      wx.stopPullDownRefresh();
    }).catch(function () {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadData(false);
    }
  },

  _bindEvents: function () {
    const that = this;
    this._onRefresh = function () { that.loadData(true); };
    eventBus.on(Events.REFRESH_ALL, this._onRefresh);
    eventBus.on(Events.DATA_CHANGED, this._onRefresh);
  },

  _unbindEvents: function () {
    if (this._onRefresh) {
      eventBus.off(Events.REFRESH_ALL, this._onRefresh);
      eventBus.off(Events.DATA_CHANGED, this._onRefresh);
    }
  },

  loadData: function (reset) {
    const that = this;
    if (reset) {
      that.setData({ loading: true, page: 1, list: [] });
    } else {
      that.setData({ loadingMore: true });
    }

    const params = {
      page: that.data.page,
      size: that.data.pageSize,
    };
    if (that.data.keyword.trim()) params.keyword = that.data.keyword.trim();
    if (that.data.activeFilter) params.status = that.data.activeFilter;

    return api.production.listPatterns(params)
      .then(function (res) {
        const data = res && res.data ? res.data : res;
        const records = (data && data.records) ? data.records : (Array.isArray(data) ? data : []);
        const total = Number(data && data.total) || records.length;

        const list = records.map(function (item) {
          item._cover = getAuthedImageUrl(item.coverImage || '');
          item._statusLabel = STATUS_LABELS[item.status] || item.status || '-';
          item._statusColor = STATUS_COLORS[item.status] || '#8c8c8c';
          item._deliveryDate = formatDate(item.deliveryTime);
          item._createDate = formatDate(item.releaseTime || item.createTime);
          item._expanded = false;

          item._devStages = DEV_STAGES.map(function (s) {
            return {
              key: s.key,
              name: s.name,
              completed: !!(item.styleInfo && item.styleInfo[s.key + 'CompletedTime']),
            };
          });

          item._devDoneCount = item._devStages.filter(function (s) { return s.completed; }).length;
          item._devTotalCount = item._devStages.length;

          if (item.scanRecords && Array.isArray(item.scanRecords)) {
            item._scanStages = PROD_STAGES.map(function (s) {
              const matched = item.scanRecords.filter(function (r) {
                return String(r.operationType || '').toUpperCase() === s.op;
              });
              return {
                name: s.name,
                completed: matched.length > 0,
                time: matched.length > 0 && matched[0].scanTime ? fmtDate(matched[0].scanTime) : '',
              };
            });
          } else {
            item._scanStages = [];
          }

          return item;
        });

        const newList = reset ? list : (that.data.list || []).concat(list);
        that.setData({
          list: newList,
          total: total,
          hasMore: newList.length < total,
          loading: false,
          loadingMore: false,
          page: reset ? 1 : that.data.page + 1,
        });
      })
      .catch(function () {
        that.setData({ loading: false, loadingMore: false });
        if (reset) toast.error('加载失败');
      });
  },

  onSearchInput: function (e) {
    let val = (e.detail.value || '').trim();
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
    const key = e.currentTarget.dataset.key;
    this.setData({ activeFilter: key });
    this.loadData(true);
  },

  onCardTap: function (e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const expandedId = this.data.expandedId === id ? '' : id;
    this.setData({ expandedId: expandedId });

    if (expandedId) {
      this.loadDetail(id);
    } else {
      this.setData({ patternDetail: null, patternScanRecords: null });
    }
  },

  loadDetail: function (patternId) {
    const that = this;
    that.setData({ detailLoading: true });

    return api.production.getPatternDetail(patternId)
      .then(function (res) {
        const detail = res && res.data ? res.data : res;
        if (detail.reviewStatus) {
          detail._reviewStatusLabel = REVIEW_STATUS_LABELS[detail.reviewStatus] || detail.reviewStatus;
        }
        that.setData({ patternDetail: detail });
        return api.production.getPatternScanRecords(patternId);
      })
      .then(function (res) {
        const records = res && res.data ? res.data : (Array.isArray(res) ? res : []);
        that.setData({ patternScanRecords: records });
      })
      .catch(function () {})
      .finally(function () {
        that.setData({ detailLoading: false });
      });
  },

  onGoDetail: function (e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    const styleId = item.styleId || item.id;
    if (!styleId) return;
    safeNavigate({
      url: '/pages/sample-development/detail/index?styleId=' + encodeURIComponent(styleId),
    }).catch(() => {});
  },

  onGoScan: function (e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.styleId) return;
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.patternScanData = item;
    }
    safeNavigate({
      url: '/pages/scan/pattern/index?patternId=' + encodeURIComponent(item.id || ''),
    }).catch(() => {});
  },

  onPreviewImage: function (e) {
    const url = e.currentTarget.dataset.src;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },
});
