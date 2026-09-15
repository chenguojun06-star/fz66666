/**
 * 协作任务列表页（D-417）
 *
 * 作为「更多应用 → 协作任务」的入口页（详情页需要 taskId，不能直接作为应用入口）。
 * 数据源：GET /api/intelligence/task-center/my-tasks（后端已按「我创建/我领取」过滤）
 *
 * 点击某项 → /pages/collab-task/detail/index?taskId=xxx 处理（领取/开始/完成）
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');

var STATUS_TEXT = {
  PENDING: '待领取',
  ACCEPTED: '已领取',
  IN_PROGRESS: '处理中',
  COMPLETED: '已完成',
  ESCALATED: '已升级',
  CANCELLED: '已取消',
};
var STATUS_CLS = {
  PENDING: 'tag-orange',
  ACCEPTED: 'tag-blue',
  IN_PROGRESS: 'tag-blue',
  COMPLETED: 'tag-green',
  ESCALATED: 'tag-red',
  CANCELLED: 'tag-gray',
};
var STATUS_MAP = {};
Object.keys(STATUS_TEXT).forEach(function (k) {
  STATUS_MAP[k] = { text: STATUS_TEXT[k], cls: STATUS_CLS[k] };
});

var PRIORITY_TEXT = { CRITICAL: '紧急', HIGH: '高', MEDIUM: '中', LOW: '低' };

function statusText(s) {
  var k = String(s || '').toUpperCase();
  return STATUS_TEXT[k] || s || '—';
}
function statusCls(s) {
  var k = String(s || '').toUpperCase();
  return STATUS_CLS[k] || 'tag-gray';
}

Page({
  data: {
    list: [],
    loading: false,
    page: 1,
    pageSize: 20,
    hasMore: true,
    statusFilter: '',
    keyword: '',
    STATUS_MAP: STATUS_MAP,
    STATUS_OPTIONS: [
      { value: '', label: '全部状态' },
      { value: 'PENDING', label: '待领取' },
      { value: 'ACCEPTED', label: '已领取' },
      { value: 'IN_PROGRESS', label: '处理中' },
      { value: 'COMPLETED', label: '已完成' },
    ],
  },

  _STATUS_OPTIONS: [
    { value: '', label: '全部状态' },
    { value: 'PENDING', label: '待领取' },
    { value: 'ACCEPTED', label: '已领取' },
    { value: 'IN_PROGRESS', label: '处理中' },
    { value: 'COMPLETED', label: '已完成' },
  ],

  onLoad: function () {
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this._resetAndLoad();
  },

  onShow: function () {
    // 从详情页处理完返回，需刷新状态（避免显示旧状态）
    if (this._shownOnce) this._resetAndLoad();
    this._shownOnce = true;
  },

  onPullDownRefresh: function () {
    this._resetAndLoad().finally(function () { wx.stopPullDownRefresh(); });
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) this._loadData();
  },

  _resetAndLoad: function () {
    this.setData({ page: 1, list: [], hasMore: true });
    return this._loadData();
  },

  _loadData: function () {
    if (this.data.loading) return Promise.resolve();
    var that = this;
    this.setData({ loading: true });
    var params = { page: this.data.page, size: this.data.pageSize };
    if (this.data.statusFilter) params.status = this.data.statusFilter;
    if (this.data.keyword) params.keyword = this.data.keyword;

    return api.collaboration.myTasks(params).then(function (res) {
      var records = (res && (res.rows || res.records)) || [];
      var total = (res && res.total) || records.length;
      var enriched = records.map(function (r) {
        r.statusText = statusText(r.taskStatus);
        r.statusCls = statusCls(r.taskStatus);
        r.priorityText = PRIORITY_TEXT[String(r.priority || '').toUpperCase()] || '中';
        r.title = r.instruction || r.nextStep || '协作任务';
        r.isOverdue = !!r.overdue;
        return r;
      });
      that.setData({
        list: that.data.list.concat(enriched),
        hasMore: that.data.list.length + records.length < total,
        page: that.data.page + 1,
        loading: false,
      });
    }).catch(function (e) {
      that.setData({ loading: false });
      toast('加载失败: ' + (e.errMsg || e.message || e));
    });
  },

  onKeywordInput: function (e) {
    this.setData({ keyword: e.detail.value });
  },

  onKeywordSearch: function () {
    this._resetAndLoad();
  },

  onStatusFilterChange: function (e) {
    var idx = Number(e.detail.value);
    this.setData({ statusFilter: this._STATUS_OPTIONS[idx].value });
    this._resetAndLoad();
  },

  onTapItem: function (e) {
    var idx = e.currentTarget.dataset.index;
    var item = this.data.list[idx];
    if (!item) return;
    var id = item.id !== undefined && item.id !== null ? String(item.id) : '';
    if (!id) { toast('任务ID缺失'); return; }
    wx.navigateTo({ url: '/pages/collab-task/detail/index?taskId=' + encodeURIComponent(id) });
  },
});
