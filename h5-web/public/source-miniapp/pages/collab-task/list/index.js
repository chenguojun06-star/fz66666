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
// D-419：实底 status-badge 颜色（与样式表 --color-* 对齐）
var STATUS_COLOR = {
  PENDING: 'var(--color-warning)',
  ACCEPTED: 'var(--color-primary)',
  IN_PROGRESS: 'var(--color-primary)',
  COMPLETED: 'var(--color-success)',
  ESCALATED: 'var(--color-danger)',
  CANCELLED: 'var(--color-text-tertiary)',
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
function statusColor(s) {
  var k = String(s || '').toUpperCase();
  return STATUS_COLOR[k] || 'var(--color-text-tertiary)';
}

Page({
  data: {

    // D-533：可搜索选择器状态（原生 picker 没有搜索）

    pickerVisible: false,

    pickerTitle: '',

    pickerOptions: [],

    pickerValue: '',
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
        // D-419：实底 status-badge 用色
        r._statusColor = statusColor(r.taskStatus);
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

  /* ── D-533：可搜索选择器（原生 picker 没有搜索，选项多时只能一路滚）────────
     由 scripts/codemod-search-picker.py 注入，各页面内容一致。
     选中后回调页面原有的 onXxxChange（e.detail.value 为下标），既有逻辑不变。 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */
  openPicker: function (e) {
    var ds = e.currentTarget.dataset || {};
    if (!ds.handler && typeof this._openPickerByKey === 'function') {
      return this._openPickerByKey(e);
    }
    var arr = this.data[ds.names] || [];
    var rangeKey = ds.rangeKey || '';
    var opts = [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      var label;
      if (rangeKey) {
        label = it ? it[rangeKey] : '';
      } else if (it && typeof it === 'object') {
        label = it.label != null ? it.label : (it.name != null ? it.name : '');
      } else {
        label = it;
      }
      label = String(label == null ? '' : label);
      if (!label) continue;
      opts.push({ label: label, value: String(i) });
    }
    this._pickerHandler = ds.handler || '';
    this.setData({
      pickerTitle: ds.title || '请选择',
      pickerOptions: opts,
      pickerValue: '',
      pickerVisible: true,
    });
  },

  onPickerSelect: function (e) {
    var handler = this._pickerHandler;
    if (handler && typeof this[handler] === 'function') {
      this[handler]({ detail: { value: Number(e.detail.value) } });
      return;
    }
    if (typeof this._onPickerSelectByKey === 'function') {
      return this._onPickerSelectByKey(e);
    }
  },

  onPickerClose: function () {
    this.setData({ pickerVisible: false });
  },

});
